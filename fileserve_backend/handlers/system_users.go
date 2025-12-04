package handlers

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"os/user"
	"regexp"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
)

// SystemUser represents a local system user
type SystemUser struct {
	Username string   `json:"username"`
	UID      int      `json:"uid"`
	GID      int      `json:"gid"`
	Name     string   `json:"name"`
	HomeDir  string   `json:"home_dir"`
	Shell    string   `json:"shell"`
	Groups   []string `json:"groups"`
	IsSystem bool     `json:"is_system"` // UID < 1000 typically
}

// SystemGroup represents a local system group
type SystemGroup struct {
	Name    string   `json:"name"`
	GID     int      `json:"gid"`
	Members []string `json:"members"`
}

// CreateSystemUserRequest represents a request to create a new system user
type CreateSystemUserRequest struct {
	Username string   `json:"username"`
	Password string   `json:"password"`
	Name     string   `json:"name"`
	Shell    string   `json:"shell"`
	HomeDir  string   `json:"home_dir"`
	Groups   []string `json:"groups"`
}

// UpdateSystemUserRequest represents a request to update a system user
type UpdateSystemUserRequest struct {
	Password string   `json:"password,omitempty"`
	Name     string   `json:"name,omitempty"`
	Shell    string   `json:"shell,omitempty"`
	HomeDir  string   `json:"home_dir,omitempty"`
	Groups   []string `json:"groups,omitempty"`
	Locked   *bool    `json:"locked,omitempty"`
}

// validUsername checks if a username is valid
func validUsername(username string) bool {
	// Linux username rules: starts with letter or underscore, followed by letters, digits, underscores, or hyphens
	// Max 32 characters
	if len(username) == 0 || len(username) > 32 {
		return false
	}
	matched, _ := regexp.MatchString(`^[a-z_][a-z0-9_-]*$`, username)
	return matched
}

// ListSystemUsers returns all local system users
func ListSystemUsers() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Parse query params
		includeSystem := r.URL.Query().Get("include_system") == "true"

		users, err := getSystemUsers(includeSystem)
		if err != nil {
			http.Error(w, "Failed to list system users: "+err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(users)
	}
}

// ListSystemGroups returns all local system groups
func ListSystemGroups() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		groups, err := getSystemGroups()
		if err != nil {
			http.Error(w, "Failed to list system groups: "+err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(groups)
	}
}

// GetSystemUser returns a specific system user by username
func GetSystemUser() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		username := chi.URLParam(r, "username")
		if username == "" {
			http.Error(w, "Username required", http.StatusBadRequest)
			return
		}

		u, err := user.Lookup(username)
		if err != nil {
			http.Error(w, "User not found", http.StatusNotFound)
			return
		}

		sysUser, err := userToSystemUser(u)
		if err != nil {
			http.Error(w, "Failed to get user details: "+err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(sysUser)
	}
}

// CreateSystemUser creates a new system user
func CreateSystemUser() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req CreateSystemUserRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		// Validate username
		if !validUsername(req.Username) {
			http.Error(w, "Invalid username. Must be lowercase, start with letter or underscore, max 32 chars", http.StatusBadRequest)
			return
		}

		// Check if user already exists
		if _, err := user.Lookup(req.Username); err == nil {
			http.Error(w, "User already exists", http.StatusConflict)
			return
		}

		// Validate password
		if len(req.Password) < 1 {
			http.Error(w, "Password is required", http.StatusBadRequest)
			return
		}

		// Build useradd command
		args := []string{"-m"} // Create home directory

		if req.Name != "" {
			args = append(args, "-c", req.Name)
		}

		if req.Shell != "" {
			// Validate shell exists
			if _, err := os.Stat(req.Shell); err != nil {
				http.Error(w, "Invalid shell: "+req.Shell, http.StatusBadRequest)
				return
			}
			args = append(args, "-s", req.Shell)
		}

		if req.HomeDir != "" {
			args = append(args, "-d", req.HomeDir)
		}

		if len(req.Groups) > 0 {
			// Validate groups exist
			for _, g := range req.Groups {
				if _, err := user.LookupGroup(g); err != nil {
					http.Error(w, fmt.Sprintf("Group '%s' does not exist", g), http.StatusBadRequest)
					return
				}
			}
			args = append(args, "-G", strings.Join(req.Groups, ","))
		}

		args = append(args, req.Username)

		// Create user
		cmd := exec.Command("useradd", args...)
		if output, err := cmd.CombinedOutput(); err != nil {
			http.Error(w, fmt.Sprintf("Failed to create user: %s - %s", err.Error(), string(output)), http.StatusInternalServerError)
			return
		}

		// Set password using chpasswd
		cmd = exec.Command("chpasswd")
		cmd.Stdin = strings.NewReader(fmt.Sprintf("%s:%s", req.Username, req.Password))
		if output, err := cmd.CombinedOutput(); err != nil {
			// Try to clean up the user we just created
			exec.Command("userdel", "-r", req.Username).Run()
			http.Error(w, fmt.Sprintf("Failed to set password: %s - %s", err.Error(), string(output)), http.StatusInternalServerError)
			return
		}

		// Return the created user
		u, err := user.Lookup(req.Username)
		if err != nil {
			http.Error(w, "User created but failed to retrieve details", http.StatusInternalServerError)
			return
		}

		sysUser, _ := userToSystemUser(u)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(sysUser)
	}
}

