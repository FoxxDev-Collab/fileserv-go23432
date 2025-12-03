package storage

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"sync"
	"time"

	"fileserv/models"

	"github.com/google/uuid"
)

type Store struct {
	filename     string
	mu           sync.RWMutex
	Users        map[string]*models.User        `json:"users"`
	Permissions  []models.Permission            `json:"permissions"`
	Sessions     map[string]*models.Session     `json:"sessions"`
	Shares       map[string]*models.Share       `json:"shares"`
	StoragePools map[string]*models.StoragePool `json:"storage_pools"`
	ShareZones   map[string]*models.ShareZone   `json:"share_zones"`
	ShareLinks   map[string]*models.ShareLink   `json:"share_links"`
}

func NewStore(filename string) (*Store, error) {
	store := &Store{
		filename:     filename,
		Users:        make(map[string]*models.User),
		Permissions:  make([]models.Permission, 0),
		Sessions:     make(map[string]*models.Session),
		Shares:       make(map[string]*models.Share),
		StoragePools: make(map[string]*models.StoragePool),
		ShareZones:   make(map[string]*models.ShareZone),
		ShareLinks:   make(map[string]*models.ShareLink),
	}

	// Load existing data if file exists
	if _, err := os.Stat(filename); err == nil {
		if err := store.load(); err != nil {
			return nil, err
		}
	}

	return store, nil
}

func (s *Store) load() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.filename)
	if err != nil {
		return err
	}

	return json.Unmarshal(data, s)
}

func (s *Store) save() error {
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(s.filename, data, 0600)
}

// User operations
func (s *Store) GetUserByUsername(username string) (*models.User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, user := range s.Users {
		if user.Username == username {
			return user, nil
		}
	}

	return nil, errors.New("user not found")
}

func (s *Store) GetUserByID(id string) (*models.User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	user, exists := s.Users[id]
	if !exists {
		return nil, errors.New("user not found")
	}

	return user, nil
}

func (s *Store) CreateUser(username, password, email string, isAdmin bool, groups []string) (*models.User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Check if username already exists
	for _, user := range s.Users {
		if user.Username == username {
			return nil, errors.New("username already exists")
		}
	}

	user := &models.User{
		ID:                uuid.New().String(),
		Username:          username,
		Email:             email,
		IsAdmin:           isAdmin,
		Groups:            groups,
		MustChangePassword: false,
		CreatedAt:         time.Now(),
		UpdatedAt:         time.Now(),
	}

	if err := user.SetPassword(password); err != nil {
		return nil, err
	}

	s.Users[user.ID] = user

	if err := s.save(); err != nil {
		return nil, err
	}

	return user, nil
}

func (s *Store) UpdateUser(id string, updates map[string]interface{}) (*models.User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	user, exists := s.Users[id]
	if !exists {
		return nil, errors.New("user not found")
	}

	// Apply updates
	if username, ok := updates["username"].(string); ok {
		// Check if new username is already taken
		for uid, u := range s.Users {
			if uid != id && u.Username == username {
				return nil, errors.New("username already exists")
			}
		}
		user.Username = username
	}

	if email, ok := updates["email"].(string); ok {
		user.Email = email
	}

	if isAdmin, ok := updates["is_admin"].(bool); ok {
		user.IsAdmin = isAdmin
	}

	if groups, ok := updates["groups"].([]interface{}); ok {
		user.Groups = make([]string, len(groups))
		for i, g := range groups {
			user.Groups[i] = fmt.Sprint(g)
		}
	}

	if password, ok := updates["password"].(string); ok && password != "" {
		if err := user.SetPassword(password); err != nil {
			return nil, err
		}
		user.MustChangePassword = false
	}

	if mustChange, ok := updates["must_change_password"].(bool); ok {
		user.MustChangePassword = mustChange
	}

	user.UpdatedAt = time.Now()

	if err := s.save(); err != nil {
		return nil, err
	}

	return user, nil
}

func (s *Store) DeleteUser(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.Users[id]; !exists {
		return errors.New("user not found")
	}

	delete(s.Users, id)

	return s.save()
}

func (s *Store) ListUsers() []*models.User {
	s.mu.RLock()
	defer s.mu.RUnlock()

	users := make([]*models.User, 0, len(s.Users))
	for _, user := range s.Users {
		users = append(users, user)
	}

	return users
}

