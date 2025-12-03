package middleware

import (
	"context"
	"net/http"
	"strings"

	"fileserv/internal/auth"
)

type contextKey string

const UserContextKey contextKey = "user"

type UserContext struct {
	UserID   string
	Username string
	IsAdmin  bool
	Groups   []string
}

func Auth(jwtSecret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Get token from Authorization header
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}

			// Extract token
			parts := strings.Split(authHeader, " ")
			if len(parts) != 2 || parts[0] != "Bearer" {
				http.Error(w, "Invalid authorization header", http.StatusUnauthorized)
				return
			}

			token := parts[1]

			// Validate token
			claims, err := auth.ValidateToken(token, jwtSecret)
			if err != nil {
				http.Error(w, "Invalid token", http.StatusUnauthorized)
				return
			}

			// Add user info to context
			userCtx := &UserContext{
				UserID:   claims.UserID,
				Username: claims.Username,
				IsAdmin:  claims.IsAdmin,
				Groups:   claims.Groups,
			}

			ctx := context.WithValue(r.Context(), UserContextKey, userCtx)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func RequireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userCtx, ok := r.Context().Value(UserContextKey).(*UserContext)
		if !ok {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		if !userCtx.IsAdmin {
			http.Error(w, "Forbidden: admin access required", http.StatusForbidden)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func GetUserContext(r *http.Request) *UserContext {
	userCtx, _ := r.Context().Value(UserContextKey).(*UserContext)
	return userCtx
}
