package handlers

import (
	"encoding/json"
	"net/http"

	"fileserv/storage"

	"github.com/go-chi/chi/v5"
)

type CreateUserRequest struct {
	Username string   `json:"username"`
	Password string   `json:"password"`
	Email    string   `json:"email"`
	IsAdmin  bool     `json:"is_admin"`
	Groups   []string `json:"groups"`
}

type UpdateUserRequest struct {
	Username          *string   `json:"username,omitempty"`
	Password          *string   `json:"password,omitempty"`
	Email             *string   `json:"email,omitempty"`
	IsAdmin           *bool     `json:"is_admin,omitempty"`
	Groups            *[]string `json:"groups,omitempty"`
	MustChangePassword *bool    `json:"must_change_password,omitempty"`
}

func ListUsers(store storage.DataStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		users := store.ListUsers()

		safeUsers := make([]interface{}, len(users))
		for i, user := range users {
			safeUsers[i] = user.Safe()
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(safeUsers)
	}
}

func CreateUser(store storage.DataStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req CreateUserRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request", http.StatusBadRequest)
			return
		}

		if req.Username == "" || req.Password == "" {
			http.Error(w, "Username and password are required", http.StatusBadRequest)
			return
		}

		if req.Groups == nil {
			req.Groups = []string{}
		}

		user, err := store.CreateUser(req.Username, req.Password, req.Email, req.IsAdmin, req.Groups)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(user.Safe())
	}
}

func UpdateUser(store storage.DataStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		if id == "" {
			http.Error(w, "User ID is required", http.StatusBadRequest)
			return
		}

		var req UpdateUserRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request", http.StatusBadRequest)
			return
		}

		// Build updates map
		updates := make(map[string]interface{})
		if req.Username != nil {
			updates["username"] = *req.Username
		}
		if req.Password != nil {
			updates["password"] = *req.Password
		}
		if req.Email != nil {
			updates["email"] = *req.Email
		}
		if req.IsAdmin != nil {
			updates["is_admin"] = *req.IsAdmin
		}
		if req.Groups != nil {
			updates["groups"] = *req.Groups
		}
		if req.MustChangePassword != nil {
			updates["must_change_password"] = *req.MustChangePassword
		}

		user, err := store.UpdateUser(id, updates)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(user.Safe())
	}
}

func DeleteUser(store storage.DataStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		if id == "" {
			http.Error(w, "User ID is required", http.StatusBadRequest)
			return
		}

		if err := store.DeleteUser(id); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}
