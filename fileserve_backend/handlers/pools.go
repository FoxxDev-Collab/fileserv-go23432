package handlers

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"syscall"

	"fileserv/models"
	"fileserv/storage"

	"github.com/go-chi/chi/v5"
)

type PoolHandler struct {
	store storage.DataStore
}

func NewPoolHandler(store storage.DataStore) *PoolHandler {
	return &PoolHandler{store: store}
}

// GetStoragePools returns all storage pools
func (h *PoolHandler) GetStoragePools(w http.ResponseWriter, r *http.Request) {
	pools := h.store.ListStoragePools()

	// Update space info for each pool
	for _, pool := range pools {
		h.updatePoolSpace(pool)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(pools)
}

// GetStoragePool returns a single storage pool
func (h *PoolHandler) GetStoragePool(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	pool, err := h.store.GetStoragePool(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	h.updatePoolSpace(pool)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(pool)
}

// CreateStoragePool creates a new storage pool
func (h *PoolHandler) CreateStoragePool(w http.ResponseWriter, r *http.Request) {
	var pool models.StoragePool
	if err := json.NewDecoder(r.Body).Decode(&pool); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate required fields
	if pool.Name == "" {
		http.Error(w, "Pool name is required", http.StatusBadRequest)
		return
	}

	if pool.Path == "" {
		http.Error(w, "Pool path is required", http.StatusBadRequest)
		return
	}

	// Verify path exists and is a directory
	info, err := os.Stat(pool.Path)
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

	// Set defaults
	if pool.AllowedTypes == nil {
		pool.AllowedTypes = []string{}
	}
	if pool.DeniedTypes == nil {
		pool.DeniedTypes = []string{}
	}

	created, err := h.store.CreateStoragePool(&pool)
	if err != nil {
		http.Error(w, err.Error(), http.StatusConflict)
		return
	}

	h.updatePoolSpace(created)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(created)
}

// UpdateStoragePool updates an existing storage pool
func (h *PoolHandler) UpdateStoragePool(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var updates map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&updates); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// If path is being updated, verify it exists
	if path, ok := updates["path"].(string); ok && path != "" {
		info, err := os.Stat(path)
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
	}

	updated, err := h.store.UpdateStoragePool(id, updates)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	h.updatePoolSpace(updated)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(updated)
}

// DeleteStoragePool deletes a storage pool
func (h *PoolHandler) DeleteStoragePool(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	if err := h.store.DeleteStoragePool(id); err != nil {
		if err.Error() == "storage pool not found" {
			http.Error(w, err.Error(), http.StatusNotFound)
		} else {
			http.Error(w, err.Error(), http.StatusConflict)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Storage pool deleted"})
}

// GetPoolUsage returns detailed usage information for a pool
func (h *PoolHandler) GetPoolUsage(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	pool, err := h.store.GetStoragePool(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	h.updatePoolSpace(pool)

	// Get zone count
	zones := h.store.ListShareZonesByPool(id)

	// Get share count (shares that belong to zones in this pool)
	shares := h.store.ListShares()
	shareCount := 0
	for _, share := range shares {
		for _, zone := range zones {
			if share.ZoneID == zone.ID {
				shareCount++
				break
			}
		}
	}

	// Calculate usage percentage
	usagePercent := float64(0)
	if pool.TotalSpace > 0 {
		usagePercent = float64(pool.UsedSpace) / float64(pool.TotalSpace) * 100
	}

	usage := map[string]interface{}{
		"pool":          pool,
		"zone_count":    len(zones),
		"share_count":   shareCount,
		"usage_percent": usagePercent,
		"available":     pool.FreeSpace - pool.Reserved,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(usage)
}

// updatePoolSpace updates the space information for a pool
func (h *PoolHandler) updatePoolSpace(pool *models.StoragePool) {
	var stat syscall.Statfs_t
	if err := syscall.Statfs(pool.Path, &stat); err == nil {
		pool.TotalSpace = int64(stat.Blocks) * int64(stat.Bsize)
		pool.FreeSpace = int64(stat.Bfree) * int64(stat.Bsize)
		pool.UsedSpace = pool.TotalSpace - pool.FreeSpace
	}
}

// GetPoolZones returns all zones in a pool
func (h *PoolHandler) GetPoolZones(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// Verify pool exists
	if _, err := h.store.GetStoragePool(id); err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	zones := h.store.ListShareZonesByPool(id)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(zones)
}

// ============================================================================
// Share Zone Handlers
// ============================================================================

type ZoneHandler struct {
	store storage.DataStore
}

func NewZoneHandler(store storage.DataStore) *ZoneHandler {
	return &ZoneHandler{store: store}
}

// GetShareZones returns all share zones
func (h *ZoneHandler) GetShareZones(w http.ResponseWriter, r *http.Request) {
	zones := h.store.ListShareZones()

	// Optionally filter by pool
	poolID := r.URL.Query().Get("pool_id")
	if poolID != "" {
		filtered := make([]*models.ShareZone, 0)
		for _, zone := range zones {
			if zone.PoolID == poolID {
				filtered = append(filtered, zone)
			}
		}
		zones = filtered
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(zones)
}

// GetShareZone returns a single share zone
func (h *ZoneHandler) GetShareZone(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	zone, err := h.store.GetShareZone(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(zone)
}

// CreateShareZone creates a new share zone
func (h *ZoneHandler) CreateShareZone(w http.ResponseWriter, r *http.Request) {
	var zone models.ShareZone
	if err := json.NewDecoder(r.Body).Decode(&zone); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate required fields
	if zone.Name == "" {
		http.Error(w, "Zone name is required", http.StatusBadRequest)
		return
	}

	if zone.PoolID == "" {
		http.Error(w, "Pool ID is required", http.StatusBadRequest)
		return
	}

	if zone.Path == "" {
		http.Error(w, "Zone path is required", http.StatusBadRequest)
		return
	}

	// Validate zone type
	if zone.ZoneType == "" {
		zone.ZoneType = models.ZoneTypeGroup // default
	}

	// Get the pool to construct full path
	pool, err := h.store.GetStoragePool(zone.PoolID)
	if err != nil {
		http.Error(w, "Storage pool not found", http.StatusBadRequest)
		return
	}

	// Construct and verify full path
	fullPath := filepath.Join(pool.Path, zone.Path)

	// Create the directory if it doesn't exist
	if err := os.MkdirAll(fullPath, 0755); err != nil {
		http.Error(w, "Cannot create zone directory: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Set defaults
	if zone.AllowedUsers == nil {
		zone.AllowedUsers = []string{}
	}
	if zone.AllowedGroups == nil {
		zone.AllowedGroups = []string{}
	}

	created, err := h.store.CreateShareZone(&zone)
	if err != nil {
		http.Error(w, err.Error(), http.StatusConflict)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(created)
}

// UpdateShareZone updates an existing share zone
func (h *ZoneHandler) UpdateShareZone(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var updates map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&updates); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	updated, err := h.store.UpdateShareZone(id, updates)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(updated)
}

// DeleteShareZone deletes a share zone
func (h *ZoneHandler) DeleteShareZone(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	if err := h.store.DeleteShareZone(id); err != nil {
		if err.Error() == "share zone not found" {
			http.Error(w, err.Error(), http.StatusNotFound)
		} else {
			http.Error(w, err.Error(), http.StatusConflict)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Share zone deleted"})
}

// GetZoneUsage returns detailed usage information for a zone
func (h *ZoneHandler) GetZoneUsage(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	zone, err := h.store.GetShareZone(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	pool, err := h.store.GetStoragePool(zone.PoolID)
	if err != nil {
		http.Error(w, "Pool not found", http.StatusInternalServerError)
		return
	}

	fullPath := filepath.Join(pool.Path, zone.Path)

	// Calculate zone size
	var totalSize int64
	var fileCount int
	var dirCount int

	filepath.Walk(fullPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() {
			dirCount++
		} else {
			fileCount++
			totalSize += info.Size()
		}
		return nil
	})

	// Get share count
	shares := h.store.ListShares()
	shareCount := 0
	for _, share := range shares {
		if share.ZoneID == id {
			shareCount++
		}
	}

	usage := map[string]interface{}{
		"zone":        zone,
		"pool":        pool,
		"full_path":   fullPath,
		"total_size":  totalSize,
		"file_count":  fileCount,
		"dir_count":   dirCount,
		"share_count": shareCount,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(usage)
}

// ProvisionUserDirectory creates a user directory in the zone
func (h *ZoneHandler) ProvisionUserDirectory(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req struct {
		Username string `json:"username"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Username == "" {
		http.Error(w, "Username is required", http.StatusBadRequest)
		return
	}

	zone, err := h.store.GetShareZone(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	pool, err := h.store.GetStoragePool(zone.PoolID)
	if err != nil {
		http.Error(w, "Pool not found", http.StatusInternalServerError)
		return
	}

	// Create user directory
	userPath := filepath.Join(pool.Path, zone.Path, req.Username)
	if err := os.MkdirAll(userPath, 0755); err != nil {
		http.Error(w, "Cannot create user directory: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "User directory created",
		"path":    userPath,
	})
}
