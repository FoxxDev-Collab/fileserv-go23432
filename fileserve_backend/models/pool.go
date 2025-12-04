package models

import "time"

// StoragePool represents a defined storage location where shares can exist
type StoragePool struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`        // "Primary Storage", "Archive Pool"
	Path        string    `json:"path"`        // /srv/data, /mnt/storage
	Description string    `json:"description"`
	Enabled     bool      `json:"enabled"`
	TotalSpace  int64     `json:"total_space"` // Total bytes (from df)
	UsedSpace   int64     `json:"used_space"`  // Used bytes
	FreeSpace   int64     `json:"free_space"`  // Free bytes
	Reserved    int64     `json:"reserved"`    // Reserved for system

	// Constraints
	MaxFileSize  int64    `json:"max_file_size"`  // Per-file limit (0 = unlimited)
	AllowedTypes []string `json:"allowed_types"`  // File extensions allowed (empty = all)
	DeniedTypes  []string `json:"denied_types"`   // Blocked extensions

	// Quotas
	DefaultUserQuota  int64 `json:"default_user_quota"`  // Default quota per user (bytes)
	DefaultGroupQuota int64 `json:"default_group_quota"` // Default quota per group (bytes)

	// Metadata
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ShareZoneType defines the type of share zone
type ShareZoneType string

const (
	ZoneTypePersonal ShareZoneType = "personal" // User home directories
	ZoneTypeGroup    ShareZoneType = "group"    // Team/department shares
	ZoneTypePublic   ShareZoneType = "public"   // Public shares
)

// ShareZone maps directories where shares can exist within a pool
type ShareZone struct {
	ID          string        `json:"id"`
	PoolID      string        `json:"pool_id"` // References StoragePool
	Name        string        `json:"name"`    // "User Homes", "Team Shares", "Public"
	Path        string        `json:"path"`    // Relative path within pool
	Description string        `json:"description"`
	ZoneType    ShareZoneType `json:"zone_type"` // personal, group, public
	Enabled     bool          `json:"enabled"`

	// Auto-provisioning
	AutoProvision     bool   `json:"auto_provision"`     // Auto-create user directories
	ProvisionTemplate string `json:"provision_template"` // Template name for new dirs

	// Access control
	AllowedUsers  []string `json:"allowed_users"`
	AllowedGroups []string `json:"allowed_groups"`
	DenyUsers     []string `json:"deny_users"`     // Explicitly denied users
	DenyGroups    []string `json:"deny_groups"`    // Explicitly denied groups

	// Sharing rules
	AllowNetworkShares bool `json:"allow_network_shares"` // SMB/NFS
	AllowWebShares     bool `json:"allow_web_shares"`     // Public links
	AllowGuestAccess   bool `json:"allow_guest_access"`

	// Network sharing configuration
	SMBEnabled bool               `json:"smb_enabled"` // Enable SMB sharing for this zone
	NFSEnabled bool               `json:"nfs_enabled"` // Enable NFS sharing for this zone
	SMBOptions *ZoneSMBOptions    `json:"smb_options,omitempty"`
	NFSOptions *ZoneNFSOptions    `json:"nfs_options,omitempty"`
	WebOptions *ZoneWebOptions    `json:"web_options,omitempty"`

	// Quotas (override pool defaults)
	MaxQuotaPerUser int64 `json:"max_quota_per_user"` // 0 = use pool default

	// Permissions
	ReadOnly  bool `json:"read_only"`  // Read-only zone
	Browsable bool `json:"browsable"`  // Show in network browser

	// Metadata
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ZoneSMBOptions contains SMB/Samba-specific configuration for a zone
type ZoneSMBOptions struct {
	ShareName     string `json:"share_name"`     // SMB share name (default: zone name)
	Comment       string `json:"comment"`        // Share comment
	ValidUsers    string `json:"valid_users"`    // Raw Samba valid users directive
	InvalidUsers  string `json:"invalid_users"`  // Raw Samba invalid users directive
	WriteList     string `json:"write_list"`     // Users with write access
	ReadList      string `json:"read_list"`      // Users with read-only access
	CreateMask    string `json:"create_mask"`    // File creation mask (e.g., "0644")
	DirectoryMask string `json:"directory_mask"` // Directory creation mask (e.g., "0755")
	ForceUser     string `json:"force_user"`     // Force all operations as this user
	ForceGroup    string `json:"force_group"`    // Force all operations as this group
	VetoFiles     string `json:"veto_files"`     // Files to hide/block
	Inherit       bool   `json:"inherit"`        // Inherit permissions
}

// ZoneNFSOptions contains NFS-specific configuration for a zone
type ZoneNFSOptions struct {
	ExportPath     string   `json:"export_path"`      // Custom export path (default: zone full path)
	AllowedHosts   []string `json:"allowed_hosts"`    // Hosts/networks allowed (e.g., "192.168.1.0/24")
	RootSquash     bool     `json:"root_squash"`      // Map root to nobody
	AllSquash      bool     `json:"all_squash"`       // Map all users to nobody
	AnonUID        int      `json:"anon_uid"`         // Anonymous user ID
	AnonGID        int      `json:"anon_gid"`         // Anonymous group ID
	Sync           bool     `json:"sync"`             // Sync writes immediately
	NoSubtreeCheck bool     `json:"no_subtree_check"` // Disable subtree checking
	Secure         bool     `json:"secure"`           // Require connections from privileged ports
	FSId           string   `json:"fsid"`             // Filesystem ID
}

// ZoneWebOptions contains web-based sharing configuration for a zone
type ZoneWebOptions struct {
	PublicEnabled  bool       `json:"public_enabled"`            // Allow public link sharing
	MaxLinkExpiry  int        `json:"max_link_expiry"`           // Max days for link expiry (0 = unlimited)
	AllowDownload  bool       `json:"allow_download"`            // Allow file downloads
	AllowUpload    bool       `json:"allow_upload"`              // Allow file uploads via web
	AllowPreview   bool       `json:"allow_preview"`             // Allow file preview
	AllowListing   bool       `json:"allow_listing"`             // Show directory contents
	RequireAuth    bool       `json:"require_auth"`              // Require authentication for web access
	CustomBranding string     `json:"custom_branding,omitempty"` // Custom branding/message
}

// ShareLink represents a shareable link for a file or folder
type ShareLink struct {
	ID      string `json:"id"`
	ShareID string `json:"share_id,omitempty"` // Parent share (optional)
	OwnerID string `json:"owner_id"`           // User who created link

	// Target
	TargetPath string `json:"target_path"` // Full path to file/folder
	TargetType string `json:"target_type"` // "file" | "folder"
	TargetName string `json:"target_name"` // Display name of target

	// Access
	Token        string `json:"token"`                   // URL-safe token
	PasswordHash string `json:"password_hash,omitempty"` // Optional (bcrypt)

	// Limits
	ExpiresAt     *time.Time `json:"expires_at,omitempty"`
	MaxDownloads  int        `json:"max_downloads"`  // 0 = unlimited
	DownloadCount int        `json:"download_count"`
	MaxViews      int        `json:"max_views"` // 0 = unlimited
	ViewCount     int        `json:"view_count"`

	// Permissions
	AllowDownload bool `json:"allow_download"`
	AllowPreview  bool `json:"allow_preview"`
	AllowUpload   bool `json:"allow_upload"` // For folders only
	AllowListing  bool `json:"allow_listing"` // Show directory contents

	// Display
	Name          string `json:"name"`        // Custom display name
	Description   string `json:"description"` // Optional description
	CustomMessage string `json:"custom_message,omitempty"`
	ShowOwner     bool   `json:"show_owner"`

	// Metadata
	Enabled      bool       `json:"enabled"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
	LastAccessed *time.Time `json:"last_accessed,omitempty"`
}

