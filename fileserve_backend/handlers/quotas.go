package handlers

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net/http"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"time"

	"fileserv/models"
)

// GetQuotas returns quota information for all users/groups
func GetQuotas() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		quotaType := r.URL.Query().Get("type")
		if quotaType == "" {
			quotaType = "user"
		}

		filesystem := r.URL.Query().Get("filesystem")

		quotas, err := getQuotas(quotaType, filesystem)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(quotas)
	}
}

func getQuotas(quotaType, filesystem string) ([]models.Quota, error) {
	if !checkCommandExists("repquota") {
		return []models.Quota{}, nil
	}

	// Build repquota command
	args := []string{"-v"}
	switch quotaType {
	case "user":
		args = append(args, "-u")
	case "group":
		args = append(args, "-g")
	default:
		args = append(args, "-u")
	}

	if filesystem != "" {
		args = append(args, filesystem)
	} else {
		args = append(args, "-a")
	}

	output, err := execCommand("repquota", args...)
	if err != nil {
		// repquota may fail if quotas not enabled
		return []models.Quota{}, nil
	}

	return parseRepquotaOutput(output, quotaType)
}

func parseRepquotaOutput(output, quotaType string) ([]models.Quota, error) {
	var quotas []models.Quota
	currentFS := ""

	scanner := bufio.NewScanner(strings.NewReader(output))
	// Skip until we find data lines
	inData := false

	for scanner.Scan() {
		line := scanner.Text()

		// Check for filesystem header
		if strings.HasPrefix(line, "*** Report for") {
			// Extract filesystem
			parts := strings.Fields(line)
			for i, p := range parts {
				if p == "on" && i+1 < len(parts) {
					currentFS = parts[i+1]
					break
				}
			}
			continue
		}

		// Skip header lines
		if strings.HasPrefix(line, "Block grace") || strings.HasPrefix(line, "---") {
			inData = true
			continue
		}

		if !inData || strings.TrimSpace(line) == "" {
			continue
		}

		// Parse quota line
		// Format: user/group -- blocks soft hard grace files soft hard grace
		// Or:     user/group +- blocks soft hard grace files soft hard grace (over quota)
		fields := strings.Fields(line)
		if len(fields) < 9 {
			continue
		}

		target := fields[0]
		overQuota := strings.Contains(fields[1], "+")

		// Parse block usage (in KB from repquota)
		blockUsed, _ := strconv.ParseUint(fields[2], 10, 64)
		blockSoft, _ := strconv.ParseUint(fields[3], 10, 64)
		blockHard, _ := strconv.ParseUint(fields[4], 10, 64)

		// Convert KB to bytes
		blockUsed *= 1024
		blockSoft *= 1024
		blockHard *= 1024

		blockGrace := ""
		inodeIdx := 5
		if len(fields) > 5 && !isNumeric(fields[5]) {
			blockGrace = fields[5]
			inodeIdx = 6
		}

		// Parse inode usage
		var inodeUsed, inodeSoft, inodeHard uint64
		var inodeGrace string

		if len(fields) > inodeIdx+2 {
			inodeUsed, _ = strconv.ParseUint(fields[inodeIdx], 10, 64)
			inodeSoft, _ = strconv.ParseUint(fields[inodeIdx+1], 10, 64)
			inodeHard, _ = strconv.ParseUint(fields[inodeIdx+2], 10, 64)
			if len(fields) > inodeIdx+3 && !isNumeric(fields[inodeIdx+3]) {
				inodeGrace = fields[inodeIdx+3]
			}
		}

		usedPercent := 0.0
		if blockHard > 0 {
			usedPercent = float64(blockUsed) / float64(blockHard) * 100
		} else if blockSoft > 0 {
			usedPercent = float64(blockUsed) / float64(blockSoft) * 100
		}

		quota := models.Quota{
			ID:          fmt.Sprintf("%s-%s-%s", quotaType, currentFS, target),
			Type:        quotaType,
			Target:      target,
			Filesystem:  currentFS,
			MountPoint:  currentFS,
			BlockUsed:   blockUsed,
			BlockSoft:   blockSoft,
			BlockHard:   blockHard,
			BlockGrace:  blockGrace,
			InodeUsed:   inodeUsed,
			InodeSoft:   inodeSoft,
			InodeHard:   inodeHard,
			InodeGrace:  inodeGrace,
			UsedHuman:   formatBytes(blockUsed),
			SoftHuman:   formatBytes(blockSoft),
			HardHuman:   formatBytes(blockHard),
			UsedPercent: usedPercent,
			OverQuota:   overQuota,
			UpdatedAt:   time.Now(),
		}

		quotas = append(quotas, quota)
	}

	return quotas, nil
}