// UpdateSystemUser updates an existing system user
func UpdateSystemUser() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		username := chi.URLParam(r, "username")
		if username == "" {
			http.Error(w, "Username required", http.StatusBadRequest)
			return
		}

		// Check user exists
		if _, err := user.Lookup(username); err != nil {
			http.Error(w, "User not found", http.StatusNotFound)
			return
		}

		// Prevent modifying root
		if username == "root" {
			http.Error(w, "Cannot modify root user", http.StatusForbidden)
			return
		}

		var req UpdateSystemUserRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		// Build usermod command
		var args []string

		if req.Name != "" {
			args = append(args, "-c", req.Name)
		}

		if req.Shell != "" {
			// Validate shell exists
			if _, err := os.Stat(req.Shell); err != nil {
				http.Error(w, "Invalid shell: "+req.Shell, http.StatusBadRequest)
				return
			}
			args = append(args, "-s", req.Shell)
		}

		if req.HomeDir != "" {
			args = append(args, "-d", req.HomeDir, "-m") // -m moves home directory contents
		}

		if len(req.Groups) > 0 {
			// Validate groups exist
			for _, g := range req.Groups {
				if _, err := user.LookupGroup(g); err != nil {
					http.Error(w, fmt.Sprintf("Group '%s' does not exist", g), http.StatusBadRequest)
					return
				}
			}
			args = append(args, "-G", strings.Join(req.Groups, ","))
		}

		if req.Locked != nil {
			if *req.Locked {
				args = append(args, "-L") // Lock account
			} else {
				args = append(args, "-U") // Unlock account
			}
		}

		// Run usermod if we have changes
		if len(args) > 0 {
			args = append(args, username)
			cmd := exec.Command("usermod", args...)
			if output, err := cmd.CombinedOutput(); err != nil {
				http.Error(w, fmt.Sprintf("Failed to update user: %s - %s", err.Error(), string(output)), http.StatusInternalServerError)
				return
			}
		}

		// Update password if provided
		if req.Password != "" {
			cmd := exec.Command("chpasswd")
			cmd.Stdin = strings.NewReader(fmt.Sprintf("%s:%s", username, req.Password))
			if output, err := cmd.CombinedOutput(); err != nil {
				http.Error(w, fmt.Sprintf("Failed to update password: %s - %s", err.Error(), string(output)), http.StatusInternalServerError)
				return
			}
		}

		// Return the updated user
		u, err := user.Lookup(username)
		if err != nil {
			http.Error(w, "User updated but failed to retrieve details", http.StatusInternalServerError)
			return
		}

		sysUser, _ := userToSystemUser(u)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(sysUser)
	}
}