// WebShareOptions contains web-based sharing configuration for a Share
type WebShareOptions struct {
	// Public link sharing
	PublicEnabled  bool   `json:"public_enabled"`
	PublicToken    string `json:"public_token,omitempty"`    // UUID for public URL
	PublicPassword string `json:"public_password,omitempty"` // Optional password (bcrypt)

	// Expiration
	ExpiresAt     *time.Time `json:"expires_at,omitempty"`
	MaxDownloads  int        `json:"max_downloads"`  // 0 = unlimited
	DownloadCount int        `json:"download_count"` // Current count

	// Permissions
	AllowDownload bool `json:"allow_download"`
	AllowUpload   bool `json:"allow_upload"`
	AllowPreview  bool `json:"allow_preview"`
	AllowListing  bool `json:"allow_listing"` // Show directory contents

	// Branding
	CustomMessage string `json:"custom_message,omitempty"`
	ShowOwner     bool   `json:"show_owner"`
}

// ShareType defines how a share is accessed
type ShareType string

const (
	ShareTypeNetwork ShareType = "network" // SMB/NFS only
	ShareTypeWeb     ShareType = "web"     // Web links only
	ShareTypeBoth    ShareType = "both"    // Both network and web
)

// ShareVisibility defines who can access a share
type ShareVisibility string