// Permission operations
func (s *Store) CreatePermission(path string, permType models.PermissionType, username, group string) (*models.Permission, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	perm := models.Permission{
		ID:        uuid.New().String(),
		Path:      path,
		Type:      permType,
		Username:  username,
		Group:     group,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	s.Permissions = append(s.Permissions, perm)

	if err := s.save(); err != nil {
		return nil, err
	}

	return &perm, nil
}

func (s *Store) DeletePermission(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i, perm := range s.Permissions {
		if perm.ID == id {
			s.Permissions = append(s.Permissions[:i], s.Permissions[i+1:]...)
			return s.save()
		}
	}

	return errors.New("permission not found")
}

func (s *Store) UpdatePermission(id string, path string, permType models.PermissionType, username, group string) (*models.Permission, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i, perm := range s.Permissions {
		if perm.ID == id {
			if path != "" {
				s.Permissions[i].Path = path
			}
			if permType != "" {
				s.Permissions[i].Type = permType
			}
			if username != "" {
				s.Permissions[i].Username = username
				s.Permissions[i].Group = "" // Clear group if username is set
			}
			if group != "" {
				s.Permissions[i].Group = group
				s.Permissions[i].Username = "" // Clear username if group is set
			}
			s.Permissions[i].UpdatedAt = time.Now()

			if err := s.save(); err != nil {
				return nil, err
			}

			return &s.Permissions[i], nil
		}
	}

	return nil, errors.New("permission not found")
}

func (s *Store) ListPermissions() []models.Permission {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return s.Permissions
}

func (s *Store) GetPermissions() []models.Permission {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return s.Permissions
}

// Session operations
func (s *Store) CreateSession(userID string, token string, expiresAt time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.Sessions[token] = &models.Session{
		Token:     token,
		UserID:    userID,
		ExpiresAt: expiresAt,
		CreatedAt: time.Now(),
	}

	return s.save()
}

func (s *Store) GetSession(token string) (*models.Session, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	session, exists := s.Sessions[token]
	if !exists {
		return nil, errors.New("session not found")
	}

	if session.IsExpired() {
		return nil, errors.New("session expired")
	}

	return session, nil
}

func (s *Store) DeleteSession(token string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	delete(s.Sessions, token)

	return s.save()
}

// CleanExpiredSessions removes expired sessions
func (s *Store) CleanExpiredSessions() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for token, session := range s.Sessions {
		if session.IsExpired() {
			delete(s.Sessions, token)
		}
	}

	return s.save()
}

// Share operations

// CreateShare creates a new file share
func (s *Store) CreateShare(share *models.Share) (*models.Share, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Check if share name already exists
	for _, existing := range s.Shares {
		if existing.Name == share.Name {
			return nil, errors.New("share name already exists")
		}
	}

	// Ensure shares map is initialized
	if s.Shares == nil {
		s.Shares = make(map[string]*models.Share)
	}

	share.ID = uuid.New().String()
	now := time.Now()
	share.CreatedAt = now
	share.UpdatedAt = now

	s.Shares[share.ID] = share

	if err := s.save(); err != nil {
		return nil, err
	}

	return share, nil
}

// GetShare retrieves a share by ID
func (s *Store) GetShare(id string) (*models.Share, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	share, exists := s.Shares[id]
	if !exists {
		return nil, errors.New("share not found")
	}

	return share, nil
}

// GetShareByName retrieves a share by name
func (s *Store) GetShareByName(name string) (*models.Share, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, share := range s.Shares {
		if share.Name == name {
			return share, nil
		}
	}

	return nil, errors.New("share not found")
}

