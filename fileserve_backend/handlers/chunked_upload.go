package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"

	"fileserv/internal/fileops"
	"fileserv/middleware"
	"fileserv/storage"

	"github.com/go-chi/chi/v5"
)

// ChunkedUploadHandler handles chunked file uploads
type ChunkedUploadHandler struct {
	store   storage.DataStore
	manager *fileops.ChunkedUploadManager
}

// NewChunkedUploadHandler creates a new chunked upload handler
func NewChunkedUploadHandler(store storage.DataStore, manager *fileops.ChunkedUploadManager) *ChunkedUploadHandler {
	return &ChunkedUploadHandler{
		store:   store,
		manager: manager,
	}
}

// CreateUploadSessionRequest is the request body for creating an upload session
type CreateUploadSessionRequest struct {
	Filename   string `json:"filename"`
	TotalSize  int64  `json:"total_size"`
	TargetPath string `json:"target_path"`
	ZoneID     string `json:"zone_id,omitempty"`
	ChunkSize  int64  `json:"chunk_size,omitempty"` // Optional, defaults to 5MB
}

// CreateUploadSessionResponse is the response for creating an upload session
type CreateUploadSessionResponse struct {
	SessionID    string `json:"session_id"`
	ChunkSize    int64  `json:"chunk_size"`
	TotalChunks  int    `json:"total_chunks"`
	UploadURL    string `json:"upload_url"`
	FinalizeURL  string `json:"finalize_url"`
	ProgressURL  string `json:"progress_url"`
}

