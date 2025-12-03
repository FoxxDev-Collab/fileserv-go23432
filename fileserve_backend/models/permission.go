package models

import "time"

type PermissionType string

const (
	PermissionRead   PermissionType = "read"
	PermissionWrite  PermissionType = "write"
	PermissionDelete PermissionType = "delete"
)

type Permission struct {
	ID          string           `json:"id"`
	Path        string           `json:"path"`
	Type        PermissionType   `json:"type"`
	Username    string           `json:"username,omitempty"`
	Group       string           `json:"group,omitempty"`
	CreatedAt   time.Time        `json:"created_at"`
	UpdatedAt   time.Time        `json:"updated_at"`
}

// HasPermission checks if a user has a specific permission for a path
func HasPermission(permissions []Permission, user *User, path string, permType PermissionType) bool {
	// Admins have all permissions
	if user.IsAdmin {
		return true
	}

	for _, perm := range permissions {
		// Check if path matches (exact match or parent path)
		if !pathMatches(perm.Path, path) {
			continue
		}

		// Check permission type
		if perm.Type != permType {
			continue
		}

		// Check if permission applies to user or their groups
		if perm.Username == user.Username {
			return true
		}

		if perm.Group != "" {
			for _, group := range user.Groups {
				if group == perm.Group {
					return true
				}
			}
		}
	}

	return false
}

// pathMatches checks if a permission path applies to the requested path
func pathMatches(permPath, requestPath string) bool {
	// Exact match
	if permPath == requestPath {
		return true
	}

	// Check if permPath is a parent of requestPath
	if len(permPath) < len(requestPath) {
		if requestPath[:len(permPath)] == permPath {
			// Make sure it's a path boundary
			if requestPath[len(permPath)] == '/' {
				return true
			}
		}
	}

	return false
}