// UpdateShare updates an existing share
func (s *Store) UpdateShare(id string, updates map[string]interface{}) (*models.Share, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	share, exists := s.Shares[id]
	if !exists {
		return nil, errors.New("share not found")
	}

	// Apply updates
	if name, ok := updates["name"].(string); ok {
		// Check if new name is already taken
		for sid, sh := range s.Shares {
			if sid != id && sh.Name == name {
				return nil, errors.New("share name already exists")
			}
		}
		share.Name = name
	}

	if path, ok := updates["path"].(string); ok {
		share.Path = path
	}

	if description, ok := updates["description"].(string); ok {
		share.Description = description
	}

	if enabled, ok := updates["enabled"].(bool); ok {
		share.Enabled = enabled
	}

	if readOnly, ok := updates["read_only"].(bool); ok {
		share.ReadOnly = readOnly
	}

	if browsable, ok := updates["browsable"].(bool); ok {
		share.Browsable = browsable
	}

	if guestAccess, ok := updates["guest_access"].(bool); ok {
		share.GuestAccess = guestAccess
	}

	if allowedUsers, ok := updates["allowed_users"].([]interface{}); ok {
		share.AllowedUsers = make([]string, len(allowedUsers))
		for i, u := range allowedUsers {
			share.AllowedUsers[i] = fmt.Sprint(u)
		}
	}

	if allowedGroups, ok := updates["allowed_groups"].([]interface{}); ok {
		share.AllowedGroups = make([]string, len(allowedGroups))
		for i, g := range allowedGroups {
			share.AllowedGroups[i] = fmt.Sprint(g)
		}
	}

	if denyUsers, ok := updates["deny_users"].([]interface{}); ok {
		share.DenyUsers = make([]string, len(denyUsers))
		for i, u := range denyUsers {
			share.DenyUsers[i] = fmt.Sprint(u)
		}
	}

	if denyGroups, ok := updates["deny_groups"].([]interface{}); ok {
		share.DenyGroups = make([]string, len(denyGroups))
		for i, g := range denyGroups {
			share.DenyGroups[i] = fmt.Sprint(g)
		}
	}

	share.UpdatedAt = time.Now()

	if err := s.save(); err != nil {
		return nil, err
	}

	return share, nil
}

// DeleteShare removes a share by ID
func (s *Store) DeleteShare(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.Shares[id]; !exists {
		return errors.New("share not found")
	}

	delete(s.Shares, id)

	return s.save()
}

// ListShares returns all shares
func (s *Store) ListShares() []*models.Share {
	s.mu.RLock()
	defer s.mu.RUnlock()

	shares := make([]*models.Share, 0, len(s.Shares))
	for _, share := range s.Shares {
		shares = append(shares, share)
	}

	return shares
}

// ListSharesByProtocol returns shares filtered by protocol
func (s *Store) ListSharesByProtocol(protocol models.ShareProtocol) []*models.Share {
	s.mu.RLock()
	defer s.mu.RUnlock()

	shares := make([]*models.Share, 0)
	for _, share := range s.Shares {
		if share.Protocol == protocol {
			shares = append(shares, share)
		}
	}

	return shares
}

// ============================================================================
// Storage Pool Operations
// ============================================================================

// CreateStoragePool creates a new storage pool
func (s *Store) CreateStoragePool(pool *models.StoragePool) (*models.StoragePool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Check if pool name already exists
	for _, existing := range s.StoragePools {
		if existing.Name == pool.Name {
			return nil, errors.New("storage pool name already exists")
		}
	}

	// Ensure map is initialized
	if s.StoragePools == nil {
		s.StoragePools = make(map[string]*models.StoragePool)
	}

	pool.ID = uuid.New().String()
	now := time.Now()
	pool.CreatedAt = now
	pool.UpdatedAt = now

	s.StoragePools[pool.ID] = pool

	if err := s.save(); err != nil {
		return nil, err
	}

	return pool, nil
}

// GetStoragePool retrieves a storage pool by ID
func (s *Store) GetStoragePool(id string) (*models.StoragePool, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	pool, exists := s.StoragePools[id]
	if !exists {
		return nil, errors.New("storage pool not found")
	}

	return pool, nil
}

// GetStoragePoolByName retrieves a storage pool by name
func (s *Store) GetStoragePoolByName(name string) (*models.StoragePool, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, pool := range s.StoragePools {
		if pool.Name == name {
			return pool, nil
		}
	}

	return nil, errors.New("storage pool not found")
}

