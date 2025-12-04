package handlers

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"fileserv/models"
	"fileserv/storage"
)

type SetupHandler struct {
	store storage.DataStore
}

func NewSetupHandler(store storage.DataStore) *SetupHandler {
	return &SetupHandler{store: store}
}

// GetSetupStatus returns whether setup has been completed
func (h *SetupHandler) GetSetupStatus(w http.ResponseWriter, r *http.Request) {
	status := models.SetupStatus{
		SetupComplete: h.store.IsSetupComplete(),
	}

	if status.SetupComplete {
		if setting, _ := h.store.GetSetting(models.SettingServerName); setting != nil {
			status.ServerName = setting.Value
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}

// CompleteSetup handles the initial setup wizard submission
func (h *SetupHandler) CompleteSetup(w http.ResponseWriter, r *http.Request) {
	// Check if setup is already complete
	if h.store.IsSetupComplete() {
		http.Error(w, "Setup already completed", http.StatusBadRequest)
		return
	}

	var req models.SetupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate request
	if req.ServerName == "" {
		req.ServerName = "FileServ"
	}
	if len(req.AdminGroups) == 0 {
		req.AdminGroups = []string{"sudo", "wheel", "admin", "root"}
	}
	if req.SessionExpiry <= 0 {
		req.SessionExpiry = 24
	}

	// Generate secure JWT secret
	jwtSecret, err := generateSecureSecret(32)
	if err != nil {
		http.Error(w, "Failed to generate JWT secret", http.StatusInternalServerError)
		return
	}

	// Save settings
	now := time.Now().Format(time.RFC3339)

	if err := h.store.SetSetting(models.SettingServerName, req.ServerName, "string", string(models.CategoryGeneral)); err != nil {
		http.Error(w, "Failed to save settings", http.StatusInternalServerError)
		return
	}

	if err := h.store.SetSetting(models.SettingJWTSecret, jwtSecret, "string", string(models.CategorySecurity)); err != nil {
		http.Error(w, "Failed to save settings", http.StatusInternalServerError)
		return
	}

	if err := h.store.SetSetting(models.SettingSessionExpiry, strconv.Itoa(req.SessionExpiry), "int", string(models.CategorySecurity)); err != nil {
		http.Error(w, "Failed to save settings", http.StatusInternalServerError)
		return
	}

	if err := h.store.SetSetting(models.SettingUsePAM, strconv.FormatBool(req.UsePAM), "bool", string(models.CategoryAuth)); err != nil {
		http.Error(w, "Failed to save settings", http.StatusInternalServerError)
		return
	}

	adminGroupsJSON, _ := json.Marshal(req.AdminGroups)
	if err := h.store.SetSetting(models.SettingAdminGroups, string(adminGroupsJSON), "json", string(models.CategoryAuth)); err != nil {
		http.Error(w, "Failed to save settings", http.StatusInternalServerError)
		return
	}

	if err := h.store.SetSetting(models.SettingCreatedAt, now, "string", string(models.CategoryGeneral)); err != nil {
		http.Error(w, "Failed to save settings", http.StatusInternalServerError)
		return
	}

	// Mark setup as complete
	if err := h.store.SetSetting(models.SettingSetupComplete, "true", "bool", string(models.CategoryGeneral)); err != nil {
		http.Error(w, "Failed to save settings", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Setup completed successfully",
	})
}

// generateSecureSecret generates a cryptographically secure random string
func generateSecureSecret(length int) (string, error) {
	bytes := make([]byte, length)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return base64.URLEncoding.EncodeToString(bytes), nil
}

// SettingsHandler handles settings management for admins
type SettingsHandler struct {
	store storage.DataStore
}

func NewSettingsHandler(store storage.DataStore) *SettingsHandler {
	return &SettingsHandler{store: store}
}

// GetSettings returns all settings (admin only, excludes sensitive values)
func (h *SettingsHandler) GetSettings(w http.ResponseWriter, r *http.Request) {
	settings := h.store.GetAllSettings()

	// Filter out sensitive settings
	filtered := make([]models.Setting, 0, len(settings))
	for _, s := range settings {
		if s.Key == models.SettingJWTSecret {
			// Don't expose JWT secret, just show it exists
			s.Value = "********"
		}
		filtered = append(filtered, s)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(filtered)
}

// GetSettingsByCategory returns settings for a specific category
func (h *SettingsHandler) GetSettingsByCategory(w http.ResponseWriter, r *http.Request) {
	category := r.URL.Query().Get("category")
	if category == "" {
		http.Error(w, "Category required", http.StatusBadRequest)
		return
	}

	settings := h.store.GetSettingsByCategory(category)

	// Filter sensitive
	for i, s := range settings {
		if s.Key == models.SettingJWTSecret {
			settings[i].Value = "********"
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(settings)
}

// UpdateSetting updates a single setting
func (h *SettingsHandler) UpdateSetting(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Key      string `json:"key"`
		Value    string `json:"value"`
		Type     string `json:"type"`
		Category string `json:"category"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Prevent updating certain protected settings
	protectedKeys := []string{models.SettingSetupComplete, models.SettingCreatedAt}
	for _, k := range protectedKeys {
		if req.Key == k {
			http.Error(w, "Cannot modify protected setting", http.StatusForbidden)
			return
		}
	}

	// For JWT secret, generate new one instead of accepting user input
	if req.Key == models.SettingJWTSecret {
		newSecret, err := generateSecureSecret(32)
		if err != nil {
			http.Error(w, "Failed to generate new secret", http.StatusInternalServerError)
			return
		}
		req.Value = newSecret
	}

	if err := h.store.SetSetting(req.Key, req.Value, req.Type, req.Category); err != nil {
		http.Error(w, "Failed to update setting", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Setting updated",
	})
}

// UpdateSettings updates multiple settings at once
func (h *SettingsHandler) UpdateSettings(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ServerName    string   `json:"server_name"`
		AdminGroups   []string `json:"admin_groups"`
		UsePAM        bool     `json:"use_pam"`
		SessionExpiry int      `json:"session_expiry_hours"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Update each setting
	if req.ServerName != "" {
		h.store.SetSetting(models.SettingServerName, req.ServerName, "string", string(models.CategoryGeneral))
	}

	if len(req.AdminGroups) > 0 {
		adminGroupsJSON, _ := json.Marshal(req.AdminGroups)
		h.store.SetSetting(models.SettingAdminGroups, string(adminGroupsJSON), "json", string(models.CategoryAuth))
	}

	h.store.SetSetting(models.SettingUsePAM, strconv.FormatBool(req.UsePAM), "bool", string(models.CategoryAuth))

	if req.SessionExpiry > 0 {
		h.store.SetSetting(models.SettingSessionExpiry, strconv.Itoa(req.SessionExpiry), "int", string(models.CategorySecurity))
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Settings updated",
	})
}

// RegenerateJWTSecret generates a new JWT secret (will invalidate all sessions)
func (h *SettingsHandler) RegenerateJWTSecret(w http.ResponseWriter, r *http.Request) {
	newSecret, err := generateSecureSecret(32)
	if err != nil {
		http.Error(w, "Failed to generate new secret", http.StatusInternalServerError)
		return
	}

	if err := h.store.SetSetting(models.SettingJWTSecret, newSecret, "string", string(models.CategorySecurity)); err != nil {
		http.Error(w, "Failed to save new secret", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "JWT secret regenerated. All sessions have been invalidated.",
	})
}

// GetJWTSecret returns the current JWT secret (for internal use by config loader)
func GetJWTSecretFromStore(store storage.DataStore) string {
	setting, err := store.GetSetting(models.SettingJWTSecret)
	if err != nil || setting == nil {
		return ""
	}
	return setting.Value
}

// GetAdminGroupsFromStore returns admin groups from settings
func GetAdminGroupsFromStore(store storage.DataStore) []string {
	setting, err := store.GetSetting(models.SettingAdminGroups)
	if err != nil || setting == nil {
		return []string{"sudo", "wheel", "admin", "root"}
	}

	var groups []string
	if err := json.Unmarshal([]byte(setting.Value), &groups); err != nil {
		// Fallback: try comma-separated
		return strings.Split(setting.Value, ",")
	}
	return groups
}

// GetUsePAMFromStore returns PAM setting
func GetUsePAMFromStore(store storage.DataStore) bool {
	setting, err := store.GetSetting(models.SettingUsePAM)
	if err != nil || setting == nil {
		return true // Default to PAM enabled
	}
	return setting.Value == "true"
}