const (
	VisibilityPrivate  ShareVisibility = "private"  // Only specific users
	VisibilityInternal ShareVisibility = "internal" // All authenticated users
	VisibilityPublic   ShareVisibility = "public"   // Anyone with link
)

// PublicShareInfo is returned for public share access (no auth)
type PublicShareInfo struct {
	Token           string    `json:"token"`
	Name            string    `json:"name"`
	Description     string    `json:"description,omitempty"`
	TargetType      string    `json:"target_type"` // file or folder
	TargetName      string    `json:"target_name"`
	Size            int64     `json:"size,omitempty"`
	CustomMessage   string    `json:"custom_message,omitempty"`
	ShowOwner       bool      `json:"show_owner"`
	OwnerName       string    `json:"owner_name,omitempty"`
	AllowDownload   bool      `json:"allow_download"`
	AllowPreview    bool      `json:"allow_preview"`
	AllowUpload     bool      `json:"allow_upload"`
	AllowListing    bool      `json:"allow_listing"`
	RequiresPassword bool     `json:"requires_password"`
	ExpiresAt       *time.Time `json:"expires_at,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
}

// PublicFileInfo represents a file in a public share listing
type PublicFileInfo struct {
	Name    string    `json:"name"`
	Path    string    `json:"path"`
	Size    int64     `json:"size"`
	IsDir   bool      `json:"is_dir"`
	ModTime time.Time `json:"mod_time"`
}

// NewStoragePool creates a new storage pool with default values
func NewStoragePool(name, path string) *StoragePool {
	now := time.Now()
	return &StoragePool{
		Name:              name,
		Path:              path,
		Enabled:           true,
		AllowedTypes:      []string{},
		DeniedTypes:       []string{},
		DefaultUserQuota:  0, // unlimited
		DefaultGroupQuota: 0, // unlimited
		CreatedAt:         now,
		UpdatedAt:         now,
	}
}

// NewShareZone creates a new share zone with default values
func NewShareZone(name, poolID, path string, zoneType ShareZoneType) *ShareZone {
	now := time.Now()
	return &ShareZone{
		PoolID:             poolID,
		Name:               name,
		Path:               path,
		ZoneType:           zoneType,
		Enabled:            true,
		AutoProvision:      false,
		AllowedUsers:       []string{},
		AllowedGroups:      []string{},
		DenyUsers:          []string{},
		DenyGroups:         []string{},
		AllowNetworkShares: true,
		AllowWebShares:     true,
		AllowGuestAccess:   false,
		SMBEnabled:         true,
		NFSEnabled:         false,
		SMBOptions: &ZoneSMBOptions{
			CreateMask:    "0644",
			DirectoryMask: "0755",
			Inherit:       false,
		},
		NFSOptions: &ZoneNFSOptions{
			AllowedHosts:   []string{"*"},
			RootSquash:     true,
			AllSquash:      false,
			AnonUID:        65534, // nobody
			AnonGID:        65534,
			Sync:           true,
			NoSubtreeCheck: true,
			Secure:         true,
		},
		WebOptions: &ZoneWebOptions{
			PublicEnabled: false,
			AllowDownload: true,
			AllowPreview:  true,
			AllowUpload:   false,
			AllowListing:  true,
			RequireAuth:   true,
		},
		ReadOnly:  false,
		Browsable: true,
		CreatedAt: now,
		UpdatedAt: now,
	}
}

// NewZoneSMBOptions creates default SMB options
func NewZoneSMBOptions() *ZoneSMBOptions {
	return &ZoneSMBOptions{
		CreateMask:    "0644",
		DirectoryMask: "0755",
		Inherit:       false,
	}
}

// NewZoneNFSOptions creates default NFS options
func NewZoneNFSOptions() *ZoneNFSOptions {
	return &ZoneNFSOptions{
		AllowedHosts:   []string{"*"},
		RootSquash:     true,
		AllSquash:      false,
		AnonUID:        65534,
		AnonGID:        65534,
		Sync:           true,
		NoSubtreeCheck: true,
		Secure:         true,
	}
}

// NewZoneWebOptions creates default web options
func NewZoneWebOptions() *ZoneWebOptions {
	return &ZoneWebOptions{
		PublicEnabled: false,
		AllowDownload: true,
		AllowPreview:  true,
		AllowUpload:   false,
		AllowListing:  true,
		RequireAuth:   true,
	}
}

// NewShareLink creates a new share link with default values
func NewShareLink(ownerID, targetPath, targetType, targetName, token string) *ShareLink {
	now := time.Now()
	// Default expiration: 7 days
	expires := now.Add(7 * 24 * time.Hour)
	return &ShareLink{
		OwnerID:       ownerID,
		TargetPath:    targetPath,
		TargetType:    targetType,
		TargetName:    targetName,
		Token:         token,
		ExpiresAt:     &expires,
		MaxDownloads:  0, // unlimited
		MaxViews:      0, // unlimited
		AllowDownload: true,
		AllowPreview:  true,
		AllowUpload:   false,
		AllowListing:  true,
		Enabled:       true,
		ShowOwner:     false,
		CreatedAt:     now,
		UpdatedAt:     now,
	}
}

// IsExpired checks if the share link has expired
func (sl *ShareLink) IsExpired() bool {
	if sl.ExpiresAt == nil {
		return false
	}
	return time.Now().After(*sl.ExpiresAt)
}

// IsDownloadLimitReached checks if download limit is reached
func (sl *ShareLink) IsDownloadLimitReached() bool {
	if sl.MaxDownloads == 0 {
		return false
	}
	return sl.DownloadCount >= sl.MaxDownloads
}

// IsViewLimitReached checks if view limit is reached
func (sl *ShareLink) IsViewLimitReached() bool {
	if sl.MaxViews == 0 {
		return false
	}
	return sl.ViewCount >= sl.MaxViews
}

// IsAccessible checks if the share link can be accessed
func (sl *ShareLink) IsAccessible() bool {
	if !sl.Enabled {
		return false
	}
	if sl.IsExpired() {
		return false
	}
	if sl.IsViewLimitReached() {
		return false
	}
	return true
}

// CanDownload checks if downloads are still allowed
func (sl *ShareLink) CanDownload() bool {
	if !sl.AllowDownload {
		return false
	}
	if sl.IsDownloadLimitReached() {
		return false
	}
	return true
}

// UserHasZoneAccess checks if a user has access to a zone
func (z *ShareZone) UserHasZoneAccess(user *User) bool {
	if !z.Enabled {
		return false
	}

	// Admins always have access
	if user.IsAdmin {
		return true
	}

	// Check deny lists first - explicit denies take precedence
	for _, u := range z.DenyUsers {
		if u == user.Username {
			return false
		}
	}
	for _, denyGroup := range z.DenyGroups {
		for _, userGroup := range user.Groups {
			if denyGroup == userGroup {
				return false
			}
		}
	}

	// If both allowed lists are empty, allow all authenticated users
	// (except those in deny lists, which we already checked)
	if len(z.AllowedUsers) == 0 && len(z.AllowedGroups) == 0 {
		return true
	}

	// Check allowed users
	for _, u := range z.AllowedUsers {
		if u == user.Username || u == "*" {
			return true
		}
	}

	// Check allowed groups
	for _, zoneGroup := range z.AllowedGroups {
		if zoneGroup == "*" {
			return true
		}
		for _, userGroup := range user.Groups {
			if zoneGroup == userGroup {
				return true
			}
		}
	}

	return false
}

// UserZoneInfo represents a zone with its full path for the user
type UserZoneInfo struct {
	ZoneID      string        `json:"zone_id"`
	ZoneName    string        `json:"zone_name"`
	ZoneType    ShareZoneType `json:"zone_type"`
	PoolID      string        `json:"pool_id"`
	PoolName    string        `json:"pool_name"`
	FullPath    string        `json:"full_path"`    // Physical path on disk
	UserPath    string        `json:"user_path"`    // User's subdirectory (for personal zones)
	Description string        `json:"description"`
	CanUpload   bool          `json:"can_upload"`
	CanShare    bool          `json:"can_share"`
}
