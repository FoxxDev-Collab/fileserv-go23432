package handlers

import (
	"bufio"
	"encoding/json"
	"net/http"
	"os"
	"os/user"
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
