package handlers

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"fileserv/models"
	"fileserv/storage"

	"github.com/go-chi/chi/v5"
)

// CreateShareRequest represents the request to create a new share
type CreateShareRequest struct {
	Name          string   `json:"name"`
	Path          string   `json:"path"`
	Protocol      string   `json:"protocol"` // "smb" or "nfs"
	Description   string   `json:"description"`
	Enabled       bool     `json:"enabled"`
	AllowedUsers  []string `json:"allowed_users"`
	AllowedGroups []string `json:"allowed_groups"`
	DenyUsers     []string `json:"deny_users"`
	DenyGroups    []string `json:"deny_groups"`
	GuestAccess   bool     `json:"guest_access"`
	ReadOnly      bool     `json:"read_only"`
	Browsable     bool     `json:"browsable"`

	// SMB options
	SMBOptions *models.SMBShareOptions `json:"smb_options,omitempty"`

	// NFS options
	NFSOptions *models.NFSShareOptions `json:"nfs_options,omitempty"`
}

// UpdateShareRequest represents the request to update a share
type UpdateShareRequest struct {
	Name          *string   `json:"name,omitempty"`
	Path          *string   `json:"path,omitempty"`
	Description   *string   `json:"description,omitempty"`
	Enabled       *bool     `json:"enabled,omitempty"`
	AllowedUsers  *[]string `json:"allowed_users,omitempty"`
	AllowedGroups *[]string `json:"allowed_groups,omitempty"`
	DenyUsers     *[]string `json:"deny_users,omitempty"`
	DenyGroups    *[]string `json:"deny_groups,omitempty"`
	GuestAccess   *bool     `json:"guest_access,omitempty"`
	ReadOnly      *bool     `json:"read_only,omitempty"`
	Browsable     *bool     `json:"browsable,omitempty"`

	// SMB options
	SMBOptions *models.SMBShareOptions `json:"smb_options,omitempty"`

	// NFS options
	NFSOptions *models.NFSShareOptions `json:"nfs_options,omitempty"`
}

// ListShares returns all configured shares
func ListShares(store storage.DataStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Filter by protocol if specified
		protocol := r.URL.Query().Get("protocol")

		var shares []*models.Share
		if protocol != "" {
			shares = store.ListSharesByProtocol(models.ShareProtocol(protocol))
		} else {
			shares = store.ListShares()
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(shares)
	}
}

// GetShare returns a specific share by ID
func GetShare(store storage.DataStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		if id == "" {
			http.Error(w, "Share ID is required", http.StatusBadRequest)
			return
		}

		share, err := store.GetShare(id)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(share)
	}
}

// CreateShare creates a new file share
func CreateShare(store storage.DataStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req CreateShareRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request: "+err.Error(), http.StatusBadRequest)
			return
		}

		// Validate required fields
		if req.Name == "" {
			http.Error(w, "Share name is required", http.StatusBadRequest)
			return
		}

		if req.Path == "" {
			http.Error(w, "Share path is required", http.StatusBadRequest)
			return
		}

		if req.Protocol != "smb" && req.Protocol != "nfs" {
			http.Error(w, "Protocol must be 'smb' or 'nfs'", http.StatusBadRequest)
			return
		}

		// Validate path exists and is accessible
		absPath, err := filepath.Abs(req.Path)
		if err != nil {
			http.Error(w, "Invalid path: "+err.Error(), http.StatusBadRequest)
			return
		}

		info, err := os.Stat(absPath)
		if err != nil {
			if os.IsNotExist(err) {
				http.Error(w, "Path does not exist", http.StatusBadRequest)
				return
			}
			http.Error(w, "Cannot access path: "+err.Error(), http.StatusBadRequest)
			return
		}

		if !info.IsDir() {
			http.Error(w, "Path must be a directory", http.StatusBadRequest)
			return
		}

		// Initialize arrays if nil
		if req.AllowedUsers == nil {
			req.AllowedUsers = []string{}
		}
		if req.AllowedGroups == nil {
			req.AllowedGroups = []string{}
		}
		if req.DenyUsers == nil {
			req.DenyUsers = []string{}
		}
		if req.DenyGroups == nil {
			req.DenyGroups = []string{}
		}

		// Create share object
		share := &models.Share{
			Name:          req.Name,
			Path:          absPath,
			Protocol:      models.ShareProtocol(req.Protocol),
			Description:   req.Description,
			Enabled:       req.Enabled,
			AllowedUsers:  req.AllowedUsers,
			AllowedGroups: req.AllowedGroups,
			DenyUsers:     req.DenyUsers,
			DenyGroups:    req.DenyGroups,
			GuestAccess:   req.GuestAccess,
			ReadOnly:      req.ReadOnly,
			Browsable:     req.Browsable,
		}

		// Set protocol-specific options
		if req.Protocol == "smb" {
			if req.SMBOptions != nil {
				share.SMBOptions = req.SMBOptions
			} else {
				share.SMBOptions = &models.SMBShareOptions{
					CreateMask:    "0644",
					DirectoryMask: "0755",
				}
			}
		} else {
			if req.NFSOptions != nil {
				share.NFSOptions = req.NFSOptions
			} else {
				share.NFSOptions = &models.NFSShareOptions{
					AllowedHosts:   []string{"*"},
					RootSquash:     true,
					Sync:           true,
					NoSubtreeCheck: true,
					Secure:         true,
					AnonUID:        65534,
					AnonGID:        65534,
				}
			}
		}

		created, err := store.CreateShare(share)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(created)
	}
}

