package handlers

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"fileserv/models"
)

const (
	smbConfPath         = "/etc/samba/smb.conf"
	fileservSharesFile  = "/etc/samba/fileserv-shares.conf"
	nfsExportsPath      = "/etc/exports"
	fileservExportsFile = "/etc/exports.d/fileserv.exports"
)

// GenerateSMBShareConfig generates a Samba share configuration for a zone
func GenerateSMBShareConfig(zone *models.ShareZone, fullPath string) string {
	if zone.SMBOptions == nil {
		return ""
	}

	opts := zone.SMBOptions
	shareName := opts.ShareName
	if shareName == "" {
		shareName = zone.Name
	}

	// Sanitize share name (no special characters)
	shareName = strings.ReplaceAll(shareName, " ", "_")
	shareName = strings.ReplaceAll(shareName, "/", "_")

	var config strings.Builder
	config.WriteString(fmt.Sprintf("\n[%s]\n", shareName))
	config.WriteString(fmt.Sprintf("   path = %s\n", fullPath))

	if opts.Comment != "" {
		config.WriteString(fmt.Sprintf("   comment = %s\n", opts.Comment))
	} else {
		config.WriteString(fmt.Sprintf("   comment = %s\n", zone.Description))
	}

	// Browsability
	if zone.Browsable {
		config.WriteString("   browseable = yes\n")
	} else {
		config.WriteString("   browseable = no\n")
	}

	// Read only
	if zone.ReadOnly {
		config.WriteString("   read only = yes\n")
	} else {
		config.WriteString("   read only = no\n")
		config.WriteString("   writable = yes\n")
	}

	// Guest access
	if zone.AllowGuestAccess {
		config.WriteString("   guest ok = yes\n")
		config.WriteString("   public = yes\n")
	} else {
		config.WriteString("   guest ok = no\n")
	}

	// Valid users - combine zone allowed users/groups with SMB-specific settings
	validUsers := buildValidUsersList(zone, opts)
	if validUsers != "" {
		config.WriteString(fmt.Sprintf("   valid users = %s\n", validUsers))
	}

	// Invalid users
	if opts.InvalidUsers != "" {
		config.WriteString(fmt.Sprintf("   invalid users = %s\n", opts.InvalidUsers))
	}

	// Write list
	if opts.WriteList != "" {
		config.WriteString(fmt.Sprintf("   write list = %s\n", opts.WriteList))
	}

	// Read list
	if opts.ReadList != "" {
		config.WriteString(fmt.Sprintf("   read list = %s\n", opts.ReadList))
	}

	// Force user/group
	if opts.ForceUser != "" {
		config.WriteString(fmt.Sprintf("   force user = %s\n", opts.ForceUser))
	}
	if opts.ForceGroup != "" {
		config.WriteString(fmt.Sprintf("   force group = %s\n", opts.ForceGroup))
	}

	// File masks - use sensible defaults for Windows compatibility if not set
	createMask := opts.CreateMask
	if createMask == "" {
		createMask = "0664" // rw-rw-r-- default for files
	}
	config.WriteString(fmt.Sprintf("   create mask = %s\n", createMask))

	directoryMask := opts.DirectoryMask
	if directoryMask == "" {
		directoryMask = "0775" // rwxrwxr-x default for directories
	}
	config.WriteString(fmt.Sprintf("   directory mask = %s\n", directoryMask))

	// Force modes ensure minimum permissions (especially useful for Windows clients)
	config.WriteString(fmt.Sprintf("   force create mode = %s\n", createMask))
	config.WriteString(fmt.Sprintf("   force directory mode = %s\n", directoryMask))

	// Inherit permissions
	if opts.Inherit {
		config.WriteString("   inherit permissions = yes\n")
	}

	// Veto files
	if opts.VetoFiles != "" {
		config.WriteString(fmt.Sprintf("   veto files = %s\n", opts.VetoFiles))
	}

	return config.String()
}

// buildValidUsersList builds the valid users directive from zone settings
func buildValidUsersList(zone *models.ShareZone, opts *models.ZoneSMBOptions) string {
	var parts []string

	// Add explicit valid users from SMB options
	if opts.ValidUsers != "" {
		parts = append(parts, opts.ValidUsers)
	}

	// Add allowed users from zone
	for _, user := range zone.AllowedUsers {
		if user != "" && user != "*" {
			parts = append(parts, user)
		}
	}

	// Add allowed groups with @ prefix for Samba
	for _, group := range zone.AllowedGroups {
		if group != "" && group != "*" {
			parts = append(parts, "@"+group)
		}
	}

	return strings.Join(parts, " ")
}