func isNumeric(s string) bool {
	_, err := strconv.ParseFloat(s, 64)
	return err == nil
}

// GetUserQuota returns quota for a specific user
func GetUserQuota() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		username := r.URL.Query().Get("username")
		if username == "" {
			http.Error(w, "Username required", http.StatusBadRequest)
			return
		}

		output, err := execCommand("quota", "-u", "-v", username)
		if err != nil {
			// quota may fail if user has no quota
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode([]models.Quota{})
			return
		}

		quotas := parseQuotaOutput(output, "user", username)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(quotas)
	}
}

// GetGroupQuota returns quota for a specific group
func GetGroupQuota() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		groupname := r.URL.Query().Get("groupname")
		if groupname == "" {
			http.Error(w, "Group name required", http.StatusBadRequest)
			return
		}

		output, err := execCommand("quota", "-g", "-v", groupname)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode([]models.Quota{})
			return
		}

		quotas := parseQuotaOutput(output, "group", groupname)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(quotas)
	}
}

func parseQuotaOutput(output, quotaType, target string) []models.Quota {
	var quotas []models.Quota

	scanner := bufio.NewScanner(strings.NewReader(output))
	inData := false

	for scanner.Scan() {
		line := scanner.Text()

		// Skip header
		if strings.Contains(line, "Filesystem") && strings.Contains(line, "blocks") {
			inData = true
			continue
		}

		if !inData || strings.TrimSpace(line) == "" {
			continue
		}

		fields := strings.Fields(line)
		if len(fields) < 7 {
			continue
		}

		filesystem := fields[0]

		// Parse blocks
		blockUsed, _ := strconv.ParseUint(strings.TrimSuffix(fields[1], "*"), 10, 64)
		blockSoft, _ := strconv.ParseUint(fields[2], 10, 64)
		blockHard, _ := strconv.ParseUint(fields[3], 10, 64)

		// Convert KB to bytes
		blockUsed *= 1024
		blockSoft *= 1024
		blockHard *= 1024

		// Parse inodes
		inodeUsed, _ := strconv.ParseUint(strings.TrimSuffix(fields[4], "*"), 10, 64)
		inodeSoft, _ := strconv.ParseUint(fields[5], 10, 64)
		inodeHard, _ := strconv.ParseUint(fields[6], 10, 64)

		overQuota := strings.HasSuffix(fields[1], "*") || strings.HasSuffix(fields[4], "*")

		usedPercent := 0.0
		if blockHard > 0 {
			usedPercent = float64(blockUsed) / float64(blockHard) * 100
		}

		quota := models.Quota{
			ID:          fmt.Sprintf("%s-%s-%s", quotaType, filesystem, target),
			Type:        quotaType,
			Target:      target,
			Filesystem:  filesystem,
			MountPoint:  filesystem,
			BlockUsed:   blockUsed,
			BlockSoft:   blockSoft,
			BlockHard:   blockHard,
			InodeUsed:   inodeUsed,
			InodeSoft:   inodeSoft,
			InodeHard:   inodeHard,
			UsedHuman:   formatBytes(blockUsed),
			SoftHuman:   formatBytes(blockSoft),
			HardHuman:   formatBytes(blockHard),
			UsedPercent: usedPercent,
			OverQuota:   overQuota,
			UpdatedAt:   time.Now(),
		}

		quotas = append(quotas, quota)
	}

	return quotas
}

// SetQuota sets or updates quota for a user or group
func SetQuota() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req models.QuotaConfig
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		if req.Target == "" || req.Filesystem == "" {
			http.Error(w, "Target and filesystem are required", http.StatusBadRequest)
			return
		}

		// Build setquota command
		// setquota -u username block-soft block-hard inode-soft inode-hard filesystem
		args := []string{}

		switch req.Type {
		case "user":
			args = append(args, "-u")
		case "group":
			args = append(args, "-g")
		default:
			args = append(args, "-u")
		}

		// Convert bytes to KB for setquota
		blockSoft := req.BlockSoft / 1024
		blockHard := req.BlockHard / 1024

		args = append(args, req.Target,
			strconv.FormatUint(blockSoft, 10),
			strconv.FormatUint(blockHard, 10),
			strconv.FormatUint(req.InodeSoft, 10),
			strconv.FormatUint(req.InodeHard, 10),
			req.Filesystem,
		)

		cmd := exec.Command("setquota", args...)
		output, err := cmd.CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to set quota: %s", string(output)), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"message": "Quota set successfully"})
	}
}

