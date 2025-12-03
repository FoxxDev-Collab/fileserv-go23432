package models

import "time"

// ShareProtocol defines the protocol type for a share
type ShareProtocol string

const (
	ProtocolSMB  ShareProtocol = "smb"
	ProtocolNFS  ShareProtocol = "nfs"
	ProtocolNone ShareProtocol = "none" // Web-only share
)

// Share represents a file share configuration
type Share struct {
	ID          string        `json:"id"`
	Name        string        `json:"name"`
	Path        string        `json:"path"`        // Filesystem path to share
	Protocol    ShareProtocol `json:"protocol"`    // smb, nfs, or none
	Description string        `json:"description"` // Human-readable description
	Enabled     bool          `json:"enabled"`     // Whether the share is active
	CreatedAt   time.Time     `json:"created_at"`
	UpdatedAt   time.Time     `json:"updated_at"`

	// Pool/Zone mapping (new)
	PoolID  string `json:"pool_id,omitempty"`  // Storage pool this share belongs to
	ZoneID  string `json:"zone_id,omitempty"`  // Share zone this share belongs to
	OwnerID string `json:"owner_id,omitempty"` // User who owns this share

	// Share type and visibility (new)
	ShareType  ShareType       `json:"share_type,omitempty"`  // network, web, or both
	Visibility ShareVisibility `json:"visibility,omitempty"`  // private, internal, or public

	// Access control
	AllowedUsers  []string `json:"allowed_users"`  // Usernames allowed access
	AllowedGroups []string `json:"allowed_groups"` // Groups allowed access
	DenyUsers     []string `json:"deny_users"`     // Explicitly denied users
	DenyGroups    []string `json:"deny_groups"`    // Explicitly denied groups
	GuestAccess   bool     `json:"guest_access"`   // Allow anonymous access

	// Permissions
	ReadOnly  bool `json:"read_only"`  // Read-only share
	Browsable bool `json:"browsable"`  // Show in network browser

	// SMB-specific options
	SMBOptions *SMBShareOptions `json:"smb_options,omitempty"`

	// NFS-specific options
	NFSOptions *NFSShareOptions `json:"nfs_options,omitempty"`

	// Web sharing options (new)
	WebOptions *WebShareOptions `json:"web_options,omitempty"`
}

// SMBShareOptions contains SMB/Samba-specific configuration
type SMBShareOptions struct {
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

// NFSShareOptions contains NFS-specific configuration
type NFSShareOptions struct {
	AllowedHosts  []string `json:"allowed_hosts"`  // Hosts/networks allowed (e.g., "192.168.1.0/24")
	RootSquash    bool     `json:"root_squash"`    // Map root to nobody
	AllSquash     bool     `json:"all_squash"`     // Map all users to nobody
	AnonUID       int      `json:"anon_uid"`       // Anonymous user ID
	AnonGID       int      `json:"anon_gid"`       // Anonymous group ID
	Sync          bool     `json:"sync"`           // Sync writes immediately
	NoSubtreeCheck bool    `json:"no_subtree_check"` // Disable subtree checking
	Secure        bool     `json:"secure"`         // Require connections from privileged ports
	FSId          string   `json:"fsid"`           // Filesystem ID
}

// ShareAccess represents access rights for a specific user/group on a share
type ShareAccess struct {
	ID        string    `json:"id"`
	ShareID   string    `json:"share_id"`
	Username  string    `json:"username,omitempty"`  // User granted access
	GroupName string    `json:"group_name,omitempty"` // Group granted access
	CanRead   bool      `json:"can_read"`
	CanWrite  bool      `json:"can_write"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// NewSMBShare creates a new SMB share with default options
func NewSMBShare(name, path string) *Share {
	now := time.Now()
	return &Share{
		Name:        name,
		Path:        path,
		Protocol:    ProtocolSMB,
		Enabled:     true,
		CreatedAt:   now,
		UpdatedAt:   now,
		AllowedUsers: []string{},
		AllowedGroups: []string{},
		DenyUsers:   []string{},
		DenyGroups:  []string{},
		GuestAccess: false,
		ReadOnly:    false,
		Browsable:   true,
		SMBOptions: &SMBShareOptions{
			CreateMask:    "0644",
			DirectoryMask: "0755",
			Inherit:       false,
		},
	}
}

// NewNFSShare creates a new NFS share with default options
func NewNFSShare(name, path string) *Share {
	now := time.Now()
	return &Share{
		Name:        name,
		Path:        path,
		Protocol:    ProtocolNFS,
		Enabled:     true,
		CreatedAt:   now,
		UpdatedAt:   now,
		AllowedUsers: []string{},
		AllowedGroups: []string{},
		DenyUsers:   []string{},
		DenyGroups:  []string{},
		GuestAccess: false,
		ReadOnly:    false,
		Browsable:   true,
		NFSOptions: &NFSShareOptions{
			AllowedHosts:   []string{"*"},
			RootSquash:     true,
			AllSquash:      false,
			AnonUID:        65534, // nobody
			AnonGID:        65534,
			Sync:           true,
			NoSubtreeCheck: true,
			Secure:         true,
		},
	}
}
