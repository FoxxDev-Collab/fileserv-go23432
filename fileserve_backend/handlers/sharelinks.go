package handlers

import (
	"archive/zip"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"os"
	osuser "os/user"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"fileserv/internal/fileops"
	"fileserv/models"
	"fileserv/storage"

	"github.com/go-chi/chi/v5"
	"golang.org/x/crypto/bcrypt"
)

type ShareLinkHandler struct {
	store   storage.DataStore
	dataDir string
}

func NewShareLinkHandler(store storage.DataStore, dataDir string) *ShareLinkHandler {
	return &ShareLinkHandler{store: store, dataDir: dataDir}
}

// generateToken generates a URL-safe random token
func generateToken() string {
	b := make([]byte, 24)
	rand.Read(b)
	return base64.URLEncoding.EncodeToString(b)
}

// GetMyShareLinks returns all share links owned by the current user
func (h *ShareLinkHandler) GetMyShareLinks(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value("user_id").(string)

	links := h.store.ListShareLinksByOwner(userID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(links)
}

// GetAllShareLinks returns all share links (admin only)
func (h *ShareLinkHandler) GetAllShareLinks(w http.ResponseWriter, r *http.Request) {
	links := h.store.ListShareLinks()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(links)
}

// GetShareLink returns a single share link
func (h *ShareLinkHandler) GetShareLink(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := r.Context().Value("user_id").(string)
	isAdmin := r.Context().Value("is_admin").(bool)

	link, err := h.store.GetShareLink(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	// Check ownership (admins can view any link)
	if !isAdmin && link.OwnerID != userID {
		http.Error(w, "Access denied", http.StatusForbidden)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(link)
}

// CreateShareLink creates a new share link
func (h *ShareLinkHandler) CreateShareLink(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value("user_id").(string)

	var req struct {
		TargetPath    string  `json:"target_path"`
		Name          string  `json:"name"`
		Description   string  `json:"description"`
		Password      string  `json:"password"`
		ExpiresIn     int     `json:"expires_in"` // hours, 0 = no expiry
		MaxDownloads  int     `json:"max_downloads"`
		MaxViews      int     `json:"max_views"`
		AllowDownload bool    `json:"allow_download"`
		AllowPreview  bool    `json:"allow_preview"`
		AllowUpload   bool    `json:"allow_upload"`
		AllowListing  bool    `json:"allow_listing"`
		ShowOwner     bool    `json:"show_owner"`
		CustomMessage string  `json:"custom_message"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.TargetPath == "" {
		http.Error(w, "Target path is required", http.StatusBadRequest)
		return
	}

	// Validate and get full path
	fullPath := filepath.Join(h.dataDir, filepath.Clean(req.TargetPath))
	if !strings.HasPrefix(fullPath, h.dataDir) {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	// Check if path exists
	info, err := os.Stat(fullPath)
	if err != nil {
		if os.IsNotExist(err) {
			http.Error(w, "File or folder not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Cannot access path", http.StatusInternalServerError)
		return
	}

	// Determine target type
	targetType := "file"
	if info.IsDir() {
		targetType = "folder"
	}

	// Generate token
	token := generateToken()

	// Create the link
	link := models.NewShareLink(userID, req.TargetPath, targetType, filepath.Base(req.TargetPath), token)

	// Apply custom settings
	if req.Name != "" {
		link.Name = req.Name
	} else {
		link.Name = filepath.Base(req.TargetPath)
	}
	link.Description = req.Description
	link.CustomMessage = req.CustomMessage
	link.ShowOwner = req.ShowOwner
	link.MaxDownloads = req.MaxDownloads
	link.MaxViews = req.MaxViews
	link.AllowDownload = req.AllowDownload
	link.AllowPreview = req.AllowPreview
	link.AllowUpload = req.AllowUpload && targetType == "folder"
	link.AllowListing = req.AllowListing || targetType == "folder"

	// Set expiration
	if req.ExpiresIn > 0 {
		expires := time.Now().Add(time.Duration(req.ExpiresIn) * time.Hour)
		link.ExpiresAt = &expires
	} else if req.ExpiresIn == 0 {
		// Default: 7 days
		expires := time.Now().Add(7 * 24 * time.Hour)
		link.ExpiresAt = &expires
	}
	// ExpiresIn < 0 means no expiry

	// Hash password if provided
	if req.Password != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			http.Error(w, "Failed to hash password", http.StatusInternalServerError)
			return
		}
		link.PasswordHash = string(hash)
	}

	created, err := h.store.CreateShareLink(link)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(created)
}

// UpdateShareLink updates an existing share link
func (h *ShareLinkHandler) UpdateShareLink(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := r.Context().Value("user_id").(string)
	isAdmin := r.Context().Value("is_admin").(bool)

	link, err := h.store.GetShareLink(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	// Check ownership
	if !isAdmin && link.OwnerID != userID {
		http.Error(w, "Access denied", http.StatusForbidden)
		return
	}

	var updates map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&updates); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Handle password update separately
	if password, ok := updates["password"].(string); ok && password != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			http.Error(w, "Failed to hash password", http.StatusInternalServerError)
			return
		}
		updates["password_hash"] = string(hash)
		delete(updates, "password")
	}

	updated, err := h.store.UpdateShareLink(id, updates)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(updated)
}

// DeleteShareLink deletes a share link
func (h *ShareLinkHandler) DeleteShareLink(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := r.Context().Value("user_id").(string)
	isAdmin := r.Context().Value("is_admin").(bool)

	link, err := h.store.GetShareLink(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	// Check ownership
	if !isAdmin && link.OwnerID != userID {
		http.Error(w, "Access denied", http.StatusForbidden)
		return
	}

	if err := h.store.DeleteShareLink(id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Share link deleted"})
}

// ============================================================================
// Public Access Handlers (No Auth Required)
// ============================================================================

type PublicHandler struct {
	store   storage.DataStore
	dataDir string
}

func NewPublicHandler(store storage.DataStore, dataDir string) *PublicHandler {
	return &PublicHandler{store: store, dataDir: dataDir}
}

// GetPublicShare returns public share info
func (h *PublicHandler) GetPublicShare(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")

	link, err := h.store.GetShareLinkByToken(token)
	if err != nil {
		http.Error(w, "Share not found", http.StatusNotFound)
		return
	}

	// Check if accessible
	if !link.IsAccessible() {
		if link.IsExpired() {
			http.Error(w, "This share link has expired", http.StatusGone)
		} else if link.IsViewLimitReached() {
			http.Error(w, "This share link has reached its view limit", http.StatusGone)
		} else {
			http.Error(w, "This share link is not available", http.StatusGone)
		}
		return
	}

	// Increment view count
	h.store.IncrementShareLinkView(link.ID)

	// Get file info
	fullPath := filepath.Join(h.dataDir, filepath.Clean(link.TargetPath))
	info, err := os.Stat(fullPath)
	if err != nil {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}

	// Get owner name if show_owner is true
	var ownerName string
	if link.ShowOwner {
		owner, err := h.store.GetUserByID(link.OwnerID)
		if err == nil {
			ownerName = owner.Username
		}
	}

	// Build public info
	publicInfo := models.PublicShareInfo{
		Token:            link.Token,
		Name:             link.Name,
		Description:      link.Description,
		TargetType:       link.TargetType,
		TargetName:       link.TargetName,
		CustomMessage:    link.CustomMessage,
		ShowOwner:        link.ShowOwner,
		OwnerName:        ownerName,
		AllowDownload:    link.AllowDownload && link.CanDownload(),
		AllowPreview:     link.AllowPreview,
		AllowUpload:      link.AllowUpload,
		AllowListing:     link.AllowListing,
		RequiresPassword: link.PasswordHash != "",
		ExpiresAt:        link.ExpiresAt,
		CreatedAt:        link.CreatedAt,
	}

	if !info.IsDir() {
		publicInfo.Size = info.Size()
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(publicInfo)
}

// VerifySharePassword verifies the password for a protected share
func (h *PublicHandler) VerifySharePassword(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")

	var req struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	link, err := h.store.GetShareLinkByToken(token)
	if err != nil {
		http.Error(w, "Share not found", http.StatusNotFound)
		return
	}

	if link.PasswordHash == "" {
		// No password required
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]bool{"valid": true})
		return
	}

	// Verify password
	err = bcrypt.CompareHashAndPassword([]byte(link.PasswordHash), []byte(req.Password))
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]bool{"valid": false})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"valid": true})
}

// ListPublicShare lists contents of a shared folder
func (h *PublicHandler) ListPublicShare(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	subPath := r.URL.Query().Get("path")

	link, err := h.store.GetShareLinkByToken(token)
	if err != nil {
		http.Error(w, "Share not found", http.StatusNotFound)
		return
	}

	if !link.IsAccessible() {
		http.Error(w, "Share not available", http.StatusGone)
		return
	}

	if !link.AllowListing {
		http.Error(w, "Listing not allowed", http.StatusForbidden)
		return
	}

	// Build path
	targetPath := filepath.Join(h.dataDir, filepath.Clean(link.TargetPath))
	if subPath != "" {
		targetPath = filepath.Join(targetPath, filepath.Clean(subPath))
	}

	// Ensure path is within share
	if !strings.HasPrefix(targetPath, filepath.Join(h.dataDir, filepath.Clean(link.TargetPath))) {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	info, err := os.Stat(targetPath)
	if err != nil {
		http.Error(w, "Path not found", http.StatusNotFound)
		return
	}

	if !info.IsDir() {
		http.Error(w, "Not a directory", http.StatusBadRequest)
		return
	}

	entries, err := os.ReadDir(targetPath)
	if err != nil {
		http.Error(w, "Cannot read directory", http.StatusInternalServerError)
		return
	}

	files := make([]models.PublicFileInfo, 0, len(entries))
	for _, entry := range entries {
		info, err := entry.Info()
		if err != nil {
			continue
		}

		relPath := subPath
		if relPath != "" {
			relPath = filepath.Join(relPath, entry.Name())
		} else {
			relPath = entry.Name()
		}

		files = append(files, models.PublicFileInfo{
			Name:    entry.Name(),
			Path:    relPath,
			Size:    info.Size(),
			IsDir:   entry.IsDir(),
			ModTime: info.ModTime(),
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(files)
}

// DownloadPublicShare downloads a file or folder from a public share
func (h *PublicHandler) DownloadPublicShare(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	subPath := r.URL.Query().Get("path")

	link, err := h.store.GetShareLinkByToken(token)
	if err != nil {
		http.Error(w, "Share not found", http.StatusNotFound)
		return
	}

	if !link.IsAccessible() {
		http.Error(w, "Share not available", http.StatusGone)
		return
	}

	if !link.CanDownload() {
		http.Error(w, "Downloads not allowed or limit reached", http.StatusForbidden)
		return
	}

	// Build path
	targetPath := filepath.Join(h.dataDir, filepath.Clean(link.TargetPath))
	if subPath != "" {
		targetPath = filepath.Join(targetPath, filepath.Clean(subPath))
	}

	// Ensure path is within share
	basePath := filepath.Join(h.dataDir, filepath.Clean(link.TargetPath))
	if !strings.HasPrefix(targetPath, basePath) {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	info, err := os.Stat(targetPath)
	if err != nil {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}

	// Increment download count
	h.store.IncrementShareLinkDownload(link.ID)

	if info.IsDir() {
		// Create zip archive
		w.Header().Set("Content-Type", "application/zip")
		w.Header().Set("Content-Disposition", "attachment; filename=\""+filepath.Base(targetPath)+".zip\"")

		zipWriter := zip.NewWriter(w)
		defer zipWriter.Close()

		filepath.Walk(targetPath, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return err
			}

			// Get relative path
			relPath, err := filepath.Rel(targetPath, path)
			if err != nil {
				return err
			}

			if info.IsDir() {
				if relPath != "." {
					_, err := zipWriter.Create(relPath + "/")
					return err
				}
				return nil
			}

			writer, err := zipWriter.Create(relPath)
			if err != nil {
				return err
			}

			file, err := os.Open(path)
			if err != nil {
				return err
			}
			defer file.Close()

			_, err = io.Copy(writer, file)
			return err
		})
	} else {
		// Single file download with Range support for resumable downloads
		opts := &fileops.TransferOptions{
			ForceDownload: true,
			Filename:      filepath.Base(targetPath),
		}
		if err := fileops.ServeFileWithRange(w, r, targetPath, opts); err != nil {
			if os.IsNotExist(err) {
				http.Error(w, "File not found", http.StatusNotFound)
			} else {
				http.Error(w, "Cannot serve file", http.StatusInternalServerError)
			}
		}
	}
}

// PreviewPublicFile returns file content for preview
func (h *PublicHandler) PreviewPublicFile(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	subPath := r.URL.Query().Get("path")

	link, err := h.store.GetShareLinkByToken(token)
	if err != nil {
		http.Error(w, "Share not found", http.StatusNotFound)
		return
	}

	if !link.IsAccessible() {
		http.Error(w, "Share not available", http.StatusGone)
		return
	}

	if !link.AllowPreview {
		http.Error(w, "Preview not allowed", http.StatusForbidden)
		return
	}

	// Build path
	targetPath := filepath.Join(h.dataDir, filepath.Clean(link.TargetPath))
	if subPath != "" {
		targetPath = filepath.Join(targetPath, filepath.Clean(subPath))
	}

	// Ensure path is within share
	basePath := filepath.Join(h.dataDir, filepath.Clean(link.TargetPath))
	if !strings.HasPrefix(targetPath, basePath) {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	info, err := os.Stat(targetPath)
	if err != nil {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}

	if info.IsDir() {
		http.Error(w, "Cannot preview directory", http.StatusBadRequest)
		return
	}

	// Detect content type
	ext := strings.ToLower(filepath.Ext(targetPath))
	contentType := "application/octet-stream"

	switch ext {
	case ".txt", ".md", ".json", ".xml", ".yaml", ".yml", ".log", ".csv":
		contentType = "text/plain"
	case ".html", ".htm":
		contentType = "text/html"
	case ".css":
		contentType = "text/css"
	case ".js":
		contentType = "text/javascript"
	case ".jpg", ".jpeg":
		contentType = "image/jpeg"
	case ".png":
		contentType = "image/png"
	case ".gif":
		contentType = "image/gif"
	case ".webp":
		contentType = "image/webp"
	case ".svg":
		contentType = "image/svg+xml"
	case ".pdf":
		contentType = "application/pdf"
	case ".mp4":
		contentType = "video/mp4"
	case ".webm":
		contentType = "video/webm"
	case ".mp3":
		contentType = "audio/mpeg"
	case ".wav":
		contentType = "audio/wav"
	case ".ogg":
		contentType = "audio/ogg"
	}

	// Use Range support for media seeking (video/audio)
	opts := &fileops.TransferOptions{
		ForceDownload: false,
		Filename:      filepath.Base(targetPath),
		ContentType:   contentType,
	}
	if err := fileops.ServeFileWithRange(w, r, targetPath, opts); err != nil {
		if os.IsNotExist(err) {
			http.Error(w, "File not found", http.StatusNotFound)
		} else {
			http.Error(w, "Cannot serve file", http.StatusInternalServerError)
		}
	}
}

// UploadToPublicShare uploads a file to a shared folder
func (h *PublicHandler) UploadToPublicShare(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")

	link, err := h.store.GetShareLinkByToken(token)
	if err != nil {
		http.Error(w, "Share not found", http.StatusNotFound)
		return
	}

	if !link.IsAccessible() {
		http.Error(w, "Share not available", http.StatusGone)
		return
	}

	if !link.AllowUpload {
		http.Error(w, "Upload not allowed", http.StatusForbidden)
		return
	}

	if link.TargetType != "folder" {
		http.Error(w, "Can only upload to folders", http.StatusBadRequest)
		return
	}

	// Parse multipart form (32MB max)
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		http.Error(w, "Failed to parse form", http.StatusBadRequest)
		return
	}

	subPath := r.FormValue("path")
	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "No file provided", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Build target path
	targetDir := filepath.Join(h.dataDir, filepath.Clean(link.TargetPath))
	if subPath != "" {
		targetDir = filepath.Join(targetDir, filepath.Clean(subPath))
	}

	// Ensure path is within share
	basePath := filepath.Join(h.dataDir, filepath.Clean(link.TargetPath))
	if !strings.HasPrefix(targetDir, basePath) {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	// Create directory if needed
	if err := os.MkdirAll(targetDir, 0755); err != nil {
		http.Error(w, "Cannot create directory", http.StatusInternalServerError)
		return
	}

	// Save file
	targetPath := filepath.Join(targetDir, filepath.Base(header.Filename))
	dst, err := os.Create(targetPath)
	if err != nil {
		http.Error(w, "Cannot create file", http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		http.Error(w, "Failed to save file", http.StatusInternalServerError)
		return
	}

	// Set ownership to the share link owner
	if link.OwnerID != "" {
		// Look up the owner user to get their username
		if owner, err := h.store.GetUserByID(link.OwnerID); err == nil && owner != nil {
			if u, err := osuser.Lookup(owner.Username); err == nil {
				uid, _ := strconv.Atoi(u.Uid)
				gid, _ := strconv.Atoi(u.Gid)
				os.Chown(targetPath, uid, gid)
				// Also chown any newly created directories
				os.Chown(targetDir, uid, gid)
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message":  "File uploaded successfully",
		"filename": header.Filename,
	})
}
