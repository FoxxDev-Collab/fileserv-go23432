package models

import "time"

// Setting represents a single configuration setting
type Setting struct {
	Key       string    `json:"key"`
	Value     string    `json:"value"`
	Type      string    `json:"type"` // string, int, bool, json
	Category  string    `json:"category"`
	UpdatedAt time.Time `json:"updated_at"`
}

// SettingsCategory groups related settings
type SettingsCategory string

const (
	CategoryGeneral  SettingsCategory = "general"
	CategorySecurity SettingsCategory = "security"
	CategoryAuth     SettingsCategory = "auth"
	CategoryStorage  SettingsCategory = "storage"
)

// Known setting keys
const (
	SettingServerName    = "server_name"
	SettingJWTSecret     = "jwt_secret"
	SettingSessionExpiry = "session_expiry_hours"
	SettingUsePAM        = "use_pam"
	SettingAdminGroups   = "admin_groups"
	SettingSetupComplete = "setup_complete"
	SettingCreatedAt     = "created_at"
)

// SetupRequest represents the initial setup wizard data
type SetupRequest struct {
	ServerName     string   `json:"server_name"`
	AdminGroups    []string `json:"admin_groups"`
	UsePAM         bool     `json:"use_pam"`
	SessionExpiry  int      `json:"session_expiry_hours"`
}

// SetupStatus represents the current setup state
type SetupStatus struct {
	SetupComplete bool   `json:"setup_complete"`
	ServerName    string `json:"server_name,omitempty"`
}
