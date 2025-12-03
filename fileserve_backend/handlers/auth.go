package handlers

import (
	"encoding/json"
	"log"
	"net/http"
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

func Login(store storage.DataStore, cfg *config.Config) http.HandlerFunc {
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
		token, err := auth.GenerateToken(userID, username, isAdmin, groups, cfg.JWTSecret, 24*time.Hour)
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

func RefreshToken(cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userCtx := middleware.GetUserContext(r)
		if userCtx == nil {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		// Generate new token
		expiresAt := time.Now().Add(24 * time.Hour)
		token, err := auth.GenerateToken(userCtx.UserID, userCtx.Username, userCtx.IsAdmin, userCtx.Groups, cfg.JWTSecret, 24*time.Hour)
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
