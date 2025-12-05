package fileops

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/user"
	"path/filepath"
	"sort"
	"strconv"
	"sync"
	"time"
)

// ChunkSize is the recommended chunk size for uploads (5MB)
const DefaultChunkSize = 5 * 1024 * 1024

// UploadSession represents an in-progress chunked upload
type UploadSession struct {
	ID             string            `json:"id"`
	Filename       string            `json:"filename"`
	TotalSize      int64             `json:"total_size"`
	ChunkSize      int64             `json:"chunk_size"`
	TotalChunks    int               `json:"total_chunks"`
	UploadedChunks map[int]bool      `json:"uploaded_chunks"`
	TargetPath     string            `json:"target_path"`
	TempDir        string            `json:"temp_dir"`
	CreatedAt      time.Time         `json:"created_at"`
	UpdatedAt      time.Time         `json:"updated_at"`
	ExpiresAt      time.Time         `json:"expires_at"`
	OwnerID        string            `json:"owner_id"`
	OwnerUsername  string            `json:"owner_username"` // System username for chown
	Metadata       map[string]string `json:"metadata,omitempty"`
	mu             sync.RWMutex
}

// UploadProgress represents the current progress of an upload
type UploadProgress struct {
	SessionID      string  `json:"session_id"`
	Filename       string  `json:"filename"`
	TotalSize      int64   `json:"total_size"`
	UploadedSize   int64   `json:"uploaded_size"`
	TotalChunks    int     `json:"total_chunks"`
	UploadedChunks int     `json:"uploaded_chunks"`
	Progress       float64 `json:"progress"` // 0-100
	Complete       bool    `json:"complete"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// ChunkedUploadManager manages chunked upload sessions
type ChunkedUploadManager struct {
	sessions     map[string]*UploadSession
	baseTempDir  string
	sessionTTL   time.Duration
	mu           sync.RWMutex
	cleanupDone  chan struct{}
}

// NewChunkedUploadManager creates a new chunked upload manager
func NewChunkedUploadManager(baseTempDir string) (*ChunkedUploadManager, error) {
	tempDir := filepath.Join(baseTempDir, "chunked_uploads")
	if err := os.MkdirAll(tempDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create temp directory: %w", err)
	}

	m := &ChunkedUploadManager{
		sessions:    make(map[string]*UploadSession),
		baseTempDir: tempDir,
		sessionTTL:  24 * time.Hour, // Sessions expire after 24 hours
		cleanupDone: make(chan struct{}),
	}

	// Restore existing sessions from disk
	m.restoreSessions()

	// Start cleanup goroutine
	go m.cleanupLoop()

	return m, nil
}

// Close stops the manager and cleans up resources
func (m *ChunkedUploadManager) Close() {
	close(m.cleanupDone)
}

// CreateSession creates a new upload session
func (m *ChunkedUploadManager) CreateSession(filename string, totalSize int64, targetPath string, ownerID string, ownerUsername string, chunkSize int64) (*UploadSession, error) {
	if chunkSize <= 0 {
		chunkSize = DefaultChunkSize
	}

	// Generate session ID
	idBytes := make([]byte, 16)
	if _, err := rand.Read(idBytes); err != nil {
		return nil, fmt.Errorf("failed to generate session ID: %w", err)
	}
	sessionID := hex.EncodeToString(idBytes)

	// Calculate total chunks
	totalChunks := int((totalSize + chunkSize - 1) / chunkSize)
	if totalChunks == 0 {
		totalChunks = 1
	}

	// Create temp directory for this session
	sessionTempDir := filepath.Join(m.baseTempDir, sessionID)
	if err := os.MkdirAll(sessionTempDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create session temp directory: %w", err)
	}

	now := time.Now()
	session := &UploadSession{
		ID:             sessionID,
		Filename:       filename,
		TotalSize:      totalSize,
		ChunkSize:      chunkSize,
		TotalChunks:    totalChunks,
		UploadedChunks: make(map[int]bool),
		TargetPath:     targetPath,
		TempDir:        sessionTempDir,
		CreatedAt:      now,
		UpdatedAt:      now,
		ExpiresAt:      now.Add(m.sessionTTL),
		OwnerID:        ownerID,
		OwnerUsername:  ownerUsername,
		Metadata:       make(map[string]string),
	}

	m.mu.Lock()
	m.sessions[sessionID] = session
	m.mu.Unlock()

	// Save session to disk for persistence
	session.save()

	return session, nil
}

// GetSession retrieves an upload session (without owner verification)
func (m *ChunkedUploadManager) GetSession(sessionID string) (*UploadSession, error) {
	m.mu.RLock()
	session, exists := m.sessions[sessionID]
	m.mu.RUnlock()

	if !exists {
		return nil, fmt.Errorf("session not found")
	}

	if time.Now().After(session.ExpiresAt) {
		m.DeleteSession(sessionID)
		return nil, fmt.Errorf("session expired")
	}

	return session, nil
}

// GetSessionWithOwner retrieves an upload session with owner verification
func (m *ChunkedUploadManager) GetSessionWithOwner(sessionID string, ownerID string) (*UploadSession, error) {
	session, err := m.GetSession(sessionID)
	if err != nil {
		return nil, err
	}

	// Verify ownership
	if session.OwnerID != ownerID {
		return nil, fmt.Errorf("access denied: you are not the owner of this upload session")
	}

	return session, nil
}

// VerifySessionOwner checks if the given ownerID owns the session
func (m *ChunkedUploadManager) VerifySessionOwner(sessionID string, ownerID string) bool {
	session, err := m.GetSession(sessionID)
	if err != nil {
		return false
	}
	return session.OwnerID == ownerID
}

// UploadChunk uploads a single chunk (without owner verification - use UploadChunkWithOwner for secure uploads)
// Deprecated: Use UploadChunkWithOwner instead to prevent session hijacking
func (m *ChunkedUploadManager) UploadChunk(sessionID string, chunkIndex int, data io.Reader) error {
	return m.uploadChunkInternal(sessionID, chunkIndex, data)
}

// UploadChunkWithOwner uploads a single chunk with owner verification to prevent session hijacking
func (m *ChunkedUploadManager) UploadChunkWithOwner(sessionID string, chunkIndex int, data io.Reader, ownerID string) error {
	session, err := m.GetSession(sessionID)
	if err != nil {
		return err
	}

	// Verify ownership to prevent session hijacking
	if session.OwnerID != ownerID {
		return fmt.Errorf("access denied: you are not the owner of this upload session")
	}

	return m.uploadChunkInternal(sessionID, chunkIndex, data)
}

// uploadChunkInternal is the internal implementation for chunk upload
func (m *ChunkedUploadManager) uploadChunkInternal(sessionID string, chunkIndex int, data io.Reader) error {
	session, err := m.GetSession(sessionID)
	if err != nil {
		return err
	}

	if chunkIndex < 0 || chunkIndex >= session.TotalChunks {
		return fmt.Errorf("invalid chunk index: %d (total chunks: %d)", chunkIndex, session.TotalChunks)
	}

	// Write chunk to temp file
	chunkPath := filepath.Join(session.TempDir, fmt.Sprintf("chunk_%d", chunkIndex))
	chunkFile, err := os.Create(chunkPath)
	if err != nil {
		return fmt.Errorf("failed to create chunk file: %w", err)
	}
	defer chunkFile.Close()

	written, err := io.Copy(chunkFile, data)
	if err != nil {
		os.Remove(chunkPath)
		return fmt.Errorf("failed to write chunk: %w", err)
	}

	// Validate chunk size (last chunk may be smaller)
	expectedSize := session.ChunkSize
	if chunkIndex == session.TotalChunks-1 {
		expectedSize = session.TotalSize - (int64(chunkIndex) * session.ChunkSize)
	}

	if written != expectedSize {
		os.Remove(chunkPath)
		return fmt.Errorf("chunk size mismatch: expected %d, got %d", expectedSize, written)
	}

	// Mark chunk as uploaded
	session.mu.Lock()
	session.UploadedChunks[chunkIndex] = true
	session.UpdatedAt = time.Now()
	session.mu.Unlock()

	session.save()

	return nil
}

// GetProgress returns the current upload progress
func (m *ChunkedUploadManager) GetProgress(sessionID string) (*UploadProgress, error) {
	session, err := m.GetSession(sessionID)
	if err != nil {
		return nil, err
	}

	session.mu.RLock()
	defer session.mu.RUnlock()

	uploadedChunks := len(session.UploadedChunks)
	uploadedSize := int64(uploadedChunks) * session.ChunkSize
	if uploadedSize > session.TotalSize {
		uploadedSize = session.TotalSize
	}

	progress := float64(uploadedChunks) / float64(session.TotalChunks) * 100

	return &UploadProgress{
		SessionID:      session.ID,
		Filename:       session.Filename,
		TotalSize:      session.TotalSize,
		UploadedSize:   uploadedSize,
		TotalChunks:    session.TotalChunks,
		UploadedChunks: uploadedChunks,
		Progress:       progress,
		Complete:       uploadedChunks == session.TotalChunks,
		CreatedAt:      session.CreatedAt,
		UpdatedAt:      session.UpdatedAt,
	}, nil
}

// IsComplete checks if all chunks have been uploaded
func (m *ChunkedUploadManager) IsComplete(sessionID string) (bool, error) {
	session, err := m.GetSession(sessionID)
	if err != nil {
		return false, err
	}

	session.mu.RLock()
	defer session.mu.RUnlock()

	return len(session.UploadedChunks) == session.TotalChunks, nil
}

// Finalize assembles all chunks into the final file (without owner verification)
// Deprecated: Use FinalizeWithOwner instead to prevent unauthorized finalization
func (m *ChunkedUploadManager) Finalize(sessionID string) (string, error) {
	return m.finalizeInternal(sessionID)
}

// FinalizeWithOwner assembles all chunks into the final file with owner verification
func (m *ChunkedUploadManager) FinalizeWithOwner(sessionID string, ownerID string) (string, error) {
	session, err := m.GetSession(sessionID)
	if err != nil {
		return "", err
	}

	// Verify ownership to prevent unauthorized finalization
	if session.OwnerID != ownerID {
		return "", fmt.Errorf("access denied: you are not the owner of this upload session")
	}

	return m.finalizeInternal(sessionID)
}

// finalizeInternal is the internal implementation for finalization
func (m *ChunkedUploadManager) finalizeInternal(sessionID string) (string, error) {
	session, err := m.GetSession(sessionID)
	if err != nil {
		return "", err
	}

	complete, err := m.IsComplete(sessionID)
	if err != nil {
		return "", err
	}
	if !complete {
		return "", fmt.Errorf("upload not complete")
	}

	// TargetPath is the directory, combine with filename for final path
	finalPath := filepath.Join(session.TargetPath, session.Filename)

	// Ensure target directory exists and set proper ownership
	targetDir := filepath.Dir(finalPath)
	if err := os.MkdirAll(targetDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create target directory: %w", err)
	}

	// Set directory ownership if we have a username
	if session.OwnerUsername != "" {
		if u, err := user.Lookup(session.OwnerUsername); err == nil {
			uid, _ := strconv.Atoi(u.Uid)
			gid, _ := strconv.Atoi(u.Gid)
			// Chown the target directory (session.TargetPath) to ensure user owns it
			os.Chown(session.TargetPath, uid, gid)
		}
	}

	// Create final file
	finalFile, err := os.Create(finalPath)
	if err != nil {
		return "", fmt.Errorf("failed to create final file: %w", err)
	}
	defer finalFile.Close()

	// Get sorted chunk indices
	indices := make([]int, 0, session.TotalChunks)
	for i := range session.UploadedChunks {
		indices = append(indices, i)
	}
	sort.Ints(indices)

	// Assemble chunks
	for _, i := range indices {
		chunkPath := filepath.Join(session.TempDir, fmt.Sprintf("chunk_%d", i))
		chunkFile, err := os.Open(chunkPath)
		if err != nil {
			finalFile.Close()
			os.Remove(finalPath)
			return "", fmt.Errorf("failed to open chunk %d: %w", i, err)
		}

		if _, err := io.Copy(finalFile, chunkFile); err != nil {
			chunkFile.Close()
			finalFile.Close()
			os.Remove(finalPath)
			return "", fmt.Errorf("failed to write chunk %d: %w", i, err)
		}
		chunkFile.Close()
	}

	// Verify final file size
	stat, err := finalFile.Stat()
	if err != nil {
		return "", fmt.Errorf("failed to stat final file: %w", err)
	}

	if stat.Size() != session.TotalSize {
		os.Remove(finalPath)
		return "", fmt.Errorf("final file size mismatch: expected %d, got %d", session.TotalSize, stat.Size())
	}

	// Set file permissions and ownership
	if session.OwnerUsername != "" {
		u, err := user.Lookup(session.OwnerUsername)
		if err != nil {
			os.Remove(finalPath)
			return "", fmt.Errorf("failed to lookup user %s: %w", session.OwnerUsername, err)
		}
		uid, _ := strconv.Atoi(u.Uid)
		gid, _ := strconv.Atoi(u.Gid)

		// Set file permissions (rw-r--r--)
		if err := os.Chmod(finalPath, 0644); err != nil {
			os.Remove(finalPath)
			return "", fmt.Errorf("failed to set file permissions: %w", err)
		}

		// Set file ownership
		if err := os.Chown(finalPath, uid, gid); err != nil {
			os.Remove(finalPath)
			return "", fmt.Errorf("failed to set file ownership: %w", err)
		}
	}

	// Clean up session
	m.DeleteSession(sessionID)

	return finalPath, nil
}

// DeleteSession removes a session and its temporary files
func (m *ChunkedUploadManager) DeleteSession(sessionID string) error {
	m.mu.Lock()
	session, exists := m.sessions[sessionID]
	if exists {
		delete(m.sessions, sessionID)
	}
	m.mu.Unlock()

	if !exists {
		return nil
	}

	// Remove temp directory
	if session.TempDir != "" {
		os.RemoveAll(session.TempDir)
	}

	return nil
}

// GetMissingChunks returns the indices of chunks that haven't been uploaded yet
func (m *ChunkedUploadManager) GetMissingChunks(sessionID string) ([]int, error) {
	session, err := m.GetSession(sessionID)
	if err != nil {
		return nil, err
	}

	session.mu.RLock()
	defer session.mu.RUnlock()

	var missing []int
	for i := 0; i < session.TotalChunks; i++ {
		if !session.UploadedChunks[i] {
			missing = append(missing, i)
		}
	}

	return missing, nil
}

// ListUserSessions lists all active sessions for a user
func (m *ChunkedUploadManager) ListUserSessions(ownerID string) []*UploadProgress {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var sessions []*UploadProgress
	for _, session := range m.sessions {
		if session.OwnerID == ownerID {
			session.mu.RLock()
			uploadedChunks := len(session.UploadedChunks)
			uploadedSize := int64(uploadedChunks) * session.ChunkSize
			if uploadedSize > session.TotalSize {
				uploadedSize = session.TotalSize
			}
			progress := float64(uploadedChunks) / float64(session.TotalChunks) * 100

			sessions = append(sessions, &UploadProgress{
				SessionID:      session.ID,
				Filename:       session.Filename,
				TotalSize:      session.TotalSize,
				UploadedSize:   uploadedSize,
				TotalChunks:    session.TotalChunks,
				UploadedChunks: uploadedChunks,
				Progress:       progress,
				Complete:       uploadedChunks == session.TotalChunks,
				CreatedAt:      session.CreatedAt,
				UpdatedAt:      session.UpdatedAt,
			})
			session.mu.RUnlock()
		}
	}

	return sessions
}

// save persists session metadata to disk
func (s *UploadSession) save() error {
	s.mu.RLock()
	defer s.mu.RUnlock()

	metaPath := filepath.Join(s.TempDir, "session.json")
	data, err := json.Marshal(s)
	if err != nil {
		return err
	}

	return os.WriteFile(metaPath, data, 0644)
}

// restoreSessions restores sessions from disk after restart
func (m *ChunkedUploadManager) restoreSessions() {
	entries, err := os.ReadDir(m.baseTempDir)
	if err != nil {
		return
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		metaPath := filepath.Join(m.baseTempDir, entry.Name(), "session.json")
		data, err := os.ReadFile(metaPath)
		if err != nil {
			continue
		}

		var session UploadSession
		if err := json.Unmarshal(data, &session); err != nil {
			continue
		}

		// Skip expired sessions
		if time.Now().After(session.ExpiresAt) {
			os.RemoveAll(filepath.Join(m.baseTempDir, entry.Name()))
			continue
		}

		m.mu.Lock()
		m.sessions[session.ID] = &session
		m.mu.Unlock()
	}
}

// cleanupLoop periodically cleans up expired sessions
func (m *ChunkedUploadManager) cleanupLoop() {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			m.cleanupExpired()
		case <-m.cleanupDone:
			return
		}
	}
}

// cleanupExpired removes all expired sessions
func (m *ChunkedUploadManager) cleanupExpired() {
	m.mu.Lock()
	defer m.mu.Unlock()

	now := time.Now()
	for id, session := range m.sessions {
		if now.After(session.ExpiresAt) {
			if session.TempDir != "" {
				os.RemoveAll(session.TempDir)
			}
			delete(m.sessions, id)
		}
	}
}