// UpdateStoragePool updates an existing storage pool
func (s *Store) UpdateStoragePool(id string, updates map[string]interface{}) (*models.StoragePool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	pool, exists := s.StoragePools[id]
	if !exists {
		return nil, errors.New("storage pool not found")
	}

	if name, ok := updates["name"].(string); ok {
		for pid, p := range s.StoragePools {
			if pid != id && p.Name == name {
				return nil, errors.New("storage pool name already exists")
			}
		}
		pool.Name = name
	}

	if path, ok := updates["path"].(string); ok {
		pool.Path = path
	}

	if description, ok := updates["description"].(string); ok {
		pool.Description = description
	}

	if enabled, ok := updates["enabled"].(bool); ok {
		pool.Enabled = enabled
	}

	if reserved, ok := updates["reserved"].(float64); ok {
		pool.Reserved = int64(reserved)
	}

	if maxFileSize, ok := updates["max_file_size"].(float64); ok {
		pool.MaxFileSize = int64(maxFileSize)
	}

	if allowedTypes, ok := updates["allowed_types"].([]interface{}); ok {
		pool.AllowedTypes = make([]string, len(allowedTypes))
		for i, t := range allowedTypes {
			pool.AllowedTypes[i] = fmt.Sprint(t)
		}
	}

	if deniedTypes, ok := updates["denied_types"].([]interface{}); ok {
		pool.DeniedTypes = make([]string, len(deniedTypes))
		for i, t := range deniedTypes {
			pool.DeniedTypes[i] = fmt.Sprint(t)
		}
	}

	if defaultUserQuota, ok := updates["default_user_quota"].(float64); ok {
		pool.DefaultUserQuota = int64(defaultUserQuota)
	}

	if defaultGroupQuota, ok := updates["default_group_quota"].(float64); ok {
		pool.DefaultGroupQuota = int64(defaultGroupQuota)
	}

	pool.UpdatedAt = time.Now()

	if err := s.save(); err != nil {
		return nil, err
	}

	return pool, nil
}

// DeleteStoragePool removes a storage pool by ID
func (s *Store) DeleteStoragePool(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.StoragePools[id]; !exists {
		return errors.New("storage pool not found")
	}

	// Check if any zones reference this pool
	for _, zone := range s.ShareZones {
		if zone.PoolID == id {
			return errors.New("cannot delete pool: zones still reference this pool")
		}
	}

	delete(s.StoragePools, id)

	return s.save()
}

// ListStoragePools returns all storage pools
func (s *Store) ListStoragePools() []*models.StoragePool {
	s.mu.RLock()
	defer s.mu.RUnlock()

	pools := make([]*models.StoragePool, 0, len(s.StoragePools))
	for _, pool := range s.StoragePools {
		pools = append(pools, pool)
	}

	return pools
}

// ============================================================================
// Share Zone Operations
// ============================================================================

// CreateShareZone creates a new share zone
func (s *Store) CreateShareZone(zone *models.ShareZone) (*models.ShareZone, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Check if zone name already exists
	for _, existing := range s.ShareZones {
		if existing.Name == zone.Name {
			return nil, errors.New("share zone name already exists")
		}
	}

	// Verify pool exists
	if _, exists := s.StoragePools[zone.PoolID]; !exists {
		return nil, errors.New("storage pool not found")
	}

	// Ensure map is initialized
	if s.ShareZones == nil {
		s.ShareZones = make(map[string]*models.ShareZone)
	}

	zone.ID = uuid.New().String()
	now := time.Now()
	zone.CreatedAt = now
	zone.UpdatedAt = now

	s.ShareZones[zone.ID] = zone

	if err := s.save(); err != nil {
		return nil, err
	}

	return zone, nil
}

// GetShareZone retrieves a share zone by ID
func (s *Store) GetShareZone(id string) (*models.ShareZone, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	zone, exists := s.ShareZones[id]
	if !exists {
		return nil, errors.New("share zone not found")
	}

	return zone, nil
}

// GetShareZoneByName retrieves a share zone by name
func (s *Store) GetShareZoneByName(name string) (*models.ShareZone, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, zone := range s.ShareZones {
		if zone.Name == name {
			return zone, nil
		}
	}

	return nil, errors.New("share zone not found")
}