// GenerateNFSExportConfig generates an NFS export line for a zone
func GenerateNFSExportConfig(zone *models.ShareZone, fullPath string) string {
	if zone.NFSOptions == nil {
		return ""
	}

	opts := zone.NFSOptions
	exportPath := fullPath
	if opts.ExportPath != "" {
		exportPath = opts.ExportPath
	}

	// Build options string
	var optionsList []string

	if !zone.ReadOnly {
		optionsList = append(optionsList, "rw")
	} else {
		optionsList = append(optionsList, "ro")
	}

	if opts.Sync {
		optionsList = append(optionsList, "sync")
	} else {
		optionsList = append(optionsList, "async")
	}

	if opts.RootSquash {
		optionsList = append(optionsList, "root_squash")
	} else {
		optionsList = append(optionsList, "no_root_squash")
	}

	if opts.AllSquash {
		optionsList = append(optionsList, "all_squash")
	}

	if opts.NoSubtreeCheck {
		optionsList = append(optionsList, "no_subtree_check")
	} else {
		optionsList = append(optionsList, "subtree_check")
	}

	if opts.Secure {
		optionsList = append(optionsList, "secure")
	} else {
		optionsList = append(optionsList, "insecure")
	}

	if opts.AnonUID > 0 {
		optionsList = append(optionsList, fmt.Sprintf("anonuid=%d", opts.AnonUID))
	}
	if opts.AnonGID > 0 {
		optionsList = append(optionsList, fmt.Sprintf("anongid=%d", opts.AnonGID))
	}
	if opts.FSId != "" {
		optionsList = append(optionsList, fmt.Sprintf("fsid=%s", opts.FSId))
	}

	optionsStr := strings.Join(optionsList, ",")

	// Build export lines for each allowed host
	var exports strings.Builder
	hosts := opts.AllowedHosts
	if len(hosts) == 0 {
		hosts = []string{"*"}
	}

	for _, host := range hosts {
		exports.WriteString(fmt.Sprintf("%s %s(%s)\n", exportPath, host, optionsStr))
	}

	return exports.String()
}

// ApplySMBConfig writes all zone SMB configurations to the Samba config
func ApplySMBConfig(zones []*models.ShareZone, pools map[string]*models.StoragePool) error {
	var config strings.Builder
	config.WriteString("# FileServ managed shares - DO NOT EDIT MANUALLY\n")
	config.WriteString("# This file is auto-generated by FileServ\n\n")

	for _, zone := range zones {
		if !zone.SMBEnabled || zone.SMBOptions == nil {
			continue
		}

		pool, ok := pools[zone.PoolID]
		if !ok || !pool.Enabled {
			continue
		}

		fullPath := filepath.Join(pool.Path, zone.Path)
		shareConfig := GenerateSMBShareConfig(zone, fullPath)
		if shareConfig != "" {
			config.WriteString(shareConfig)
		}
	}

	// Write to fileserv-shares.conf
	if err := os.WriteFile(fileservSharesFile, []byte(config.String()), 0644); err != nil {
		return fmt.Errorf("failed to write SMB config: %w", err)
	}

	// Ensure the include directive is in smb.conf
	if err := ensureSMBInclude(); err != nil {
		return fmt.Errorf("failed to update smb.conf include: %w", err)
	}

	// Reload Samba configuration
	return reloadSamba()
}