// UpdateShare updates an existing share
func UpdateShare(store storage.DataStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		if id == "" {
			http.Error(w, "Share ID is required", http.StatusBadRequest)
			return
		}

		var req UpdateShareRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request: "+err.Error(), http.StatusBadRequest)
			return
		}

		// Get existing share
		share, err := store.GetShare(id)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}

		// Apply updates directly to share object
		if req.Name != nil {
			share.Name = *req.Name
		}
		if req.Path != nil {
			// Validate new path
			absPath, err := filepath.Abs(*req.Path)
			if err != nil {
				http.Error(w, "Invalid path: "+err.Error(), http.StatusBadRequest)
				return
			}
			info, err := os.Stat(absPath)
			if err != nil {
				http.Error(w, "Cannot access path: "+err.Error(), http.StatusBadRequest)
				return
			}
			if !info.IsDir() {
				http.Error(w, "Path must be a directory", http.StatusBadRequest)
				return
			}
			share.Path = absPath
		}
		if req.Description != nil {
			share.Description = *req.Description
		}
		if req.Enabled != nil {
			share.Enabled = *req.Enabled
		}
		if req.AllowedUsers != nil {
			share.AllowedUsers = *req.AllowedUsers
		}
		if req.AllowedGroups != nil {
			share.AllowedGroups = *req.AllowedGroups
		}
		if req.DenyUsers != nil {
			share.DenyUsers = *req.DenyUsers
		}
		if req.DenyGroups != nil {
			share.DenyGroups = *req.DenyGroups
		}
		if req.GuestAccess != nil {
			share.GuestAccess = *req.GuestAccess
		}
		if req.ReadOnly != nil {
			share.ReadOnly = *req.ReadOnly
		}
		if req.Browsable != nil {
			share.Browsable = *req.Browsable
		}
		if req.SMBOptions != nil {
			share.SMBOptions = req.SMBOptions
		}
		if req.NFSOptions != nil {
			share.NFSOptions = req.NFSOptions
		}

		share.UpdatedAt = time.Now()

		// Build updates map for store
		updates := make(map[string]interface{})
		if req.Name != nil {
			updates["name"] = *req.Name
		}
		if req.Description != nil {
			updates["description"] = *req.Description
		}
		if req.Enabled != nil {
			updates["enabled"] = *req.Enabled
		}
		if req.ReadOnly != nil {
			updates["read_only"] = *req.ReadOnly
		}
		if req.Browsable != nil {
			updates["browsable"] = *req.Browsable
		}
		if req.GuestAccess != nil {
			updates["guest_access"] = *req.GuestAccess
		}

		updated, err := store.UpdateShare(id, updates)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		// Apply path and protocol options that weren't in generic update
		if req.Path != nil {
			absPath, _ := filepath.Abs(*req.Path)
			updated.Path = absPath
		}
		if req.AllowedUsers != nil {
			updated.AllowedUsers = *req.AllowedUsers
		}
		if req.AllowedGroups != nil {
			updated.AllowedGroups = *req.AllowedGroups
		}
		if req.DenyUsers != nil {
			updated.DenyUsers = *req.DenyUsers
		}
		if req.DenyGroups != nil {
			updated.DenyGroups = *req.DenyGroups
		}
		if req.SMBOptions != nil {
			updated.SMBOptions = req.SMBOptions
		}
		if req.NFSOptions != nil {
			updated.NFSOptions = req.NFSOptions
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(updated)
	}
}