// UpdateShareZone updates an existing share zone
func (s *Store) UpdateShareZone(id string, updates map[string]interface{}) (*models.ShareZone, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	zone, exists := s.ShareZones[id]
	if !exists {
		return nil, errors.New("share zone not found")
	}

	if name, ok := updates["name"].(string); ok {
		for zid, z := range s.ShareZones {
			if zid != id && z.Name == name {
				return nil, errors.New("share zone name already exists")
			}
		}
		zone.Name = name
	}

	if poolID, ok := updates["pool_id"].(string); ok {
		if _, exists := s.StoragePools[poolID]; !exists {
			return nil, errors.New("storage pool not found")
		}
		zone.PoolID = poolID
	}

	if path, ok := updates["path"].(string); ok {
		zone.Path = path
	}

	if description, ok := updates["description"].(string); ok {
		zone.Description = description
	}

	if zoneType, ok := updates["zone_type"].(string); ok {
		zone.ZoneType = models.ShareZoneType(zoneType)
	}

	if enabled, ok := updates["enabled"].(bool); ok {
		zone.Enabled = enabled
	}

	if autoProvision, ok := updates["auto_provision"].(bool); ok {
		zone.AutoProvision = autoProvision
	}

	if provisionTemplate, ok := updates["provision_template"].(string); ok {
		zone.ProvisionTemplate = provisionTemplate
	}

	if allowedUsers, ok := updates["allowed_users"].([]interface{}); ok {
		zone.AllowedUsers = make([]string, len(allowedUsers))
		for i, u := range allowedUsers {
			zone.AllowedUsers[i] = fmt.Sprint(u)
		}
	}

	if allowedGroups, ok := updates["allowed_groups"].([]interface{}); ok {
		zone.AllowedGroups = make([]string, len(allowedGroups))
		for i, g := range allowedGroups {
			zone.AllowedGroups[i] = fmt.Sprint(g)
		}
	}

	if allowNetworkShares, ok := updates["allow_network_shares"].(bool); ok {
		zone.AllowNetworkShares = allowNetworkShares
	}

	if allowWebShares, ok := updates["allow_web_shares"].(bool); ok {
		zone.AllowWebShares = allowWebShares
	}

	if allowGuestAccess, ok := updates["allow_guest_access"].(bool); ok {
		zone.AllowGuestAccess = allowGuestAccess
	}

	if maxQuotaPerUser, ok := updates["max_quota_per_user"].(float64); ok {
		zone.MaxQuotaPerUser = int64(maxQuotaPerUser)
	}

	zone.UpdatedAt = time.Now()

	if err := s.save(); err != nil {
		return nil, err
	}

	return zone, nil
}

// DeleteShareZone removes a share zone by ID
func (s *Store) DeleteShareZone(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.ShareZones[id]; !exists {
		return errors.New("share zone not found")
	}

	// Check if any shares reference this zone
	for _, share := range s.Shares {
		if share.ZoneID == id {
			return errors.New("cannot delete zone: shares still reference this zone")
		}
	}

	delete(s.ShareZones, id)

	return s.save()
}

// ListShareZones returns all share zones
func (s *Store) ListShareZones() []*models.ShareZone {
	s.mu.RLock()
	defer s.mu.RUnlock()

	zones := make([]*models.ShareZone, 0, len(s.ShareZones))
	for _, zone := range s.ShareZones {
		zones = append(zones, zone)
	}

	return zones
}

// ListShareZonesByPool returns share zones filtered by pool ID
func (s *Store) ListShareZonesByPool(poolID string) []*models.ShareZone {
	s.mu.RLock()
	defer s.mu.RUnlock()

	zones := make([]*models.ShareZone, 0)
	for _, zone := range s.ShareZones {
		if zone.PoolID == poolID {
			zones = append(zones, zone)
		}
	}

	return zones
}

// ============================================================================
// Share Link Operations
// ============================================================================

// CreateShareLink creates a new share link
func (s *Store) CreateShareLink(link *models.ShareLink) (*models.ShareLink, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Ensure map is initialized
	if s.ShareLinks == nil {
		s.ShareLinks = make(map[string]*models.ShareLink)
	}

	link.ID = uuid.New().String()
	now := time.Now()
	link.CreatedAt = now
	link.UpdatedAt = now

	s.ShareLinks[link.ID] = link

	if err := s.save(); err != nil {
		return nil, err
	}

	return link, nil
}

// GetShareLink retrieves a share link by ID
func (s *Store) GetShareLink(id string) (*models.ShareLink, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	link, exists := s.ShareLinks[id]
	if !exists {
		return nil, errors.New("share link not found")
	}

	return link, nil
}