// DeleteSystemUser deletes a system user
func DeleteSystemUser() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		username := chi.URLParam(r, "username")
		if username == "" {
			http.Error(w, "Username required", http.StatusBadRequest)
			return
		}

		// Check user exists
		if _, err := user.Lookup(username); err != nil {
			http.Error(w, "User not found", http.StatusNotFound)
			return
		}

		// Prevent deleting root or the current process user
		if username == "root" {
			http.Error(w, "Cannot delete root user", http.StatusForbidden)
			return
		}

		// Check query param for removing home directory
		removeHome := r.URL.Query().Get("remove_home") == "true"

		// Build userdel command
		args := []string{}
		if removeHome {
			args = append(args, "-r") // Remove home directory
		}
		args = append(args, username)

		cmd := exec.Command("userdel", args...)
		if output, err := cmd.CombinedOutput(); err != nil {
			http.Error(w, fmt.Sprintf("Failed to delete user: %s - %s", err.Error(), string(output)), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

// getSystemUsers reads /etc/passwd and returns system users
func getSystemUsers(includeSystem bool) ([]SystemUser, error) {
	file, err := os.Open("/etc/passwd")
	if err != nil {
		return nil, err
	}
	defer file.Close()

	var users []SystemUser
	scanner := bufio.NewScanner(file)

	for scanner.Scan() {
		line := scanner.Text()
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		parts := strings.Split(line, ":")
		if len(parts) < 7 {
			continue
		}

		uid, _ := strconv.Atoi(parts[2])
		gid, _ := strconv.Atoi(parts[3])

		// Skip system users if not requested (UID < 1000, except root)
		isSystem := uid < 1000 && uid != 0
		if isSystem && !includeSystem {
			continue
		}

		// Skip nologin users unless system users are included
		shell := parts[6]
		if !includeSystem && (strings.Contains(shell, "nologin") || strings.Contains(shell, "false")) {
			continue
		}

		username := parts[0]
		groups, _ := getUserGroups(username)

		users = append(users, SystemUser{
			Username: username,
			UID:      uid,
			GID:      gid,
			Name:     parts[4],
			HomeDir:  parts[5],
			Shell:    shell,
			Groups:   groups,
			IsSystem: isSystem,
		})
	}

	return users, scanner.Err()
}

// getSystemGroups reads /etc/group and returns system groups
func getSystemGroups() ([]SystemGroup, error) {
	file, err := os.Open("/etc/group")
	if err != nil {
		return nil, err
	}
	defer file.Close()

	var groups []SystemGroup
	scanner := bufio.NewScanner(file)

	for scanner.Scan() {
		line := scanner.Text()
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		parts := strings.Split(line, ":")
		if len(parts) < 4 {
			continue
		}

		gid, _ := strconv.Atoi(parts[2])
		members := []string{}
		if parts[3] != "" {
			members = strings.Split(parts[3], ",")
		}

		groups = append(groups, SystemGroup{
			Name:    parts[0],
			GID:     gid,
			Members: members,
		})
	}

	return groups, scanner.Err()
}

// getUserGroups returns all groups a user belongs to
func getUserGroups(username string) ([]string, error) {
	u, err := user.Lookup(username)
	if err != nil {
		return nil, err
	}

	gids, err := u.GroupIds()
	if err != nil {
		return nil, err
	}

	var groups []string
	for _, gid := range gids {
		g, err := user.LookupGroupId(gid)
		if err == nil {
			groups = append(groups, g.Name)
		}
	}

	return groups, nil
}

// userToSystemUser converts a user.User to SystemUser
func userToSystemUser(u *user.User) (*SystemUser, error) {
	uid, _ := strconv.Atoi(u.Uid)
	gid, _ := strconv.Atoi(u.Gid)
	groups, _ := getUserGroups(u.Username)

	// Get shell from /etc/passwd
	shell := ""
	file, err := os.Open("/etc/passwd")
	if err == nil {
		scanner := bufio.NewScanner(file)
		for scanner.Scan() {
			parts := strings.Split(scanner.Text(), ":")
			if len(parts) >= 7 && parts[0] == u.Username {
				shell = parts[6]
				break
			}
		}
		file.Close()
	}

	return &SystemUser{
		Username: u.Username,
		UID:      uid,
		GID:      gid,
		Name:     u.Name,
		HomeDir:  u.HomeDir,
		Shell:    shell,
		Groups:   groups,
		IsSystem: uid < 1000 && uid != 0,
	}, nil
}
