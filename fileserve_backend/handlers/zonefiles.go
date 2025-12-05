package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	osuser "os/user"
	"path/filepath"
	"strconv"
	"strings"

	"fileserv/internal/fileops"
	"fileserv/middleware"
	"fileserv/models"
	"fileserv/storage"

	"github.com/go-chi/chi/v5"
)

// ZoneFileHandler handles file operations within zones
type ZoneFileHandler struct {
	store storage.DataStore
}

// NewZoneFileHandler creates a new zone file handler
func NewZoneFileHandler(store storage.DataStore) *ZoneFileHandler {
	return &ZoneFileHandler{store: store}
}

// GetUserZones returns all zones accessible to the current user
func (h *ZoneFileHandler) GetUserZones(w http.ResponseWriter, r *http.Request) {
	userCtx := middleware.GetUserContext(r)
	if userCtx == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	user := userFromContext(userCtx)
	zones := h.store.ListShareZones()
	pools := h.store.ListStoragePools()

	// Build pool lookup map
	poolMap := make(map[string]*models.StoragePool)
	for _, pool := range pools {
		poolMap[pool.ID] = pool
	}

	var accessibleZones []models.UserZoneInfo
	for _, zone := range zones {
		if !zone.UserHasZoneAccess(user) {
			continue
		}

		pool, ok := poolMap[zone.PoolID]
		if !ok || !pool.Enabled {
			continue
		}

		// Calculate the full path
		fullPath := filepath.Join(pool.Path, zone.Path)

		// For personal zones, add username subdirectory
		userPath := ""
		if zone.ZoneType == models.ZoneTypePersonal {
			userPath = user.Username
			fullPath = filepath.Join(fullPath, user.Username)

			// Auto-provision user directory if needed
			if zone.AutoProvision {
				if err := os.MkdirAll(fullPath, 0755); err != nil {
					// Log error but continue
					continue
				}
				// Set ownership of the auto-provisioned directory
				if u, err := osuser.Lookup(user.Username); err == nil {
					uid, _ := strconv.Atoi(u.Uid)
					gid, _ := strconv.Atoi(u.Gid)
					os.Chown(fullPath, uid, gid)
				}
			}
		}

		info := models.UserZoneInfo{
			ZoneID:      zone.ID,
			ZoneName:    zone.Name,
			ZoneType:    zone.ZoneType,
			PoolID:      pool.ID,
			PoolName:    pool.Name,
			FullPath:    fullPath,
			UserPath:    userPath,
			Description: zone.Description,
			CanUpload:   !zone.ReadOnly,
			CanShare:    zone.AllowWebShares,
		}
		accessibleZones = append(accessibleZones, info)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(accessibleZones)
}

// resolveZonePathWithPool validates and resolves a zone-relative path to a physical path
// Also returns the pool for file size/type validation
func (h *ZoneFileHandler) resolveZonePathWithPool(zoneID, relativePath string, user *models.User) (string, *models.ShareZone, *models.StoragePool, error) {
	zone, err := h.store.GetShareZone(zoneID)
	if err != nil {
		return "", nil, nil, err
	}

	if !zone.UserHasZoneAccess(user) {
		return "", nil, nil, os.ErrPermission
	}

	pool, err := h.store.GetStoragePool(zone.PoolID)
	if err != nil {
		return "", nil, nil, err
	}

	if !pool.Enabled {
		return "", nil, nil, os.ErrPermission
	}

	// Build base path
	basePath := filepath.Join(pool.Path, zone.Path)

	// For personal zones, add username
	if zone.ZoneType == models.ZoneTypePersonal {
		basePath = filepath.Join(basePath, user.Username)
	}

	// Clean and validate the relative path
	cleanPath := filepath.Clean("/" + relativePath)
	if cleanPath == "/" {
		cleanPath = ""
	}

	fullPath := filepath.Join(basePath, cleanPath)

	// Prevent path traversal
	if !strings.HasPrefix(fullPath, basePath) {
		return "", nil, nil, os.ErrPermission
	}

	return fullPath, zone, pool, nil
}

// resolveZonePath validates and resolves a zone-relative path to a physical path (legacy)
func (h *ZoneFileHandler) resolveZonePath(zoneID, relativePath string, user *models.User) (string, *models.ShareZone, error) {
	fullPath, zone, _, err := h.resolveZonePathWithPool(zoneID, relativePath, user)
	return fullPath, zone, err
}

// ListZoneFiles lists files in a zone directory with pagination support
func (h *ZoneFileHandler) ListZoneFiles(w http.ResponseWriter, r *http.Request) {
	userCtx := middleware.GetUserContext(r)
	if userCtx == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	zoneID := chi.URLParam(r, "zoneId")
	relativePath := r.URL.Query().Get("path")
	if relativePath == "" {
		relativePath = "/"
	}

	user := userFromContext(userCtx)

	fullPath, zone, err := h.resolveZonePath(zoneID, relativePath, user)
	if err != nil {
		if os.IsPermission(err) {
			http.Error(w, "Forbidden", http.StatusForbidden)
		} else {
			http.Error(w, err.Error(), http.StatusNotFound)
		}
		return
	}

	// Auto-provision if needed
	if zone.AutoProvision && zone.ZoneType == models.ZoneTypePersonal {
		os.MkdirAll(fullPath, 0755)
	}

	// Parse pagination options
	opts := fileops.ListOptions{}
	if limit := r.URL.Query().Get("limit"); limit != "" {
		if l, err := strconv.Atoi(limit); err == nil && l > 0 {
			opts.Limit = l
		}
	}
	if offset := r.URL.Query().Get("offset"); offset != "" {
		if o, err := strconv.Atoi(offset); err == nil && o >= 0 {
			opts.Offset = o
		}
	}
	opts.SortBy = r.URL.Query().Get("sort_by")
	opts.SortDesc = r.URL.Query().Get("sort_desc") == "true"
	opts.FilterType = r.URL.Query().Get("type")

	// DEBUG: Log the listing path
	log.Printf("LIST DEBUG: fullPath=%s, relativePath=%s, limit=%d", fullPath, relativePath, opts.Limit)

	// Check if pagination is requested
	if opts.Limit > 0 {
		// Use paginated listing - fullPath is already resolved, use Direct version
		result, err := fileops.ListDirectoryPaginatedDirect(fullPath, relativePath, opts)
		if err != nil {
			if os.IsNotExist(err) {
				// Return empty result for non-existent directories
				log.Printf("LIST DEBUG: directory does not exist: %s", fullPath)
				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode(fileops.ListResult{
					Files:   []fileops.FileInfo{},
					Total:   0,
					Limit:   opts.Limit,
					Offset:  opts.Offset,
					HasMore: false,
				})
				return
			}
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		log.Printf("LIST DEBUG: found %d files, total=%d", len(result.Files), result.Total)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
	} else {
		// Use non-paginated listing for backwards compatibility
		files, err := fileops.ListDirectoryRaw(fullPath, relativePath)
		if err != nil {
			if os.IsNotExist(err) {
				// Return empty list for non-existent directories
				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode([]interface{}{})
				return
			}
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(files)
	}
}

// DownloadZoneFile downloads a file from a zone with Range support
func (h *ZoneFileHandler) DownloadZoneFile(w http.ResponseWriter, r *http.Request) {
	userCtx := middleware.GetUserContext(r)
	if userCtx == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	zoneID := chi.URLParam(r, "zoneId")
	filePath := chi.URLParam(r, "*")

	user := userFromContext(userCtx)

	fullPath, _, err := h.resolveZonePath(zoneID, filePath, user)
	if err != nil {
		if os.IsPermission(err) {
			http.Error(w, "Forbidden", http.StatusForbidden)
		} else {
			http.Error(w, err.Error(), http.StatusNotFound)
		}
		return
	}

	// Check if download or inline (preview)
	forceDownload := r.URL.Query().Get("download") == "true" || r.URL.Query().Get("dl") == "1"

	// Use the new transfer utility with Range support
	opts := &fileops.TransferOptions{
		ForceDownload: forceDownload,
		Filename:      filepath.Base(filePath),
	}

	if err := fileops.ServeFileWithRange(w, r, fullPath, opts); err != nil {
		if os.IsNotExist(err) {
			http.Error(w, "File not found", http.StatusNotFound)
		} else {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	}
}

// UploadZoneFile uploads a file to a zone with size and type validation
func (h *ZoneFileHandler) UploadZoneFile(w http.ResponseWriter, r *http.Request) {
	userCtx := middleware.GetUserContext(r)
	if userCtx == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	zoneID := chi.URLParam(r, "zoneId")
	targetPath := chi.URLParam(r, "*")
	if targetPath == "" {
		targetPath = "/"
	}

	user := userFromContext(userCtx)

	fullPath, zone, pool, err := h.resolveZonePathWithPool(zoneID, targetPath, user)
	if err != nil {
		if os.IsPermission(err) {
			http.Error(w, "Forbidden", http.StatusForbidden)
		} else {
			http.Error(w, err.Error(), http.StatusNotFound)
		}
		return
	}

	// Check if zone is read-only
	if zone.ReadOnly {
		http.Error(w, "Zone is read-only", http.StatusForbidden)
		return
	}

	// Auto-provision if needed
	if zone.AutoProvision && zone.ZoneType == models.ZoneTypePersonal {
		os.MkdirAll(filepath.Dir(fullPath), 0755)
	}

	// Determine max file size from pool config
	maxSize := pool.MaxFileSize
	if maxSize == 0 {
		maxSize = 10 * 1024 * 1024 * 1024 // Default 10GB if not set
	}

	// Parse multipart form with appropriate limit
	// Allow up to max file size + 10MB for form overhead
	formLimit := maxSize + 10*1024*1024
	if formLimit > 32<<30 { // Cap at 32GB for memory safety
		formLimit = 32 << 30
	}
	if err := r.ParseMultipartForm(formLimit); err != nil {
		http.Error(w, "Failed to parse form: "+err.Error(), http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "File is required", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Validate file against pool restrictions
	opts := &fileops.TransferOptions{
		MaxFileSize:  pool.MaxFileSize,
		AllowedTypes: pool.AllowedTypes,
		DeniedTypes:  pool.DeniedTypes,
	}

	if err := fileops.ValidateUpload(header.Filename, header.Size, opts); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Check if target is a directory
	info, err := os.Stat(fullPath)
	finalPath := fullPath
	if err == nil && info.IsDir() {
		finalPath = filepath.Join(fullPath, header.Filename)
	} else if os.IsNotExist(err) {
		// Target doesn't exist - treat it as a directory
		os.MkdirAll(fullPath, 0755)
		finalPath = filepath.Join(fullPath, header.Filename)
	}

	// DEBUG: Log the paths
	log.Printf("UPLOAD DEBUG: targetPath=%s, fullPath=%s, finalPath=%s, filename=%s", targetPath, fullPath, finalPath, header.Filename)

	// Save file
	outFile, err := os.Create(finalPath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer outFile.Close()

	// Copy with size tracking to enforce limits
	written, err := io.Copy(outFile, file)
	if err != nil {
		os.Remove(finalPath) // Clean up partial file
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Verify size matches what was declared
	if pool.MaxFileSize > 0 && written > pool.MaxFileSize {
		os.Remove(finalPath) // Clean up oversized file
		http.Error(w, fmt.Sprintf("File size %d exceeds maximum allowed %d bytes", written, pool.MaxFileSize), http.StatusRequestEntityTooLarge)
		return
	}

	// Set file permissions and ownership
	if userCtx.Username != "" {
		if u, err := osuser.Lookup(userCtx.Username); err == nil {
			uid, _ := strconv.Atoi(u.Uid)
			gid, _ := strconv.Atoi(u.Gid)
			os.Chmod(finalPath, 0644)
			os.Chown(finalPath, uid, gid)
		}
	}

	// Calculate the actual relative path of the uploaded file
	// targetPath is what was requested, but file may have been saved inside it
	actualPath := targetPath
	if finalPath != fullPath {
		// File was saved with filename appended (target was a directory)
		if targetPath == "/" || targetPath == "" {
			actualPath = "/" + header.Filename
		} else {
			actualPath = filepath.Join(targetPath, header.Filename)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message": "File uploaded successfully",
		"path":    actualPath,
		"size":    written,
	})
}

// DeleteZoneFile deletes a file or folder from a zone
func (h *ZoneFileHandler) DeleteZoneFile(w http.ResponseWriter, r *http.Request) {
	userCtx := middleware.GetUserContext(r)
	if userCtx == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	zoneID := chi.URLParam(r, "zoneId")
	filePath := chi.URLParam(r, "*")
	if filePath == "" {
		http.Error(w, "Path is required", http.StatusBadRequest)
		return
	}

	user := userFromContext(userCtx)

	fullPath, zone, err := h.resolveZonePath(zoneID, filePath, user)
	if err != nil {
		if os.IsPermission(err) {
			http.Error(w, "Forbidden", http.StatusForbidden)
		} else {
			http.Error(w, err.Error(), http.StatusNotFound)
		}
		return
	}

	// Check if zone is read-only
	if zone.ReadOnly {
		http.Error(w, "Zone is read-only", http.StatusForbidden)
		return
	}

	if err := os.RemoveAll(fullPath); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// RenameZoneFile renames a file or folder in a zone
func (h *ZoneFileHandler) RenameZoneFile(w http.ResponseWriter, r *http.Request) {
	userCtx := middleware.GetUserContext(r)
	if userCtx == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	zoneID := chi.URLParam(r, "zoneId")
	oldPath := chi.URLParam(r, "*")
	if oldPath == "" {
		http.Error(w, "Path is required", http.StatusBadRequest)
		return
	}

	var req struct {
		NewPath string `json:"new_path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	user := userFromContext(userCtx)

	fullOldPath, zone, err := h.resolveZonePath(zoneID, oldPath, user)
	if err != nil {
		if os.IsPermission(err) {
			http.Error(w, "Forbidden", http.StatusForbidden)
		} else {
			http.Error(w, err.Error(), http.StatusNotFound)
		}
		return
	}

	// Check if zone is read-only
	if zone.ReadOnly {
		http.Error(w, "Zone is read-only", http.StatusForbidden)
		return
	}

	fullNewPath, _, err := h.resolveZonePath(zoneID, req.NewPath, user)
	if err != nil {
		if os.IsPermission(err) {
			http.Error(w, "Forbidden", http.StatusForbidden)
		} else {
			http.Error(w, err.Error(), http.StatusNotFound)
		}
		return
	}

	if err := os.Rename(fullOldPath, fullNewPath); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "File renamed successfully",
		"path":    req.NewPath,
	})
}

// CreateZoneFolder creates a new folder in a zone
func (h *ZoneFileHandler) CreateZoneFolder(w http.ResponseWriter, r *http.Request) {
	userCtx := middleware.GetUserContext(r)
	if userCtx == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	zoneID := chi.URLParam(r, "zoneId")
	folderPath := chi.URLParam(r, "*")
	if folderPath == "" {
		http.Error(w, "Path is required", http.StatusBadRequest)
		return
	}

	user := userFromContext(userCtx)

	fullPath, zone, err := h.resolveZonePath(zoneID, folderPath, user)
	if err != nil {
		if os.IsPermission(err) {
			http.Error(w, "Forbidden", http.StatusForbidden)
		} else {
			http.Error(w, err.Error(), http.StatusNotFound)
		}
		return
	}

	// Check if zone is read-only
	if zone.ReadOnly {
		http.Error(w, "Zone is read-only", http.StatusForbidden)
		return
	}

	// Find the first directory that needs to be created so we can set ownership
	var dirsToCreate []string
	checkPath := fullPath
	for {
		if _, err := os.Stat(checkPath); err == nil {
			break // This directory exists
		}
		dirsToCreate = append([]string{checkPath}, dirsToCreate...)
		parent := filepath.Dir(checkPath)
		if parent == checkPath {
			break
		}
		checkPath = parent
	}

	if err := os.MkdirAll(fullPath, 0755); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Set ownership on all newly created directories
	for _, dir := range dirsToCreate {
		if u, err := osuser.Lookup(userCtx.Username); err == nil {
			uid, _ := strconv.Atoi(u.Uid)
			gid, _ := strconv.Atoi(u.Gid)
			os.Chown(dir, uid, gid)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Folder created successfully",
		"path":    folderPath,
	})
}

// BulkDeleteRequest is the request body for bulk delete operations
type BulkDeleteRequest struct {
	Paths []string `json:"paths"`
}

// BulkDeleteResponse is the response for bulk delete operations
type BulkDeleteResponse struct {
	Deleted []string          `json:"deleted"`
	Failed  []BulkErrorDetail `json:"failed,omitempty"`
}

// BulkErrorDetail contains error information for a single item
type BulkErrorDetail struct {
	Path  string `json:"path"`
	Error string `json:"error"`
}

// BulkDeleteZoneFiles deletes multiple files/folders from a zone
func (h *ZoneFileHandler) BulkDeleteZoneFiles(w http.ResponseWriter, r *http.Request) {
	userCtx := middleware.GetUserContext(r)
	if userCtx == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	zoneID := chi.URLParam(r, "zoneId")

	var req BulkDeleteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	if len(req.Paths) == 0 {
		http.Error(w, "No paths provided", http.StatusBadRequest)
		return
	}

	user := userFromContext(userCtx)

	// Get zone once to check read-only status
	zone, err := h.store.GetShareZone(zoneID)
	if err != nil {
		http.Error(w, "Zone not found", http.StatusNotFound)
		return
	}

	if zone.ReadOnly {
		http.Error(w, "Zone is read-only", http.StatusForbidden)
		return
	}

	resp := BulkDeleteResponse{
		Deleted: []string{},
		Failed:  []BulkErrorDetail{},
	}

	for _, path := range req.Paths {
		fullPath, _, err := h.resolveZonePath(zoneID, path, user)
		if err != nil {
			resp.Failed = append(resp.Failed, BulkErrorDetail{
				Path:  path,
				Error: err.Error(),
			})
			continue
		}

		if err := os.RemoveAll(fullPath); err != nil {
			resp.Failed = append(resp.Failed, BulkErrorDetail{
				Path:  path,
				Error: err.Error(),
			})
			continue
		}

		resp.Deleted = append(resp.Deleted, path)
	}

	w.Header().Set("Content-Type", "application/json")
	if len(resp.Failed) > 0 && len(resp.Deleted) == 0 {
		w.WriteHeader(http.StatusBadRequest)
	} else if len(resp.Failed) > 0 {
		w.WriteHeader(http.StatusPartialContent)
	}
	json.NewEncoder(w).Encode(resp)
}

// BulkMoveRequest is the request body for bulk move operations
type BulkMoveRequest struct {
	Paths       []string `json:"paths"`
	Destination string   `json:"destination"`
}

// BulkMoveResponse is the response for bulk move operations
type BulkMoveResponse struct {
	Moved  []BulkMoveResult  `json:"moved"`
	Failed []BulkErrorDetail `json:"failed,omitempty"`
}

// BulkMoveResult contains the result of a single move operation
type BulkMoveResult struct {
	OldPath string `json:"old_path"`
	NewPath string `json:"new_path"`
}

// BulkMoveZoneFiles moves multiple files/folders to a new destination in a zone
func (h *ZoneFileHandler) BulkMoveZoneFiles(w http.ResponseWriter, r *http.Request) {
	userCtx := middleware.GetUserContext(r)
	if userCtx == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	zoneID := chi.URLParam(r, "zoneId")

	var req BulkMoveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	if len(req.Paths) == 0 {
		http.Error(w, "No paths provided", http.StatusBadRequest)
		return
	}

	if req.Destination == "" {
		http.Error(w, "Destination is required", http.StatusBadRequest)
		return
	}

	user := userFromContext(userCtx)

	// Get zone once to check read-only status
	zone, err := h.store.GetShareZone(zoneID)
	if err != nil {
		http.Error(w, "Zone not found", http.StatusNotFound)
		return
	}

	if zone.ReadOnly {
		http.Error(w, "Zone is read-only", http.StatusForbidden)
		return
	}

	// Resolve destination directory
	destFullPath, _, err := h.resolveZonePath(zoneID, req.Destination, user)
	if err != nil {
		http.Error(w, "Invalid destination: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Ensure destination exists and is a directory
	destInfo, err := os.Stat(destFullPath)
	if err != nil {
		if os.IsNotExist(err) {
			// Create destination directory
			if err := os.MkdirAll(destFullPath, 0755); err != nil {
				http.Error(w, "Failed to create destination: "+err.Error(), http.StatusInternalServerError)
				return
			}
		} else {
			http.Error(w, "Failed to access destination: "+err.Error(), http.StatusInternalServerError)
			return
		}
	} else if !destInfo.IsDir() {
		http.Error(w, "Destination must be a directory", http.StatusBadRequest)
		return
	}

	resp := BulkMoveResponse{
		Moved:  []BulkMoveResult{},
		Failed: []BulkErrorDetail{},
	}

	for _, path := range req.Paths {
		fullOldPath, _, err := h.resolveZonePath(zoneID, path, user)
		if err != nil {
			resp.Failed = append(resp.Failed, BulkErrorDetail{
				Path:  path,
				Error: err.Error(),
			})
			continue
		}

		// Get the filename
		filename := filepath.Base(fullOldPath)
		fullNewPath := filepath.Join(destFullPath, filename)
		newRelPath := filepath.Join(req.Destination, filename)

		// Check if destination already exists
		if _, err := os.Stat(fullNewPath); err == nil {
			resp.Failed = append(resp.Failed, BulkErrorDetail{
				Path:  path,
				Error: "destination already exists",
			})
			continue
		}

		if err := os.Rename(fullOldPath, fullNewPath); err != nil {
			resp.Failed = append(resp.Failed, BulkErrorDetail{
				Path:  path,
				Error: err.Error(),
			})
			continue
		}

		resp.Moved = append(resp.Moved, BulkMoveResult{
			OldPath: path,
			NewPath: newRelPath,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	if len(resp.Failed) > 0 && len(resp.Moved) == 0 {
		w.WriteHeader(http.StatusBadRequest)
	} else if len(resp.Failed) > 0 {
		w.WriteHeader(http.StatusPartialContent)
	}
	json.NewEncoder(w).Encode(resp)
}

// GetZoneFolders returns only folders for a zone path (used by folder picker)
func (h *ZoneFileHandler) GetZoneFolders(w http.ResponseWriter, r *http.Request) {
	userCtx := middleware.GetUserContext(r)
	if userCtx == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	zoneID := chi.URLParam(r, "zoneId")
	relativePath := r.URL.Query().Get("path")
	if relativePath == "" {
		relativePath = "/"
	}

	user := userFromContext(userCtx)

	fullPath, zone, err := h.resolveZonePath(zoneID, relativePath, user)
	if err != nil {
		if os.IsPermission(err) {
			http.Error(w, "Forbidden", http.StatusForbidden)
		} else {
			http.Error(w, err.Error(), http.StatusNotFound)
		}
		return
	}

	// Auto-provision if needed
	if zone.AutoProvision && zone.ZoneType == models.ZoneTypePersonal {
		os.MkdirAll(fullPath, 0755)
	}

	// List directory and filter to folders only
	files, err := fileops.ListDirectoryRaw(fullPath, relativePath)
	if err != nil {
		if os.IsNotExist(err) {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode([]interface{}{})
			return
		}
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Filter to only directories
	folders := []fileops.FileInfo{}
	for _, f := range files {
		if f.IsDir {
			folders = append(folders, f)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(folders)
}

// ZoneStatsResponse contains recursive statistics for a zone
type ZoneStatsResponse struct {
	ZoneID    string `json:"zone_id"`
	ZoneName  string `json:"zone_name"`
	TotalSize int64  `json:"total_size"`
	FileCount int64  `json:"file_count"`
	DirCount  int64  `json:"dir_count"`
}

// GetZoneStats returns recursive file statistics for a zone
func (h *ZoneFileHandler) GetZoneStats(w http.ResponseWriter, r *http.Request) {
	userCtx := middleware.GetUserContext(r)
	if userCtx == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	zoneID := chi.URLParam(r, "zoneId")
	user := userFromContext(userCtx)

	// Resolve zone path at root level
	fullPath, zone, err := h.resolveZonePath(zoneID, "/", user)
	if err != nil {
		if os.IsPermission(err) {
			http.Error(w, "Forbidden", http.StatusForbidden)
		} else {
			http.Error(w, err.Error(), http.StatusNotFound)
		}
		return
	}

	// Auto-provision if needed
	if zone.AutoProvision && zone.ZoneType == models.ZoneTypePersonal {
		os.MkdirAll(fullPath, 0755)
	}

	// Walk the directory tree and count files/sizes
	var totalSize int64
	var fileCount int64
	var dirCount int64

	err = filepath.Walk(fullPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			// Skip inaccessible files/directories
			return nil
		}
		if info.IsDir() {
			// Don't count the root directory itself
			if path != fullPath {
				dirCount++
			}
		} else {
			fileCount++
			totalSize += info.Size()
		}
		return nil
	})

	if err != nil {
		http.Error(w, "Failed to calculate stats: "+err.Error(), http.StatusInternalServerError)
		return
	}

	resp := ZoneStatsResponse{
		ZoneID:    zone.ID,
		ZoneName:  zone.Name,
		TotalSize: totalSize,
		FileCount: fileCount,
		DirCount:  dirCount,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}