// CreateSession creates a new chunked upload session
func (h *ChunkedUploadHandler) CreateSession(w http.ResponseWriter, r *http.Request) {
	userCtx := middleware.GetUserContext(r)
	if userCtx == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req CreateUploadSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Filename == "" {
		http.Error(w, "Filename is required", http.StatusBadRequest)
		return
	}

	if req.TotalSize <= 0 {
		http.Error(w, "Total size must be positive", http.StatusBadRequest)
		return
	}

	if req.TargetPath == "" {
		http.Error(w, "Target path is required", http.StatusBadRequest)
		return
	}

	// If zone is specified, validate access and check pool limits
	if req.ZoneID != "" {
		zone, err := h.store.GetShareZone(req.ZoneID)
		if err != nil {
			http.Error(w, "Zone not found", http.StatusNotFound)
			return
		}

		pool, err := h.store.GetStoragePool(zone.PoolID)
		if err != nil {
			http.Error(w, "Pool not found", http.StatusNotFound)
			return
		}

		// Check file size limit
		if pool.MaxFileSize > 0 && req.TotalSize > pool.MaxFileSize {
			http.Error(w, fmt.Sprintf("File size exceeds maximum allowed size of %d bytes", pool.MaxFileSize), http.StatusRequestEntityTooLarge)
			return
		}

		// Validate file type against pool restrictions
		opts := &fileops.TransferOptions{
			MaxFileSize:  pool.MaxFileSize,
			AllowedTypes: pool.AllowedTypes,
			DeniedTypes:  pool.DeniedTypes,
		}

		if err := fileops.ValidateUpload(req.Filename, req.TotalSize, opts); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
	}

	// Create session
	session, err := h.manager.CreateSession(
		req.Filename,
		req.TotalSize,
		req.TargetPath,
		userCtx.UserID,
		req.ChunkSize,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	resp := CreateUploadSessionResponse{
		SessionID:    session.ID,
		ChunkSize:    session.ChunkSize,
		TotalChunks:  session.TotalChunks,
		UploadURL:    fmt.Sprintf("/api/uploads/%s/chunks", session.ID),
		FinalizeURL:  fmt.Sprintf("/api/uploads/%s/finalize", session.ID),
		ProgressURL:  fmt.Sprintf("/api/uploads/%s/progress", session.ID),
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(resp)
}

// UploadChunk uploads a single chunk
func (h *ChunkedUploadHandler) UploadChunk(w http.ResponseWriter, r *http.Request) {
	userCtx := middleware.GetUserContext(r)
	if userCtx == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	sessionID := chi.URLParam(r, "sessionId")

	// Get chunk index from URL path param, query, or header
	chunkIndexStr := chi.URLParam(r, "chunkIndex")
	if chunkIndexStr == "" {
		chunkIndexStr = r.URL.Query().Get("index")
	}
	if chunkIndexStr == "" {
		chunkIndexStr = r.Header.Get("X-Chunk-Index")
	}
	if chunkIndexStr == "" {
		http.Error(w, "Chunk index is required", http.StatusBadRequest)
		return
	}

	chunkIndex, err := strconv.Atoi(chunkIndexStr)
	if err != nil {
		http.Error(w, "Invalid chunk index", http.StatusBadRequest)
		return
	}

	// Verify session ownership
	session, err := h.manager.GetSession(sessionID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	if session.OwnerID != userCtx.UserID && !userCtx.IsAdmin {
		http.Error(w, "Access denied", http.StatusForbidden)
		return
	}

	// Handle multipart or raw body
	var reader io.Reader

	contentType := r.Header.Get("Content-Type")
	if contentType != "" && contentType[:19] == "multipart/form-data" {
		// Parse as multipart
		if err := r.ParseMultipartForm(int64(session.ChunkSize) + 1024*1024); err != nil {
			http.Error(w, "Failed to parse form", http.StatusBadRequest)
			return
		}

		file, _, err := r.FormFile("chunk")
		if err != nil {
			http.Error(w, "Chunk file is required", http.StatusBadRequest)
			return
		}
		defer file.Close()
		reader = file
	} else {
		// Raw binary body
		reader = r.Body
	}

	// Upload the chunk
	if err := h.manager.UploadChunk(sessionID, chunkIndex, reader); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Return progress
	progress, err := h.manager.GetProgress(sessionID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(progress)
}

// GetProgress returns the current upload progress
func (h *ChunkedUploadHandler) GetProgress(w http.ResponseWriter, r *http.Request) {
	userCtx := middleware.GetUserContext(r)
	if userCtx == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	sessionID := chi.URLParam(r, "sessionId")

	// Verify session ownership
	session, err := h.manager.GetSession(sessionID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	if session.OwnerID != userCtx.UserID && !userCtx.IsAdmin {
		http.Error(w, "Access denied", http.StatusForbidden)
		return
	}

	progress, err := h.manager.GetProgress(sessionID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(progress)
}

// GetMissingChunks returns the indices of chunks that haven't been uploaded
func (h *ChunkedUploadHandler) GetMissingChunks(w http.ResponseWriter, r *http.Request) {
	userCtx := middleware.GetUserContext(r)
	if userCtx == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	sessionID := chi.URLParam(r, "sessionId")

	// Verify session ownership
	session, err := h.manager.GetSession(sessionID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	if session.OwnerID != userCtx.UserID && !userCtx.IsAdmin {
		http.Error(w, "Access denied", http.StatusForbidden)
		return
	}

	missing, err := h.manager.GetMissingChunks(sessionID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"missing_chunks": missing,
		"count":          len(missing),
	})
}

// Finalize assembles all chunks into the final file
func (h *ChunkedUploadHandler) Finalize(w http.ResponseWriter, r *http.Request) {
	userCtx := middleware.GetUserContext(r)
	if userCtx == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	sessionID := chi.URLParam(r, "sessionId")

	// Verify session ownership
	session, err := h.manager.GetSession(sessionID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	if session.OwnerID != userCtx.UserID && !userCtx.IsAdmin {
		http.Error(w, "Access denied", http.StatusForbidden)
		return
	}

	finalPath, err := h.manager.Finalize(sessionID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Upload completed successfully",
		"path":    finalPath,
	})
}

// CancelSession cancels and cleans up an upload session
func (h *ChunkedUploadHandler) CancelSession(w http.ResponseWriter, r *http.Request) {
	userCtx := middleware.GetUserContext(r)
	if userCtx == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	sessionID := chi.URLParam(r, "sessionId")

	// Verify session ownership
	session, err := h.manager.GetSession(sessionID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	if session.OwnerID != userCtx.UserID && !userCtx.IsAdmin {
		http.Error(w, "Access denied", http.StatusForbidden)
		return
	}

	if err := h.manager.DeleteSession(sessionID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Upload session cancelled",
	})
}

// ListMySessions lists all active upload sessions for the current user
func (h *ChunkedUploadHandler) ListMySessions(w http.ResponseWriter, r *http.Request) {
	userCtx := middleware.GetUserContext(r)
	if userCtx == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	sessions := h.manager.ListUserSessions(userCtx.UserID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(sessions)
}
