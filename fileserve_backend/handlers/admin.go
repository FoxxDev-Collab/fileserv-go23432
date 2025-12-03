package handlers

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"

	"fileserv/config"
	"fileserv/models"
	"fileserv/storage"

	"github.com/go-chi/chi/v5"
)

type Stats struct {
	TotalUsers       int   `json:"total_users"`
	TotalPermissions int   `json:"total_permissions"`
	TotalFiles       int   `json:"total_files"`
	TotalSize        int64 `json:"total_size"`
}

func GetStats(store storage.DataStore, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		users := store.ListUsers()
		permissions := store.ListPermissions()

		// Calculate file stats
		totalFiles := 0
		var totalSize int64

		filepath.Walk(cfg.DataDir, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return nil
			}
			if !info.IsDir() {
				totalFiles++
				totalSize += info.Size()
			}
			return nil
		})

		stats := Stats{
			TotalUsers:       len(users),
			TotalPermissions: len(permissions),
			TotalFiles:       totalFiles,
			TotalSize:        totalSize,
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(stats)
	}
}

type CreatePermissionRequest struct {
	Path     string                 `json:"path"`
	Type     models.PermissionType  `json:"type"`
	Username string                 `json:"username"`
	Group    string                 `json:"group"`
}

func ListPermissions(store storage.DataStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		permissions := store.ListPermissions()

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(permissions)
	}
}

func CreatePermission(store storage.DataStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req CreatePermissionRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request", http.StatusBadRequest)
			return
		}

		if req.Path == "" || req.Type == "" {
			http.Error(w, "Path and type are required", http.StatusBadRequest)
			return
		}

		if req.Username == "" && req.Group == "" {
			http.Error(w, "Either username or group is required", http.StatusBadRequest)
			return
		}

		perm, err := store.CreatePermission(req.Path, req.Type, req.Username, req.Group)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(perm)
	}
}

func DeletePermission(store storage.DataStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		if id == "" {
			http.Error(w, "Permission ID is required", http.StatusBadRequest)
			return
		}

		if err := store.DeletePermission(id); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

type UpdatePermissionRequest struct {
	Path     string                `json:"path,omitempty"`
	Type     models.PermissionType `json:"type,omitempty"`
	Username string                `json:"username,omitempty"`
	Group    string                `json:"group,omitempty"`
}

func UpdatePermission(store storage.DataStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		if id == "" {
			http.Error(w, "Permission ID is required", http.StatusBadRequest)
			return
		}

		var req UpdatePermissionRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request", http.StatusBadRequest)
			return
		}

		perm, err := store.UpdatePermission(id, req.Path, req.Type, req.Username, req.Group)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(perm)
	}
}