// DeleteShare removes a share
func DeleteShare(store storage.DataStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		if id == "" {
			http.Error(w, "Share ID is required", http.StatusBadRequest)
			return
		}

		if err := store.DeleteShare(id); err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

// AddShareAccess adds a user or group to a share's allowed list
func AddShareAccess(store storage.DataStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		if id == "" {
			http.Error(w, "Share ID is required", http.StatusBadRequest)
			return
		}

		var req struct {
			Username  string `json:"username,omitempty"`
			GroupName string `json:"group_name,omitempty"`
			CanWrite  bool   `json:"can_write"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request: "+err.Error(), http.StatusBadRequest)
			return
		}

		if req.Username == "" && req.GroupName == "" {
			http.Error(w, "Username or group_name is required", http.StatusBadRequest)
			return
		}

		share, err := store.GetShare(id)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}

		// Add to allowed users/groups
		if req.Username != "" {
			// Check if already in list
			found := false
			for _, u := range share.AllowedUsers {
				if u == req.Username {
					found = true
					break
				}
			}
			if !found {
				share.AllowedUsers = append(share.AllowedUsers, req.Username)
			}
		}

		if req.GroupName != "" {
			found := false
			for _, g := range share.AllowedGroups {
				if g == req.GroupName {
					found = true
					break
				}
			}
			if !found {
				share.AllowedGroups = append(share.AllowedGroups, req.GroupName)
			}
		}

		share.UpdatedAt = time.Now()

		// Update in store
		updates := map[string]interface{}{}
		if req.Username != "" {
			users := make([]interface{}, len(share.AllowedUsers))
			for i, u := range share.AllowedUsers {
				users[i] = u
			}
			updates["allowed_users"] = users
		}
		if req.GroupName != "" {
			groups := make([]interface{}, len(share.AllowedGroups))
			for i, g := range share.AllowedGroups {
				groups[i] = g
			}
			updates["allowed_groups"] = groups
		}

		updated, err := store.UpdateShare(id, updates)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(updated)
	}
}

// RemoveShareAccess removes a user or group from a share's allowed list
func RemoveShareAccess(store storage.DataStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		if id == "" {
			http.Error(w, "Share ID is required", http.StatusBadRequest)
			return
		}

		var req struct {
			Username  string `json:"username,omitempty"`
			GroupName string `json:"group_name,omitempty"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request: "+err.Error(), http.StatusBadRequest)
			return
		}

		if req.Username == "" && req.GroupName == "" {
			http.Error(w, "Username or group_name is required", http.StatusBadRequest)
			return
		}

		share, err := store.GetShare(id)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}

		// Remove from allowed users/groups
		if req.Username != "" {
			newUsers := make([]string, 0, len(share.AllowedUsers))
			for _, u := range share.AllowedUsers {
				if u != req.Username {
					newUsers = append(newUsers, u)
				}
			}
			share.AllowedUsers = newUsers
		}

		if req.GroupName != "" {
			newGroups := make([]string, 0, len(share.AllowedGroups))
			for _, g := range share.AllowedGroups {
				if g != req.GroupName {
					newGroups = append(newGroups, g)
				}
			}
			share.AllowedGroups = newGroups
		}

		share.UpdatedAt = time.Now()

		// Update in store
		updates := map[string]interface{}{}
		if req.Username != "" {
			users := make([]interface{}, len(share.AllowedUsers))
			for i, u := range share.AllowedUsers {
				users[i] = u
			}
			updates["allowed_users"] = users
		}
		if req.GroupName != "" {
			groups := make([]interface{}, len(share.AllowedGroups))
			for i, g := range share.AllowedGroups {
				groups[i] = g
			}
			updates["allowed_groups"] = groups
		}

		updated, err := store.UpdateShare(id, updates)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(updated)
	}
}