// ensureSMBInclude adds the include directive to smb.conf if not present
func ensureSMBInclude() error {
	includeDirective := fmt.Sprintf("include = %s", fileservSharesFile)

	content, err := os.ReadFile(smbConfPath)
	if err != nil {
		if os.IsNotExist(err) {
			// Create minimal smb.conf if it doesn't exist
			minimalConf := fmt.Sprintf("[global]\n   workgroup = WORKGROUP\n   server string = FileServ\n   security = user\n   map to guest = bad user\n\n%s\n", includeDirective)
			return os.WriteFile(smbConfPath, []byte(minimalConf), 0644)
		}
		return err
	}

	// Check if include directive already exists
	if strings.Contains(string(content), fileservSharesFile) {
		return nil
	}

	// Find the [global] section and add include after it
	lines := strings.Split(string(content), "\n")
	var newLines []string
	inGlobal := false
	includeAdded := false

	for _, line := range lines {
		newLines = append(newLines, line)
		trimmed := strings.TrimSpace(line)

		if strings.HasPrefix(trimmed, "[global]") {
			inGlobal = true
		} else if inGlobal && !includeAdded && (strings.HasPrefix(trimmed, "[") || trimmed == "") {
			// Add include before next section or at empty line in global
			if strings.HasPrefix(trimmed, "[") {
				// Insert before this section
				newLines = append(newLines[:len(newLines)-1], "   "+includeDirective, "", line)
			} else if trimmed == "" {
				// Insert at this empty line
				newLines = append(newLines[:len(newLines)-1], "   "+includeDirective, "")
			}
			includeAdded = true
			inGlobal = false
		}
	}

	// If still not added, append at the end
	if !includeAdded {
		newLines = append(newLines, "", includeDirective)
	}

	return os.WriteFile(smbConfPath, []byte(strings.Join(newLines, "\n")), 0644)
}

// reloadSamba reloads the Samba configuration
func reloadSamba() error {
	// Try smbcontrol first (graceful reload)
	cmd := exec.Command("smbcontrol", "all", "reload-config")
	if err := cmd.Run(); err == nil {
		return nil
	}

	// Fall back to systemctl reload
	cmd = exec.Command("sudo", "systemctl", "reload", "smbd")
	if err := cmd.Run(); err == nil {
		return nil
	}

	// Try smb service name
	cmd = exec.Command("sudo", "systemctl", "reload", "smb")
	return cmd.Run()
}

// ApplyNFSConfig writes all zone NFS exports
func ApplyNFSConfig(zones []*models.ShareZone, pools map[string]*models.StoragePool) error {
	var exports strings.Builder
	exports.WriteString("# FileServ managed exports - DO NOT EDIT MANUALLY\n")
	exports.WriteString("# This file is auto-generated by FileServ\n\n")

	for _, zone := range zones {
		if !zone.NFSEnabled || zone.NFSOptions == nil {
			continue
		}

		pool, ok := pools[zone.PoolID]
		if !ok || !pool.Enabled {
			continue
		}

		fullPath := filepath.Join(pool.Path, zone.Path)
		exportConfig := GenerateNFSExportConfig(zone, fullPath)
		if exportConfig != "" {
			exports.WriteString(exportConfig)
		}
	}

	// Ensure exports.d directory exists
	exportsDir := filepath.Dir(fileservExportsFile)
	if err := os.MkdirAll(exportsDir, 0755); err != nil {
		return fmt.Errorf("failed to create exports.d directory: %w", err)
	}

	// Write to fileserv.exports
	if err := os.WriteFile(fileservExportsFile, []byte(exports.String()), 0644); err != nil {
		return fmt.Errorf("failed to write NFS exports: %w", err)
	}

	// Ensure /etc/exports includes exports.d
	if err := ensureNFSInclude(); err != nil {
		return fmt.Errorf("failed to update /etc/exports: %w", err)
	}

	// Re-export all filesystems
	return reloadNFS()
}

// ensureNFSInclude ensures /etc/exports includes exports.d files
func ensureNFSInclude() error {
	content, err := os.ReadFile(nfsExportsPath)
	if err != nil {
		if os.IsNotExist(err) {
			// Create with include
			return os.WriteFile(nfsExportsPath, []byte("# See exports.d for additional exports\n"), 0644)
		}
		return err
	}

	// Check for exports.d reference
	if strings.Contains(string(content), "exports.d") {
		return nil
	}

	// Append a comment about exports.d
	newContent := string(content) + "\n# Additional exports are in /etc/exports.d/\n"
	return os.WriteFile(nfsExportsPath, []byte(newContent), 0644)
}

// reloadNFS re-exports all NFS filesystems
func reloadNFS() error {
	// exportfs -ra re-exports all entries
	cmd := exec.Command("sudo", "exportfs", "-ra")
	return cmd.Run()
}

