package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os/exec"
	"strings"
	"time"

	"fileserv/config"
	"fileserv/internal/auth"
	"fileserv/middleware"
	"fileserv/storage"
)

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type LoginResponse struct {
	Token     string      `json:"token"`
	ExpiresAt int64       `json:"expires_at"`
	User      interface{} `json:"user"`
}

type UserResponse struct {
	ID       string   `json:"id"`
	Username string   `json:"username"`
	IsAdmin  bool     `json:"is_admin"`
	Groups   []string `json:"groups"`
}

func Login(store storage.DataStore, cfg *config.Config, jwtSecret string) http.HandlerFunc {
	// Set admin groups from config
	if len(cfg.AdminGroups) > 0 {
		auth.SetAdminGroups(cfg.AdminGroups)
	}

	return func(w http.ResponseWriter, r *http.Request) {
		var req LoginRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request", http.StatusBadRequest)
			return
		}

		var userID, username string
		var isAdmin bool
		var groups []string

		if cfg.UsePAM {
			// Use PAM authentication
			pamUser, err := auth.AuthenticatePAM(req.Username, req.Password)
			if err != nil {
				log.Printf("PAM auth failed for user %s: %v", req.Username, err)
				http.Error(w, "Invalid credentials", http.StatusUnauthorized)
				return
			}

			userID = pamUser.UID
			username = pamUser.Username
			isAdmin = pamUser.IsAdmin
			groups = pamUser.Groups

			log.Printf("PAM auth successful for user %s (admin=%v, groups=%v)", username, isAdmin, groups)
		} else {
			// Use internal user store
			user, err := store.GetUserByUsername(req.Username)
			if err != nil {
				http.Error(w, "Invalid credentials", http.StatusUnauthorized)
				return
			}

			if !user.CheckPassword(req.Password) {
				http.Error(w, "Invalid credentials", http.StatusUnauthorized)
				return
			}

			userID = user.ID
			username = user.Username
			isAdmin = user.IsAdmin
			groups = user.Groups
		}

		// Generate JWT token
		expiresAt := time.Now().Add(24 * time.Hour)
		token, err := auth.GenerateToken(userID, username, isAdmin, groups, jwtSecret, 24*time.Hour)
		if err != nil {
			http.Error(w, "Failed to generate token", http.StatusInternalServerError)
			return
		}

		// Store session
		if err := store.CreateSession(userID, token, expiresAt); err != nil {
			http.Error(w, "Failed to create session", http.StatusInternalServerError)
			return
		}

		response := LoginResponse{
			Token:     token,
			ExpiresAt: expiresAt.Unix(),
			User: UserResponse{
				ID:       userID,
				Username: username,
				IsAdmin:  isAdmin,
				Groups:   groups,
			},
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
	}
}

func Logout() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Token would be invalidated here if we were tracking sessions
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"message": "Logged out successfully"})
	}
}

func RefreshToken(jwtSecret string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userCtx := middleware.GetUserContext(r)
		if userCtx == nil {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		// Generate new token
		expiresAt := time.Now().Add(24 * time.Hour)
		token, err := auth.GenerateToken(userCtx.UserID, userCtx.Username, userCtx.IsAdmin, userCtx.Groups, jwtSecret, 24*time.Hour)
		if err != nil {
			http.Error(w, "Failed to generate token", http.StatusInternalServerError)
			return
		}

		response := LoginResponse{
			Token:     token,
			ExpiresAt: expiresAt.Unix(),
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
	}
}

func GetCurrentUser() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userCtx := middleware.GetUserContext(r)
		if userCtx == nil {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"id":       userCtx.UserID,
			"username": userCtx.Username,
			"is_admin": userCtx.IsAdmin,
			"groups":   userCtx.Groups,
		})
	}
}

type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

// ChangePassword allows the current user to change their own password
func ChangePassword(cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userCtx := middleware.GetUserContext(r)
		if userCtx == nil {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		var req ChangePasswordRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		if req.CurrentPassword == "" || req.NewPassword == "" {
			http.Error(w, "Current password and new password are required", http.StatusBadRequest)
			return
		}

		if len(req.NewPassword) < 8 {
			http.Error(w, "New password must be at least 8 characters", http.StatusBadRequest)
			return
		}

		// SECURITY: Validate password doesn't contain dangerous characters
		// Newlines could inject additional user:password pairs into chpasswd
		// Colons could modify the username:password format
		if strings.ContainsAny(req.NewPassword, "\n\r:") {
			http.Error(w, "Password cannot contain newlines or colons", http.StatusBadRequest)
			return
		}

		// Also validate the current password doesn't have injection characters
		if strings.ContainsAny(req.CurrentPassword, "\n\r:") {
			http.Error(w, "Invalid password format", http.StatusBadRequest)
			return
		}

		// Verify current password by attempting PAM authentication
		if cfg.UsePAM {
			_, err := auth.AuthenticatePAM(userCtx.Username, req.CurrentPassword)
			if err != nil {
				http.Error(w, "Current password is incorrect", http.StatusUnauthorized)
				return
			}

			// Use chpasswd to change password
			// SECURITY: Username comes from verified JWT context, password validated above
			cmd := exec.Command("chpasswd")
			cmd.Stdin = strings.NewReader(fmt.Sprintf("%s:%s", userCtx.Username, req.NewPassword))
			if output, err := cmd.CombinedOutput(); err != nil {
				log.Printf("Failed to change password for %s: %v - %s", userCtx.Username, err, string(output))
				http.Error(w, "Failed to change password", http.StatusInternalServerError)
				return
			}
		} else {
			// For non-PAM mode, this would need to update the internal user store
			http.Error(w, "Password change not supported in non-PAM mode", http.StatusNotImplemented)
			return
		}

		log.Printf("Password changed successfully for user %s", userCtx.Username)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "Password changed successfully"})
	}
}
