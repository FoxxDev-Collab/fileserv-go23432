package auth

import (
	"fmt"
	"os/user"
	"strings"

	"github.com/msteinert/pam/v2"
)

// AdminGroups defines which system groups grant admin privileges
// sudo is first for Ubuntu/Debian compatibility, wheel for RHEL/CentOS
var AdminGroups = []string{"sudo", "wheel", "admin", "root"}

// PAMUser represents an authenticated system user
type PAMUser struct {
	Username string
	UID      string
	GID      string
	Name     string
	HomeDir  string
	Groups   []string
	IsAdmin  bool
}

// AuthenticatePAM authenticates a user against the system PAM
func AuthenticatePAM(username, password string) (*PAMUser, error) {
	// Create PAM transaction
	t, err := pam.StartFunc("login", username, func(style pam.Style, msg string) (string, error) {
		switch style {
		case pam.PromptEchoOff:
			return password, nil
		case pam.PromptEchoOn:
			return username, nil
		case pam.ErrorMsg:
			return "", fmt.Errorf("PAM error: %s", msg)
		case pam.TextInfo:
			return "", nil
		default:
			return "", fmt.Errorf("unrecognized PAM style: %v", style)
		}
	})
	if err != nil {
		return nil, fmt.Errorf("PAM start failed: %w", err)
	}
	defer t.End()

	// Authenticate the user
	if err := t.Authenticate(0); err != nil {
		return nil, fmt.Errorf("authentication failed: %w", err)
	}

	// Check if account is valid (not expired, etc.)
	if err := t.AcctMgmt(0); err != nil {
		return nil, fmt.Errorf("account validation failed: %w", err)
	}

	// Get user information from the system
	sysUser, err := user.Lookup(username)
	if err != nil {
		return nil, fmt.Errorf("user lookup failed: %w", err)
	}

	// Get user's groups
	groupIDs, err := sysUser.GroupIds()
	if err != nil {
		return nil, fmt.Errorf("group lookup failed: %w", err)
	}

	// Convert group IDs to group names
	groups := make([]string, 0, len(groupIDs))
	for _, gid := range groupIDs {
		g, err := user.LookupGroupId(gid)
		if err == nil {
			groups = append(groups, g.Name)
		}
	}

	// Check if user is admin based on group membership
	isAdmin := checkAdminGroups(groups)

	return &PAMUser{
		Username: username,
		UID:      sysUser.Uid,
		GID:      sysUser.Gid,
		Name:     sysUser.Name,
		HomeDir:  sysUser.HomeDir,
		Groups:   groups,
		IsAdmin:  isAdmin,
	}, nil
}

// checkAdminGroups checks if the user belongs to any admin group
func checkAdminGroups(groups []string) bool {
	for _, userGroup := range groups {
		for _, adminGroup := range AdminGroups {
			if strings.EqualFold(userGroup, adminGroup) {
				return true
			}
		}
	}
	return false
}

// SetAdminGroups allows configuring which groups are considered admin
func SetAdminGroups(groups []string) {
	AdminGroups = groups
}