// ApplySingleZoneSMB adds/updates a single zone's SMB share
func ApplySingleZoneSMB(zone *models.ShareZone, fullPath string) error {
	if !zone.SMBEnabled || zone.SMBOptions == nil {
		// If SMB is disabled, remove the share
		return RemoveZoneSMB(zone)
	}

	// Ensure the directory exists
	if err := EnsureDirectoryExists(fullPath); err != nil {
		return fmt.Errorf("failed to ensure directory exists: %w", err)
	}

	// Set directory ownership based on zone settings
	if err := SetDirectoryOwnership(fullPath, zone); err != nil {
		// Log but don't fail - the share might still work
		fmt.Printf("Warning: failed to set directory ownership for %s: %v\n", fullPath, err)
	}

	// Read existing shares file
	content, err := os.ReadFile(fileservSharesFile)
	if err != nil && !os.IsNotExist(err) {
		return err
	}

	shareName := zone.SMBOptions.ShareName
	if shareName == "" {
		shareName = zone.Name
	}
	shareName = strings.ReplaceAll(shareName, " ", "_")
	shareName = strings.ReplaceAll(shareName, "/", "_")

	// Remove existing share for this zone
	newContent := removeShareSection(string(content), shareName)

	// Add the new share config
	shareConfig := GenerateSMBShareConfig(zone, fullPath)
	newContent += shareConfig

	// Write back
	if err := os.WriteFile(fileservSharesFile, []byte(newContent), 0644); err != nil {
		return err
	}

	// Ensure include and reload
	if err := ensureSMBInclude(); err != nil {
		return err
	}

	return reloadSamba()
}

// RemoveZoneSMB removes a zone's SMB share
func RemoveZoneSMB(zone *models.ShareZone) error {
	content, err := os.ReadFile(fileservSharesFile)
	if err != nil {
		if os.IsNotExist(err) {
			return nil // Nothing to remove
		}
		return err
	}

	shareName := zone.Name
	if zone.SMBOptions != nil && zone.SMBOptions.ShareName != "" {
		shareName = zone.SMBOptions.ShareName
	}
	shareName = strings.ReplaceAll(shareName, " ", "_")
	shareName = strings.ReplaceAll(shareName, "/", "_")

	newContent := removeShareSection(string(content), shareName)

	if err := os.WriteFile(fileservSharesFile, []byte(newContent), 0644); err != nil {
		return err
	}

	return reloadSamba()
}

// removeShareSection removes a [sharename] section from smb.conf format
func removeShareSection(content, shareName string) string {
	lines := strings.Split(content, "\n")
	var result []string
	inTargetSection := false
	sectionHeader := fmt.Sprintf("[%s]", shareName)

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)

		if strings.EqualFold(trimmed, sectionHeader) {
			inTargetSection = true
			continue
		}

		if inTargetSection && strings.HasPrefix(trimmed, "[") {
			// We've hit a new section, stop skipping
			inTargetSection = false
		}

		if !inTargetSection {
			result = append(result, line)
		}
	}

	return strings.Join(result, "\n")
}

// ApplySingleZoneNFS adds/updates a single zone's NFS export
func ApplySingleZoneNFS(zone *models.ShareZone, fullPath string) error {
	if !zone.NFSEnabled || zone.NFSOptions == nil {
		return RemoveZoneNFS(zone)
	}

	// Ensure the directory exists
	if err := EnsureDirectoryExists(fullPath); err != nil {
		return fmt.Errorf("failed to ensure directory exists: %w", err)
	}

	// Set directory ownership based on zone settings (also applies to NFS)
	if err := SetDirectoryOwnership(fullPath, zone); err != nil {
		fmt.Printf("Warning: failed to set directory ownership for %s: %v\n", fullPath, err)
	}

	// Read existing exports
	content, err := os.ReadFile(fileservExportsFile)
	if err != nil && !os.IsNotExist(err) {
		return err
	}

	// Remove existing exports for this path
	newContent := removeNFSExport(string(content), fullPath)

	// Add new export
	exportConfig := GenerateNFSExportConfig(zone, fullPath)
	newContent += exportConfig

	// Write back
	if err := os.WriteFile(fileservExportsFile, []byte(newContent), 0644); err != nil {
		return err
	}

	if err := ensureNFSInclude(); err != nil {
		return err
	}

	return reloadNFS()
}

