package handlers

import (
	"encoding/json"
	"net/http"
	"os"
	osuser "os/user"
	"path/filepath"
	"strconv"

	"fileserv/config"
	"fileserv/internal/fileops"
	"fileserv/middleware"
	"fileserv/models"
	"fileserv/storage"

	"github.com/go-chi/chi/v5"
)

// userFromContext creates a User object from the request context for permission checking
func userFromContext(userCtx *middleware.UserContext) *models.User {
	return &models.User{
		ID:       userCtx.UserID,
		Username: userCtx.Username,
		IsAdmin:  userCtx.IsAdmin,
		Groups:   userCtx.Groups,
	}
}

func ListFiles(store storage.DataStore, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userCtx := middleware.GetUserContext(r)
		if userCtx == nil {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		path := r.URL.Query().Get("path")
		if path == "" {
			path = "/"
		}

		// Build user from context for permission check
		user := userFromContext(userCtx)

		// Check read permission
		permissions := store.GetPermissions()
		if !models.HasPermission(permissions, user, path, models.PermissionRead) {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}

		files, err := fileops.ListDirectory(cfg.DataDir, path)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(files)
	}
}

func GetFile(store storage.DataStore, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userCtx := middleware.GetUserContext(r)
		if userCtx == nil {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		path := chi.URLParam(r, "*")
		if path == "" {
			path = "/"
		}

		// Build user from context for permission check
		user := userFromContext(userCtx)

		// Check read permission
		permissions := store.GetPermissions()
		if !models.HasPermission(permissions, user, path, models.PermissionRead) {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}

		// Check if it's a file or directory
		info, err := fileops.GetFileInfo(cfg.DataDir, path)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}

		if info.IsDir {
			// List directory
			files, err := fileops.ListDirectory(cfg.DataDir, path)
			if err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}

			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(files)
			return
		}

		// Download file with Range support for resumable downloads
		fullPath, err := fileops.ValidatePath(cfg.DataDir, path)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		// Check if download or inline (preview)
		forceDownload := r.URL.Query().Get("download") == "true" || r.URL.Query().Get("dl") == "1"

		opts := &fileops.TransferOptions{
			ForceDownload: forceDownload,
			Filename:      filepath.Base(path),
		}

		if err := fileops.ServeFileWithRange(w, r, fullPath, opts); err != nil {
			if os.IsNotExist(err) {
				http.Error(w, "File not found", http.StatusNotFound)
			} else {
				http.Error(w, err.Error(), http.StatusInternalServerError)
			}
		}
	}
}

func UploadFile(store storage.DataStore, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userCtx := middleware.GetUserContext(r)
		if userCtx == nil {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		path := chi.URLParam(r, "*")
		if path == "" {
			http.Error(w, "Path is required", http.StatusBadRequest)
			return
		}

		// Build user from context for permission check
		user := userFromContext(userCtx)

		// Check write permission
		permissions := store.GetPermissions()
		if !models.HasPermission(permissions, user, path, models.PermissionWrite) {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}

		// Parse multipart form
		if err := r.ParseMultipartForm(32 << 20); err != nil { // 32 MB max
			http.Error(w, "Failed to parse form", http.StatusBadRequest)
			return
		}

		file, header, err := r.FormFile("file")
		if err != nil {
			http.Error(w, "File is required", http.StatusBadRequest)
			return
		}
		defer file.Close()

		// Sanitize filename to prevent injection attacks
		safeFilename := fileops.SanitizeFilename(header.Filename)
		if safeFilename == "" {
			http.Error(w, "Invalid filename", http.StatusBadRequest)
			return
		}

		// Use filename from header if path is a directory
		filePath := path
		info, err := fileops.GetFileInfo(cfg.DataDir, path)
		if err == nil && info.IsDir {
			filePath = filepath.Join(path, safeFilename)
		}

		if err := fileops.SaveFile(cfg.DataDir, filePath, file); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// Set file ownership - use ValidatePath to get the safe full path
		fullPath, err := fileops.ValidatePath(cfg.DataDir, filePath)
		if err != nil {
			http.Error(w, "Invalid path", http.StatusInternalServerError)
			return
		}
		if userCtx.Username != "" {
			if u, err := osuser.Lookup(userCtx.Username); err == nil {
				uid, _ := strconv.Atoi(u.Uid)
				gid, _ := strconv.Atoi(u.Gid)
				os.Chmod(fullPath, 0644)
				os.Chown(fullPath, uid, gid)
			}
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{
			"message": "File uploaded successfully",
			"path":    filePath,
		})
	}
}

func DeleteFile(store storage.DataStore, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userCtx := middleware.GetUserContext(r)
		if userCtx == nil {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		path := chi.URLParam(r, "*")
		if path == "" {
			http.Error(w, "Path is required", http.StatusBadRequest)
			return
		}

		// Build user from context for permission check
		user := userFromContext(userCtx)

		// Check delete permission
		permissions := store.GetPermissions()
		if !models.HasPermission(permissions, user, path, models.PermissionDelete) {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}

		if err := fileops.DeletePath(cfg.DataDir, path); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

func RenameFile(store storage.DataStore, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userCtx := middleware.GetUserContext(r)
		if userCtx == nil {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

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

		if req.NewPath == "" {
			http.Error(w, "New path is required", http.StatusBadRequest)
			return
		}

		// Build user from context for permission check
		user := userFromContext(userCtx)

		// Check write permission on both paths
		permissions := store.GetPermissions()
		if !models.HasPermission(permissions, user, oldPath, models.PermissionWrite) {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		if !models.HasPermission(permissions, user, req.NewPath, models.PermissionWrite) {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}

		if err := fileops.MovePath(cfg.DataDir, oldPath, req.NewPath); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"message": "File renamed successfully",
			"path":    req.NewPath,
		})
	}
}

func CreateFolder(store storage.DataStore, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userCtx := middleware.GetUserContext(r)
		if userCtx == nil {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		path := chi.URLParam(r, "*")
		if path == "" {
			http.Error(w, "Path is required", http.StatusBadRequest)
			return
		}

		// Build user from context for permission check
		user := userFromContext(userCtx)

		// Check write permission
		permissions := store.GetPermissions()
		if !models.HasPermission(permissions, user, path, models.PermissionWrite) {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}

		if err := fileops.CreateDirectory(cfg.DataDir, path); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{
			"message": "Folder created successfully",
			"path":    path,
		})
	}
}