// RemoveQuota removes quota for a user or group
func RemoveQuota() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		quotaType := r.URL.Query().Get("type")
		target := r.URL.Query().Get("target")
		filesystem := r.URL.Query().Get("filesystem")

		if target == "" || filesystem == "" {
			http.Error(w, "Target and filesystem are required", http.StatusBadRequest)
			return
		}

		args := []string{}
		switch quotaType {
		case "group":
			args = append(args, "-g")
		default:
			args = append(args, "-u")
		}

		// Set all limits to 0 to remove quota
		args = append(args, target, "0", "0", "0", "0", filesystem)

		cmd := exec.Command("setquota", args...)
		output, err := cmd.CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to remove quota: %s", string(output)), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"message": "Quota removed successfully"})
	}
}

// EnableQuotas enables quotas on a filesystem
func EnableQuotas() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Filesystem string `json:"filesystem"`
			UserQuota  bool   `json:"user_quota"`
			GroupQuota bool   `json:"group_quota"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		if req.Filesystem == "" {
			http.Error(w, "Filesystem is required", http.StatusBadRequest)
			return
		}

		// First, check quota files
		cmd := exec.Command("quotacheck", "-cug", req.Filesystem)
		output, err := cmd.CombinedOutput()
		if err != nil {
			// Continue anyway, quotacheck may fail if quotas are already set up
		}

		// Enable quotas
		args := []string{}
		if req.UserQuota {
			args = append(args, "-u")
		}
		if req.GroupQuota {
			args = append(args, "-g")
		}
		if len(args) == 0 {
			args = append(args, "-ug") // Enable both by default
		}
		args = append(args, req.Filesystem)

		cmd = exec.Command("quotaon", args...)
		output, err = cmd.CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to enable quotas: %s", string(output)), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"message": "Quotas enabled successfully"})
	}
}

// DisableQuotas disables quotas on a filesystem
func DisableQuotas() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		filesystem := r.URL.Query().Get("filesystem")
		if filesystem == "" {
			http.Error(w, "Filesystem is required", http.StatusBadRequest)
			return
		}

		cmd := exec.Command("quotaoff", "-ug", filesystem)
		output, err := cmd.CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to disable quotas: %s", string(output)), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"message": "Quotas disabled successfully"})
	}
}

// GetQuotaStatus returns quota status for filesystems
func GetQuotaStatus() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		type QuotaStatus struct {
			Filesystem  string `json:"filesystem"`
			MountPoint  string `json:"mount_point"`
			UserQuota   bool   `json:"user_quota"`
			GroupQuota  bool   `json:"group_quota"`
			UserState   string `json:"user_state"`  // on, off, not_configured
			GroupState  string `json:"group_state"` // on, off, not_configured
		}

		// Get all mounted filesystems that could support quotas
		mounts, err := getMountPoints()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		var statuses []QuotaStatus

		// Check quota support for common filesystem types
		quotableFS := map[string]bool{
			"ext4":  true,
			"ext3":  true,
			"ext2":  true,
			"xfs":   true,
			"btrfs": true,
			"zfs":   true,
		}

		for _, mount := range mounts {
			if !quotableFS[mount.FSType] {
				continue
			}

			// Skip system filesystems
			if strings.HasPrefix(mount.MountPath, "/sys") ||
			   strings.HasPrefix(mount.MountPath, "/proc") ||
			   strings.HasPrefix(mount.MountPath, "/run") ||
			   strings.HasPrefix(mount.MountPath, "/dev") ||
			   mount.MountPath == "/boot" ||
			   mount.MountPath == "/boot/efi" {
				continue
			}

			status := QuotaStatus{
				Filesystem: mount.Device,
				MountPoint: mount.MountPath,
				UserState:  "not_configured",
				GroupState: "not_configured",
			}

			// Check mount options for quota
			if strings.Contains(mount.Options, "usrquota") ||
			   strings.Contains(mount.Options, "uquota") ||
			   strings.Contains(mount.Options, "quota") {
				status.UserQuota = true
			}
			if strings.Contains(mount.Options, "grpquota") ||
			   strings.Contains(mount.Options, "gquota") ||
			   strings.Contains(mount.Options, "quota") {
				status.GroupQuota = true
			}

			// Check if quotas are actually on
			if status.UserQuota || status.GroupQuota {
				output, _ := execCommand("quotaon", "-p", mount.MountPath)
				if strings.Contains(output, "user quota on") {
					status.UserState = "on"
				} else if status.UserQuota {
					status.UserState = "off"
				}
				if strings.Contains(output, "group quota on") {
					status.GroupState = "on"
				} else if status.GroupQuota {
					status.GroupState = "off"
				}
			}

			statuses = append(statuses, status)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(statuses)
	}
}

// GetUserStorageUsage returns storage usage for all users
func GetUserStorageUsage() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Get system users
		output, err := execCommand("getent", "passwd")
		if err != nil {
			http.Error(w, "Failed to get users", http.StatusInternalServerError)
			return
		}

		var usages []models.UserStorageUsage

		scanner := bufio.NewScanner(strings.NewReader(output))
		for scanner.Scan() {
			fields := strings.Split(scanner.Text(), ":")
			if len(fields) < 7 {
				continue
			}

			username := fields[0]
			uid, _ := strconv.Atoi(fields[2])
			homeDir := fields[5]

			// Skip system users (UID < 1000)
			if uid < 1000 && uid != 0 {
				continue
			}

			usage := models.UserStorageUsage{
				Username: username,
				UID:      uid,
				HomeDir:  homeDir,
			}

			// Get home directory size
			duOutput, err := execCommand("du", "-sb", homeDir)
			if err == nil {
				duFields := strings.Fields(duOutput)
				if len(duFields) > 0 {
					usage.HomeDirSize, _ = strconv.ParseUint(duFields[0], 10, 64)
					usage.HomeSizeHuman = formatBytes(usage.HomeDirSize)
				}
			}

			// Get file/dir counts
			findOutput, _ := execCommand("find", homeDir, "-maxdepth", "5", "-type", "f", "-printf", ".")
			usage.FileCount = int64(len(findOutput))

			dirOutput, _ := execCommand("find", homeDir, "-maxdepth", "5", "-type", "d", "-printf", ".")
			usage.DirCount = int64(len(dirOutput))

			// Get quota info if available
			quotaOutput, err := execCommand("quota", "-u", "-v", username)
			if err == nil {
				usage.Quotas = parseQuotaOutput(quotaOutput, "user", username)
			}

			usage.TotalUsed = usage.HomeDirSize
			usage.TotalHuman = formatBytes(usage.TotalUsed)

			usages = append(usages, usage)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(usages)
	}
}

// GetSpecificUserStorage returns storage usage for a specific user
func GetSpecificUserStorage() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		username := r.URL.Query().Get("username")
		if username == "" {
			http.Error(w, "Username required", http.StatusBadRequest)
			return
		}

		// Validate user exists
		output, err := execCommand("getent", "passwd", username)
		if err != nil || strings.TrimSpace(output) == "" {
			http.Error(w, "User not found", http.StatusNotFound)
			return
		}

		fields := strings.Split(strings.TrimSpace(output), ":")
		if len(fields) < 7 {
			http.Error(w, "Invalid user data", http.StatusInternalServerError)
			return
		}

		uid, _ := strconv.Atoi(fields[2])
		homeDir := fields[5]

		usage := models.UserStorageUsage{
			Username: username,
			UID:      uid,
			HomeDir:  homeDir,
		}

		// Get home directory size (detailed)
		duOutput, err := execCommand("du", "-sb", homeDir)
		if err == nil {
			duFields := strings.Fields(duOutput)
			if len(duFields) > 0 {
				usage.HomeDirSize, _ = strconv.ParseUint(duFields[0], 10, 64)
				usage.HomeSizeHuman = formatBytes(usage.HomeDirSize)
			}
		}

		// Get file/dir counts
		findOutput, _ := execCommand("find", homeDir, "-type", "f", "-printf", ".")
		usage.FileCount = int64(len(findOutput))

		dirOutput, _ := execCommand("find", homeDir, "-type", "d", "-printf", ".")
		usage.DirCount = int64(len(dirOutput))

		// Get all quota info
		quotaOutput, err := execCommand("quota", "-u", "-v", username)
		if err == nil {
			usage.Quotas = parseQuotaOutput(quotaOutput, "user", username)
		}

		usage.TotalUsed = usage.HomeDirSize
		usage.TotalHuman = formatBytes(usage.TotalUsed)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(usage)
	}
}

// ScanFilesystemUsage performs a detailed filesystem scan
func ScanFilesystemUsage() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Query().Get("path")
		if path == "" {
			path = "/"
		}

		depth := r.URL.Query().Get("depth")
		if depth == "" {
			depth = "2"
		}

		type DirUsage struct {
			Path      string `json:"path"`
			Size      uint64 `json:"size"`
			SizeHuman string `json:"size_human"`
		}

		// Use du to get directory sizes
		output, err := execCommand("du", "-b", "--max-depth="+depth, path)
		if err != nil {
			http.Error(w, "Failed to scan filesystem", http.StatusInternalServerError)
			return
		}

		var dirs []DirUsage
		scanner := bufio.NewScanner(strings.NewReader(output))
		for scanner.Scan() {
			fields := strings.Fields(scanner.Text())
			if len(fields) < 2 {
				continue
			}

			size, _ := strconv.ParseUint(fields[0], 10, 64)
			dirPath := strings.Join(fields[1:], " ")

			dirs = append(dirs, DirUsage{
				Path:      dirPath,
				Size:      size,
				SizeHuman: formatBytes(size),
			})
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(dirs)
	}
}

// FindLargeFiles finds the largest files in a filesystem
func FindLargeFiles() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Query().Get("path")
		if path == "" {
			path = "/"
		}

		limit := r.URL.Query().Get("limit")
		if limit == "" {
			limit = "50"
		}

		minSize := r.URL.Query().Get("min_size")
		if minSize == "" {
			minSize = "100M"
		}

		type LargeFile struct {
			Path      string `json:"path"`
			Size      uint64 `json:"size"`
			SizeHuman string `json:"size_human"`
			Owner     string `json:"owner"`
			Modified  string `json:"modified"`
		}

		// Find large files
		output, err := execCommand("find", path,
			"-type", "f",
			"-size", "+"+minSize,
			"-printf", "%s\t%u\t%T+\t%p\n",
			"-maxdepth", "10")
		if err != nil {
			// May fail on permission denied, which is ok
		}

		var files []LargeFile
		scanner := bufio.NewScanner(strings.NewReader(output))
		for scanner.Scan() {
			fields := strings.SplitN(scanner.Text(), "\t", 4)
			if len(fields) < 4 {
				continue
			}

			size, _ := strconv.ParseUint(fields[0], 10, 64)

			files = append(files, LargeFile{
				Size:      size,
				SizeHuman: formatBytes(size),
				Owner:     fields[1],
				Modified:  fields[2],
				Path:      fields[3],
			})
		}

		// Sort by size (largest first) - done in find typically but let's ensure
		// Simple bubble sort for small lists
		for i := 0; i < len(files); i++ {
			for j := i + 1; j < len(files); j++ {
				if files[j].Size > files[i].Size {
					files[i], files[j] = files[j], files[i]
				}
			}
		}

		// Apply limit
		limitNum, _ := strconv.Atoi(limit)
		if limitNum > 0 && len(files) > limitNum {
			files = files[:limitNum]
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(files)
	}
}

// CheckFilesystemHealth checks filesystem health
func CheckFilesystemHealth() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		device := r.URL.Query().Get("device")
		if device == "" {
			http.Error(w, "Device required", http.StatusBadRequest)
			return
		}

		type HealthCheck struct {
			Device    string `json:"device"`
			FSType    string `json:"fstype"`
			Status    string `json:"status"`
			Details   string `json:"details"`
			LastCheck string `json:"last_check,omitempty"`
			Errors    int    `json:"errors"`
		}

		health := HealthCheck{
			Device: device,
			Status: "unknown",
		}

		// Get filesystem type
		output, err := execCommand("blkid", "-o", "value", "-s", "TYPE", device)
		if err == nil {
			health.FSType = strings.TrimSpace(output)
		}

		// Check filesystem based on type
		switch health.FSType {
		case "ext4", "ext3", "ext2":
			// Use tune2fs to get filesystem info
			output, err := execCommand("tune2fs", "-l", device)
			if err == nil {
				// Parse output for errors and last check
				if match := regexp.MustCompile(`Last checked:\s+(.+)`).FindStringSubmatch(output); len(match) > 1 {
					health.LastCheck = strings.TrimSpace(match[1])
				}
				if match := regexp.MustCompile(`Filesystem state:\s+(\w+)`).FindStringSubmatch(output); len(match) > 1 {
					if match[1] == "clean" {
						health.Status = "healthy"
					} else {
						health.Status = "needs_check"
					}
				}
				health.Details = "Filesystem appears healthy"
			}
		case "xfs":
			// XFS doesn't have a standard health check when mounted
			health.Status = "healthy"
			health.Details = "XFS filesystem (online check not available)"
		default:
			health.Status = "unknown"
			health.Details = fmt.Sprintf("Health check not supported for %s", health.FSType)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(health)
	}
}