// RemoveZoneNFS removes a zone's NFS export
func RemoveZoneNFS(zone *models.ShareZone) error {
	content, err := os.ReadFile(fileservExportsFile)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	// We need the full path to remove the export
	// Since we don't have it here, we'll need to match by zone path pattern
	// For now, this is a simplified version
	newContent := string(content) // TODO: implement proper removal

	if err := os.WriteFile(fileservExportsFile, []byte(newContent), 0644); err != nil {
		return err
	}

	return reloadNFS()
}

// removeNFSExport removes export lines for a given path
func removeNFSExport(content, path string) string {
	var result []string
	scanner := bufio.NewScanner(strings.NewReader(content))

	for scanner.Scan() {
		line := scanner.Text()
		// Skip lines that start with this path
		if !strings.HasPrefix(strings.TrimSpace(line), path+" ") &&
			!strings.HasPrefix(strings.TrimSpace(line), path+"\t") {
			result = append(result, line)
		}
	}

	return strings.Join(result, "\n")
}

// TestSambaConfig runs testparm to validate Samba configuration
func TestSambaConfig() (string, error) {
	cmd := exec.Command("testparm", "-s", "--suppress-prompt")
	output, err := cmd.CombinedOutput()
	return string(output), err
}

// SetSambaUserPassword sets a Samba password for a user
// Note: The user must already exist in the system
func SetSambaUserPassword(username, password string) error {
	cmd := exec.Command("smbpasswd", "-a", "-s", username)
	cmd.Stdin = strings.NewReader(password + "\n" + password + "\n")
	return cmd.Run()
}

// EnableSambaUser enables a Samba user account
func EnableSambaUser(username string) error {
	cmd := exec.Command("smbpasswd", "-e", username)
	return cmd.Run()
}

// DisableSambaUser disables a Samba user account
func DisableSambaUser(username string) error {
	cmd := exec.Command("smbpasswd", "-d", username)
	return cmd.Run()
}

// SetDirectoryOwnership sets ownership of a directory based on zone settings
// It uses force_user/force_group from SMB options, or falls back to the provided defaults
func SetDirectoryOwnership(path string, zone *models.ShareZone) error {
	var user, group string

	// Get user from SMB force_user, or use a sensible default
	if zone.SMBEnabled && zone.SMBOptions != nil && zone.SMBOptions.ForceUser != "" {
		user = zone.SMBOptions.ForceUser
	}

	// Get group from SMB force_group
	if zone.SMBEnabled && zone.SMBOptions != nil && zone.SMBOptions.ForceGroup != "" {
		group = zone.SMBOptions.ForceGroup
	}

	// If no force_user is set but we have allowed users, use the first one
	if user == "" && len(zone.AllowedUsers) > 0 && zone.AllowedUsers[0] != "" && zone.AllowedUsers[0] != "*" {
		user = zone.AllowedUsers[0]
	}

	// If no force_group is set but we have allowed groups, use the first one
	if group == "" && len(zone.AllowedGroups) > 0 && zone.AllowedGroups[0] != "" && zone.AllowedGroups[0] != "*" {
		group = zone.AllowedGroups[0]
	}

	// If we still have no user/group, don't change ownership
	if user == "" && group == "" {
		return nil
	}

	// Build the ownership string
	ownership := user
	if group != "" {
		ownership = user + ":" + group
	} else if user != "" {
		ownership = user + ":" + user // Default group to same as user
	}

	// Set ownership recursively
	cmd := exec.Command("sudo", "chown", "-R", ownership, path)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to set ownership: %s - %w", string(output), err)
	}

	// Set directory permissions to 0775 (rwxrwxr-x) for proper SMB access
	cmd = exec.Command("sudo", "chmod", "0775", path)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to set permissions: %s - %w", string(output), err)
	}

	return nil
}

// EnsureDirectoryExists creates the directory if it doesn't exist
func EnsureDirectoryExists(path string) error {
	// Check if directory exists
	if info, err := os.Stat(path); err == nil {
		if info.IsDir() {
			return nil
		}
		return fmt.Errorf("path exists but is not a directory: %s", path)
	}

	// Create directory with sudo (in case parent is root-owned)
	cmd := exec.Command("sudo", "mkdir", "-p", path)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to create directory: %s - %w", string(output), err)
	}

	return nil
}