// GetShareLinkByToken retrieves a share link by token
func (s *Store) GetShareLinkByToken(token string) (*models.ShareLink, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, link := range s.ShareLinks {
		if link.Token == token {
			return link, nil
		}
	}

	return nil, errors.New("share link not found")
}

// UpdateShareLink updates an existing share link
func (s *Store) UpdateShareLink(id string, updates map[string]interface{}) (*models.ShareLink, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	link, exists := s.ShareLinks[id]
	if !exists {
		return nil, errors.New("share link not found")
	}

	if name, ok := updates["name"].(string); ok {
		link.Name = name
	}

	if description, ok := updates["description"].(string); ok {
		link.Description = description
	}

	if customMessage, ok := updates["custom_message"].(string); ok {
		link.CustomMessage = customMessage
	}

	if showOwner, ok := updates["show_owner"].(bool); ok {
		link.ShowOwner = showOwner
	}

	if enabled, ok := updates["enabled"].(bool); ok {
		link.Enabled = enabled
	}

	if allowDownload, ok := updates["allow_download"].(bool); ok {
		link.AllowDownload = allowDownload
	}

	if allowPreview, ok := updates["allow_preview"].(bool); ok {
		link.AllowPreview = allowPreview
	}

	if allowUpload, ok := updates["allow_upload"].(bool); ok {
		link.AllowUpload = allowUpload
	}

	if allowListing, ok := updates["allow_listing"].(bool); ok {
		link.AllowListing = allowListing
	}

	if maxDownloads, ok := updates["max_downloads"].(float64); ok {
		link.MaxDownloads = int(maxDownloads)
	}

	if maxViews, ok := updates["max_views"].(float64); ok {
		link.MaxViews = int(maxViews)
	}

	if expiresAt, ok := updates["expires_at"].(string); ok {
		if expiresAt == "" {
			link.ExpiresAt = nil
		} else {
			t, err := time.Parse(time.RFC3339, expiresAt)
			if err == nil {
				link.ExpiresAt = &t
			}
		}
	}

	if passwordHash, ok := updates["password_hash"].(string); ok {
		link.PasswordHash = passwordHash
	}

	link.UpdatedAt = time.Now()

	if err := s.save(); err != nil {
		return nil, err
	}

	return link, nil
}

// DeleteShareLink removes a share link by ID
func (s *Store) DeleteShareLink(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.ShareLinks[id]; !exists {
		return errors.New("share link not found")
	}

	delete(s.ShareLinks, id)

	return s.save()
}

// ListShareLinks returns all share links
func (s *Store) ListShareLinks() []*models.ShareLink {
	s.mu.RLock()
	defer s.mu.RUnlock()

	links := make([]*models.ShareLink, 0, len(s.ShareLinks))
	for _, link := range s.ShareLinks {
		links = append(links, link)
	}

	return links
}

// ListShareLinksByOwner returns share links filtered by owner ID
func (s *Store) ListShareLinksByOwner(ownerID string) []*models.ShareLink {
	s.mu.RLock()
	defer s.mu.RUnlock()

	links := make([]*models.ShareLink, 0)
	for _, link := range s.ShareLinks {
		if link.OwnerID == ownerID {
			links = append(links, link)
		}
	}

	return links
}

// IncrementShareLinkDownload increments the download count
func (s *Store) IncrementShareLinkDownload(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	link, exists := s.ShareLinks[id]
	if !exists {
		return errors.New("share link not found")
	}

	link.DownloadCount++
	now := time.Now()
	link.LastAccessed = &now
	link.UpdatedAt = now

	return s.save()
}

// IncrementShareLinkView increments the view count
func (s *Store) IncrementShareLinkView(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	link, exists := s.ShareLinks[id]
	if !exists {
		return errors.New("share link not found")
	}

	link.ViewCount++
	now := time.Now()
	link.LastAccessed = &now
	link.UpdatedAt = now

	return s.save()
}

// CleanExpiredShareLinks removes expired share links
func (s *Store) CleanExpiredShareLinks() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for id, link := range s.ShareLinks {
		if link.IsExpired() {
			delete(s.ShareLinks, id)
		}
	}

	return s.save()
}
