package handlers

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"fileserv/models"
)

// Allowed mount options whitelist for security
var allowedMountOptions = map[string]bool{
	"defaults": true, "ro": true, "rw": true, "noexec": true, "exec": true,
	"nosuid": true, "suid": true, "nodev": true, "dev": true, "sync": true,
	"async": true, "noatime": true, "atime": true, "nodiratime": true,
	"relatime": true, "strictatime": true, "nofail": true, "auto": true,
	"noauto": true, "user": true, "nouser": true, "users": true,
	"discard": true, "compress": true, "compress=lzo": true, "compress=zlib": true,
	"compress=zstd": true, "subvol": true, "degraded": true, "space_cache": true,
	"space_cache=v2": true, "ssd": true, "nossd": true,
}

// Allowed filesystem types whitelist
var allowedFSTypes = map[string]bool{
	"ext4": true, "ext3": true, "ext2": true, "xfs": true, "btrfs": true,
	"zfs": true, "ntfs": true, "vfat": true, "exfat": true, "tmpfs": true,
	"nfs": true, "nfs4": true, "cifs": true, "iso9660": true,
}

// Device path regex - must be /dev/xxx or UUID=xxx or LABEL=xxx
var devicePathRegex = regexp.MustCompile(`^(/dev/[a-zA-Z0-9/_-]+|UUID=[a-fA-F0-9-]+|LABEL=[a-zA-Z0-9_.-]+)$`)

// Mount point path regex - must be absolute path with safe characters
var mountPointRegex = regexp.MustCompile(`^/[a-zA-Z0-9/_.-]*$`)

// validateMountOptions validates and filters mount options against whitelist
func validateMountOptions(options string) (string, error) {
	if options == "" {
		return "defaults", nil
	}

	parts := strings.Split(options, ",")
	var validOptions []string

	for _, opt := range parts {
		opt = strings.TrimSpace(opt)
		if opt == "" {
			continue
		}

		// Check for subvol=xxx pattern (btrfs)
		if strings.HasPrefix(opt, "subvol=") {
			subvol := strings.TrimPrefix(opt, "subvol=")
			// Validate subvol name
			if matched, _ := regexp.MatchString(`^[a-zA-Z0-9/_.-]+$`, subvol); matched {
				validOptions = append(validOptions, opt)
				continue
			} else {
				return "", fmt.Errorf("invalid subvol name: %s", subvol)
			}
		}

		// Check for uid/gid options
		if strings.HasPrefix(opt, "uid=") || strings.HasPrefix(opt, "gid=") {
			val := strings.Split(opt, "=")[1]
			if matched, _ := regexp.MatchString(`^\d+$`, val); matched {
				validOptions = append(validOptions, opt)
				continue
			} else {
				return "", fmt.Errorf("invalid uid/gid value: %s", val)
			}
		}

		// Check against whitelist
		if !allowedMountOptions[opt] {
			return "", fmt.Errorf("mount option not allowed: %s", opt)
		}
		validOptions = append(validOptions, opt)
	}

	if len(validOptions) == 0 {
		return "defaults", nil
	}
	return strings.Join(validOptions, ","), nil
}

// validateFSType validates filesystem type against whitelist
func validateFSType(fstype string) error {
	if fstype == "" {
		return nil // Empty is allowed, mount will auto-detect
	}
	if !allowedFSTypes[fstype] {
		return fmt.Errorf("filesystem type not allowed: %s", fstype)
	}
	return nil
}

// validateDevicePath validates device path format
func validateDevicePath(device string) error {
	if device == "" {
		return fmt.Errorf("device path is required")
	}
	if !devicePathRegex.MatchString(device) {
		return fmt.Errorf("invalid device path format: must be /dev/xxx, UUID=xxx, or LABEL=xxx")
	}
	// Additional check to prevent path traversal
	if strings.Contains(device, "..") {
		return fmt.Errorf("path traversal not allowed in device path")
	}
	return nil
}

// validateMountPoint validates mount point path
func validateMountPoint(mountPoint string) error {
	if mountPoint == "" {
		return fmt.Errorf("mount point is required")
	}
	if !mountPointRegex.MatchString(mountPoint) {
		return fmt.Errorf("invalid mount point format: must be absolute path with safe characters")
	}
	// Check for path traversal
	if strings.Contains(mountPoint, "..") {
		return fmt.Errorf("path traversal not allowed in mount point")
	}
	// Must be absolute path
	if !filepath.IsAbs(mountPoint) {
		return fmt.Errorf("mount point must be absolute path")
	}
	return nil
}

// Helper function to format bytes to human readable
func formatBytes(bytes uint64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := uint64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(bytes)/float64(div), "KMGTPE"[exp])
}

// Helper to parse size strings like "10G", "100M", etc. to bytes
func parseSize(size string) (uint64, error) {
	size = strings.TrimSpace(strings.ToUpper(size))
	if size == "" {
		return 0, nil
	}

	multipliers := map[string]uint64{
		"B": 1,
		"K": 1024,
		"M": 1024 * 1024,
		"G": 1024 * 1024 * 1024,
		"T": 1024 * 1024 * 1024 * 1024,
		"P": 1024 * 1024 * 1024 * 1024 * 1024,
	}

	// Try to find the unit suffix
	for suffix, mult := range multipliers {
		if strings.HasSuffix(size, suffix) {
			numStr := strings.TrimSuffix(size, suffix)
			numStr = strings.TrimSuffix(numStr, "I") // Handle KiB, MiB, etc.
			num, err := strconv.ParseFloat(numStr, 64)
			if err != nil {
				return 0, err
			}
			return uint64(num * float64(mult)), nil
		}
	}

	// Try parsing as plain number (bytes)
	num, err := strconv.ParseUint(size, 10, 64)
	if err != nil {
		return 0, err
	}
	return num, nil
}

// execCommand runs a command and returns stdout
func execCommand(name string, args ...string) (string, error) {
	cmd := exec.Command(name, args...)
	output, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return string(output), nil
}

// checkCommandExists checks if a command is available
func checkCommandExists(name string) bool {
	_, err := exec.LookPath(name)
	return err == nil
}

// GetStorageOverview returns high-level storage information
func GetStorageOverview() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		overview := models.StorageOverview{
			Alerts:     []models.StorageAlert{},
			DiskHealth: []models.DiskHealth{},
		}

		// Get mount points
		mounts, _ := getMountPoints()
		overview.MountPoints = mounts

		// Calculate totals from mount points
		for _, mount := range mounts {
			// Skip pseudo filesystems
			if strings.HasPrefix(mount.FSType, "tmp") ||
			   mount.FSType == "devtmpfs" ||
			   mount.FSType == "overlay" ||
			   strings.HasPrefix(mount.MountPath, "/sys") ||
			   strings.HasPrefix(mount.MountPath, "/proc") ||
			   strings.HasPrefix(mount.MountPath, "/run") ||
			   strings.HasPrefix(mount.MountPath, "/dev") {
				continue
			}
			overview.TotalCapacity += mount.Total
			overview.TotalUsed += mount.Used
			overview.TotalFree += mount.Available

			// Check for space alerts
			if mount.UsedPercent > 90 {
				overview.Alerts = append(overview.Alerts, models.StorageAlert{
					Level:     "critical",
					Type:      "space_low",
					Message:   fmt.Sprintf("Filesystem %s is %.1f%% full", mount.MountPath, mount.UsedPercent),
					Resource:  mount.MountPath,
					Timestamp: time.Now(),
				})
			} else if mount.UsedPercent > 80 {
				overview.Alerts = append(overview.Alerts, models.StorageAlert{
					Level:     "warning",
					Type:      "space_low",
					Message:   fmt.Sprintf("Filesystem %s is %.1f%% full", mount.MountPath, mount.UsedPercent),
					Resource:  mount.MountPath,
					Timestamp: time.Now(),
				})
			}
		}

		if overview.TotalCapacity > 0 {
			overview.UsedPercent = float64(overview.TotalUsed) / float64(overview.TotalCapacity) * 100
		}
		overview.CapacityHuman = formatBytes(overview.TotalCapacity)
		overview.UsedHuman = formatBytes(overview.TotalUsed)
		overview.FreeHuman = formatBytes(overview.TotalFree)

		// Get disk count and health
		disks, _ := getDisks()
		overview.TotalDisks = len(disks)
		for _, disk := range disks {
			health := models.DiskHealth{
				Name:   disk.Name,
				Path:   disk.Path,
				Health: "healthy",
				Temp:   disk.Temperature,
			}
			if disk.SMART != nil && !disk.SMART.Healthy {
				health.Health = "critical"
				overview.Alerts = append(overview.Alerts, models.StorageAlert{
					Level:     "critical",
					Type:      "disk_health",
					Message:   fmt.Sprintf("Disk %s SMART status: %s", disk.Name, disk.SMART.OverallStatus),
					Resource:  disk.Path,
					Timestamp: time.Now(),
				})
			}
			overview.DiskHealth = append(overview.DiskHealth, health)
		}

		// Count LVM volume groups
		if vgs, err := getVolumeGroups(); err == nil {
			overview.VolumeGroups = len(vgs)
		}

		// Count RAID arrays
		if raids, err := getRAIDArrays(); err == nil {
			overview.RAIDArrays = len(raids)
			for _, raid := range raids {
				if raid.State == "degraded" {
					overview.Alerts = append(overview.Alerts, models.StorageAlert{
						Level:     "critical",
						Type:      "raid_degraded",
						Message:   fmt.Sprintf("RAID array %s is degraded", raid.Name),
						Resource:  raid.Path,
						Timestamp: time.Now(),
					})
				}
			}
		}

		// Count ZFS pools
		if pools, err := getZFSPools(); err == nil {
			overview.ZFSPools = len(pools)
			for _, pool := range pools {
				if pool.Health != "ONLINE" {
					overview.Alerts = append(overview.Alerts, models.StorageAlert{
						Level:     "critical",
						Type:      "zfs_degraded",
						Message:   fmt.Sprintf("ZFS pool %s health: %s", pool.Name, pool.Health),
						Resource:  pool.Name,
						Timestamp: time.Now(),
					})
				}
			}
		}

		// Check if quotas are enabled
		overview.QuotasEnabled = checkQuotasEnabled()

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(overview)
	}
}

// GetDisks returns all disk devices
func GetDisks() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		disks, err := getDisks()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(disks)
	}
}

func getDisks() ([]models.DiskInfo, error) {
	// Use lsblk to get disk information
	output, err := execCommand("lsblk", "-b", "-J", "-o",
		"NAME,PATH,SIZE,MODEL,SERIAL,TYPE,ROTA,RM,RO,FSTYPE,UUID,LABEL,MOUNTPOINT")
	if err != nil {
		return nil, fmt.Errorf("failed to get disk info: %v", err)
	}

	var lsblkOutput struct {
		BlockDevices []struct {
			Name       string `json:"name"`
			Path       string `json:"path"`
			Size       interface{} `json:"size"` // Can be string or int
			Model      string `json:"model"`
			Serial     string `json:"serial"`
			Type       string `json:"type"`
			Rota       bool   `json:"rota"`
			RM         bool   `json:"rm"`
			RO         bool   `json:"ro"`
			FSType     string `json:"fstype"`
			UUID       string `json:"uuid"`
			Label      string `json:"label"`
			MountPoint string `json:"mountpoint"`
			Children   []struct {
				Name       string `json:"name"`
				Path       string `json:"path"`
				Size       interface{} `json:"size"`
				Type       string `json:"type"`
				FSType     string `json:"fstype"`
				UUID       string `json:"uuid"`
				Label      string `json:"label"`
				MountPoint string `json:"mountpoint"`
				RO         bool   `json:"ro"`
			} `json:"children"`
		} `json:"blockdevices"`
	}

	if err := json.Unmarshal([]byte(output), &lsblkOutput); err != nil {
		return nil, fmt.Errorf("failed to parse lsblk output: %v", err)
	}

	var disks []models.DiskInfo
	for _, dev := range lsblkOutput.BlockDevices {
		if dev.Type != "disk" {
			continue
		}

		// Parse size
		var size uint64
		switch v := dev.Size.(type) {
		case float64:
			size = uint64(v)
		case string:
			size, _ = parseSize(v)
		}

		diskType := "hdd"
		if !dev.Rota {
			if strings.HasPrefix(dev.Name, "nvme") {
				diskType = "nvme"
			} else {
				diskType = "ssd"
			}
		}
		if strings.HasPrefix(dev.Name, "vd") || strings.HasPrefix(dev.Name, "xvd") {
			diskType = "virtual"
		}

		disk := models.DiskInfo{
			Name:       dev.Name,
			Path:       dev.Path,
			Size:       size,
			SizeHuman:  formatBytes(size),
			Model:      strings.TrimSpace(dev.Model),
			Serial:     strings.TrimSpace(dev.Serial),
			Type:       diskType,
			Rotational: dev.Rota,
			Removable:  dev.RM,
			ReadOnly:   dev.RO,
			FSType:     dev.FSType,     // Disk-level filesystem (when formatted without partitions)
			UUID:       dev.UUID,       // Disk-level UUID
			Label:      dev.Label,      // Disk-level label
			MountPoint: dev.MountPoint, // Disk-level mount point
			Mounted:    dev.MountPoint != "",
			Partitions: []models.Partition{},
		}

		// Add partitions
		for _, child := range dev.Children {
			var partSize uint64
			switch v := child.Size.(type) {
			case float64:
				partSize = uint64(v)
			case string:
				partSize, _ = parseSize(v)
			}

			partType := "primary"
			if strings.Contains(child.Type, "part") {
				partType = "primary"
			} else if child.Type == "lvm" {
				partType = "lvm"
			}

			partition := models.Partition{
				Name:       child.Name,
				Path:       child.Path,
				Size:       partSize,
				SizeHuman:  formatBytes(partSize),
				Type:       partType,
				FSType:     child.FSType,
				UUID:       child.UUID,
				Label:      child.Label,
				MountPoint: child.MountPoint,
				Mounted:    child.MountPoint != "",
				ReadOnly:   child.RO,
			}
			disk.Partitions = append(disk.Partitions, partition)
		}

		// Try to get SMART data if smartctl is available
		if checkCommandExists("smartctl") {
			smart := getSMARTInfo(dev.Path)
			if smart != nil {
				disk.SMART = smart
				disk.Temperature = &smart.Temperature
			}
		}

		disks = append(disks, disk)
	}

	return disks, nil
}

func getSMARTInfo(devicePath string) *models.SMARTInfo {
	output, err := execCommand("smartctl", "-a", "-j", devicePath)
	if err != nil {
		return nil
	}

	var smartOutput struct {
		SmartStatus struct {
			Passed bool `json:"passed"`
		} `json:"smart_status"`
		PowerOnTime struct {
			Hours int64 `json:"hours"`
		} `json:"power_on_time"`
		PowerCycleCount int64 `json:"power_cycle_count"`
		Temperature     struct {
			Current int `json:"current"`
		} `json:"temperature"`
	}

	if err := json.Unmarshal([]byte(output), &smartOutput); err != nil {
		return nil
	}

	status := "PASSED"
	if !smartOutput.SmartStatus.Passed {
		status = "FAILED"
	}

	return &models.SMARTInfo{
		Available:     true,
		Healthy:       smartOutput.SmartStatus.Passed,
		PowerOnHours:  smartOutput.PowerOnTime.Hours,
		PowerCycles:   smartOutput.PowerCycleCount,
		Temperature:   smartOutput.Temperature.Current,
		OverallStatus: status,
	}
}

// GetMountPoints returns all mounted filesystems
func GetMountPoints() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		mounts, err := getMountPoints()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(mounts)
	}
}

func getMountPoints() ([]models.MountPoint, error) {
	output, err := execCommand("df", "-B1", "--output=source,target,fstype,size,used,avail,pcent,itotal,iused,iavail")
	if err != nil {
		return nil, fmt.Errorf("failed to get mount info: %v", err)
	}

	var mounts []models.MountPoint
	scanner := bufio.NewScanner(strings.NewReader(output))

	// Skip header
	scanner.Scan()

	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 10 {
			continue
		}

		total, _ := strconv.ParseUint(fields[3], 10, 64)
		used, _ := strconv.ParseUint(fields[4], 10, 64)
		avail, _ := strconv.ParseUint(fields[5], 10, 64)

		usedPercent := 0.0
		if total > 0 {
			usedPercent = float64(used) / float64(total) * 100
		}

		inodes, _ := strconv.ParseUint(fields[7], 10, 64)
		inodesUsed, _ := strconv.ParseUint(fields[8], 10, 64)
		inodesFree, _ := strconv.ParseUint(fields[9], 10, 64)

		// Get mount options from /proc/mounts
		options := getMountOptions(fields[1])

		mount := models.MountPoint{
			Device:      fields[0],
			MountPath:   fields[1],
			FSType:      fields[2],
			Options:     options,
			Total:       total,
			Used:        used,
			Available:   avail,
			UsedPercent: usedPercent,
			TotalHuman:  formatBytes(total),
			UsedHuman:   formatBytes(used),
			AvailHuman:  formatBytes(avail),
			Inodes:      inodes,
			InodesUsed:  inodesUsed,
			InodesFree:  inodesFree,
		}
		mounts = append(mounts, mount)
	}

	return mounts, nil
}

func getMountOptions(mountPath string) string {
	data, err := os.ReadFile("/proc/mounts")
	if err != nil {
		return ""
	}

	scanner := bufio.NewScanner(strings.NewReader(string(data)))
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) >= 4 && fields[1] == mountPath {
			return fields[3]
		}
	}
	return ""
}

// GetVolumeGroups returns LVM volume groups
func GetVolumeGroups() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vgs, err := getVolumeGroups()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(vgs)
	}
}

func getVolumeGroups() ([]models.VolumeGroup, error) {
	if !checkCommandExists("vgs") {
		return []models.VolumeGroup{}, nil
	}

	output, err := execCommand("vgs", "--reportformat", "json", "--units", "b",
		"-o", "vg_name,vg_uuid,vg_size,vg_free,pv_count,lv_count,snap_count,vg_attr")
	if err != nil {
		return []models.VolumeGroup{}, nil
	}

	var vgsOutput struct {
		Report []struct {
			VG []struct {
				VGName    string `json:"vg_name"`
				VGUuid    string `json:"vg_uuid"`
				VGSize    string `json:"vg_size"`
				VGFree    string `json:"vg_free"`
				PVCount   string `json:"pv_count"`
				LVCount   string `json:"lv_count"`
				SnapCount string `json:"snap_count"`
				VGAttr    string `json:"vg_attr"`
			} `json:"vg"`
		} `json:"report"`
	}

	if err := json.Unmarshal([]byte(output), &vgsOutput); err != nil {
		return nil, err
	}

	var volumeGroups []models.VolumeGroup
	for _, report := range vgsOutput.Report {
		for _, vg := range report.VG {
			size, _ := parseSize(vg.VGSize)
			free, _ := parseSize(vg.VGFree)
			pvCount, _ := strconv.Atoi(vg.PVCount)
			lvCount, _ := strconv.Atoi(vg.LVCount)
			snapCount, _ := strconv.Atoi(vg.SnapCount)

			volumeGroup := models.VolumeGroup{
				Name:       vg.VGName,
				UUID:       vg.VGUuid,
				Size:       size,
				SizeHuman:  formatBytes(size),
				Free:       free,
				FreeHuman:  formatBytes(free),
				PVCount:    pvCount,
				LVCount:    lvCount,
				SnapCount:  snapCount,
				Attributes: vg.VGAttr,
			}

			// Get physical volumes for this VG
			volumeGroup.PhysicalVols, _ = getPhysicalVolumes(vg.VGName)

			// Get logical volumes for this VG
			volumeGroup.LogicalVols, _ = getLogicalVolumes(vg.VGName)

			volumeGroups = append(volumeGroups, volumeGroup)
		}
	}

	return volumeGroups, nil
}

func getPhysicalVolumes(vgName string) ([]models.PhysicalVolume, error) {
	if !checkCommandExists("pvs") {
		return []models.PhysicalVolume{}, nil
	}

	args := []string{"--reportformat", "json", "--units", "b",
		"-o", "pv_name,vg_name,pv_size,pv_free,pv_uuid,pv_fmt"}
	if vgName != "" {
		args = append(args, "-S", fmt.Sprintf("vg_name=%s", vgName))
	}

	output, err := execCommand("pvs", args...)
	if err != nil {
		return []models.PhysicalVolume{}, nil
	}

	var pvsOutput struct {
		Report []struct {
			PV []struct {
				PVName string `json:"pv_name"`
				VGName string `json:"vg_name"`
				PVSize string `json:"pv_size"`
				PVFree string `json:"pv_free"`
				PVUuid string `json:"pv_uuid"`
				PVFmt  string `json:"pv_fmt"`
			} `json:"pv"`
		} `json:"report"`
	}

	if err := json.Unmarshal([]byte(output), &pvsOutput); err != nil {
		return nil, err
	}

	var pvs []models.PhysicalVolume
	for _, report := range pvsOutput.Report {
		for _, pv := range report.PV {
			size, _ := parseSize(pv.PVSize)
			free, _ := parseSize(pv.PVFree)

			pvs = append(pvs, models.PhysicalVolume{
				Name:      pv.PVName,
				Path:      pv.PVName,
				VGName:    pv.VGName,
				Size:      size,
				SizeHuman: formatBytes(size),
				Free:      free,
				FreeHuman: formatBytes(free),
				UUID:      pv.PVUuid,
				Format:    pv.PVFmt,
			})
		}
	}

	return pvs, nil
}

func getLogicalVolumes(vgName string) ([]models.LogicalVolume, error) {
	if !checkCommandExists("lvs") {
		return []models.LogicalVolume{}, nil
	}

	args := []string{"--reportformat", "json", "--units", "b",
		"-o", "lv_name,lv_path,vg_name,lv_size,lv_attr,pool_lv,data_percent,origin,snap_percent"}
	if vgName != "" {
		args = append(args, "-S", fmt.Sprintf("vg_name=%s", vgName))
	}

	output, err := execCommand("lvs", args...)
	if err != nil {
		return []models.LogicalVolume{}, nil
	}

	var lvsOutput struct {
		Report []struct {
			LV []struct {
				LVName      string `json:"lv_name"`
				LVPath      string `json:"lv_path"`
				VGName      string `json:"vg_name"`
				LVSize      string `json:"lv_size"`
				LVAttr      string `json:"lv_attr"`
				PoolLV      string `json:"pool_lv"`
				DataPercent string `json:"data_percent"`
				Origin      string `json:"origin"`
				SnapPercent string `json:"snap_percent"`
			} `json:"lv"`
		} `json:"report"`
	}

	if err := json.Unmarshal([]byte(output), &lvsOutput); err != nil {
		return nil, err
	}

	var lvs []models.LogicalVolume
	for _, report := range lvsOutput.Report {
		for _, lv := range report.LV {
			size, _ := parseSize(lv.LVSize)
			dataPercent, _ := strconv.ParseFloat(lv.DataPercent, 64)
			snapPercent, _ := strconv.ParseFloat(lv.SnapPercent, 64)

			lvs = append(lvs, models.LogicalVolume{
				Name:        lv.LVName,
				Path:        lv.LVPath,
				VGName:      lv.VGName,
				Size:        size,
				SizeHuman:   formatBytes(size),
				Attributes:  lv.LVAttr,
				PoolLV:      lv.PoolLV,
				DataPercent: dataPercent,
				Origin:      lv.Origin,
				SnapPercent: snapPercent,
			})
		}
	}

	return lvs, nil
}

// GetRAIDArrays returns RAID array information
func GetRAIDArrays() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raids, err := getRAIDArrays()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(raids)
	}
}

func getRAIDArrays() ([]models.RAIDArray, error) {
	// Check if mdadm exists and /proc/mdstat is available
	if !checkCommandExists("mdadm") {
		return []models.RAIDArray{}, nil
	}

	data, err := os.ReadFile("/proc/mdstat")
	if err != nil {
		return []models.RAIDArray{}, nil
	}

	var raids []models.RAIDArray
	scanner := bufio.NewScanner(strings.NewReader(string(data)))

	var currentRaid *models.RAIDArray
	for scanner.Scan() {
		line := scanner.Text()

		// Match array line: md0 : active raid5 sda1[0] sdb1[1] sdc1[2]
		if strings.HasPrefix(line, "md") {
			parts := strings.Fields(line)
			if len(parts) < 4 {
				continue
			}

			name := parts[0]
			state := parts[2]
			level := parts[3]

			currentRaid = &models.RAIDArray{
				Name:    name,
				Path:    "/dev/" + name,
				Level:   level,
				State:   state,
				Members: []models.RAIDMember{},
			}

			// Parse device members
			re := regexp.MustCompile(`(\w+)\[(\d+)\](\(F\))?(\(S\))?`)
			for _, part := range parts[4:] {
				matches := re.FindStringSubmatch(part)
				if len(matches) > 0 {
					slot, _ := strconv.Atoi(matches[2])
					role := "active"
					state := "in_sync"
					if matches[3] == "(F)" {
						role = "faulty"
						state = "faulty"
					} else if matches[4] == "(S)" {
						role = "spare"
						state = "spare"
					}

					currentRaid.Members = append(currentRaid.Members, models.RAIDMember{
						Device: "/dev/" + matches[1],
						Role:   role,
						State:  state,
						Slot:   slot,
					})
				}
			}

			raids = append(raids, *currentRaid)
		}

		// Match size line: 1953514496 blocks super 1.2 [3/3] [UUU]
		if currentRaid != nil && strings.Contains(line, "blocks") {
			parts := strings.Fields(line)
			if len(parts) > 0 {
				blocks, _ := strconv.ParseUint(parts[0], 10, 64)
				currentRaid.Size = blocks * 1024 // blocks are 1KB
				currentRaid.SizeHuman = formatBytes(currentRaid.Size)

				// Update the last raid in slice
				raids[len(raids)-1] = *currentRaid
			}
		}
	}

	// Get more detailed info using mdadm
	for i := range raids {
		output, err := execCommand("mdadm", "--detail", raids[i].Path)
		if err == nil {
			// Parse UUID
			if match := regexp.MustCompile(`UUID : (\S+)`).FindStringSubmatch(output); len(match) > 1 {
				raids[i].UUID = match[1]
			}
			// Parse chunk size
			if match := regexp.MustCompile(`Chunk Size : (\S+)`).FindStringSubmatch(output); len(match) > 1 {
				raids[i].ChunkSize = match[1]
			}
			// Parse device counts
			if match := regexp.MustCompile(`Total Devices : (\d+)`).FindStringSubmatch(output); len(match) > 1 {
				raids[i].Devices, _ = strconv.Atoi(match[1])
			}
			if match := regexp.MustCompile(`Active Devices : (\d+)`).FindStringSubmatch(output); len(match) > 1 {
				raids[i].ActiveDevs, _ = strconv.Atoi(match[1])
			}
			if match := regexp.MustCompile(`Spare Devices : (\d+)`).FindStringSubmatch(output); len(match) > 1 {
				raids[i].SpareDevs, _ = strconv.Atoi(match[1])
			}
			if match := regexp.MustCompile(`Failed Devices : (\d+)`).FindStringSubmatch(output); len(match) > 1 {
				raids[i].FailedDevs, _ = strconv.Atoi(match[1])
			}
			// Check if degraded
			if strings.Contains(output, "State : degraded") || strings.Contains(output, "State : clean, degraded") {
				raids[i].State = "degraded"
			}
			// Check sync progress
			if match := regexp.MustCompile(`Rebuild Status : (\d+)% complete`).FindStringSubmatch(output); len(match) > 1 {
				raids[i].State = "rebuilding"
				raids[i].SyncPercent, _ = strconv.ParseFloat(match[1], 64)
			}
		}
	}

	return raids, nil
}

// GetRAIDStatus returns detailed status for a RAID array
func GetRAIDStatus() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := r.URL.Query().Get("name")
		if name == "" {
			http.Error(w, "RAID array name is required", http.StatusBadRequest)
			return
		}

		// Ensure it starts with /dev/
		if !strings.HasPrefix(name, "/dev/") {
			name = "/dev/" + name
		}

		output, err := exec.Command("mdadm", "--detail", name).CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to get RAID status: %s - %s", err.Error(), string(output)), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"name":   name,
			"detail": string(output),
		})
	}
}

// GetAvailableDevicesForRAID returns devices available for RAID creation
func GetAvailableDevicesForRAID() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		type AvailableDevice struct {
			Path      string `json:"path"`
			Size      uint64 `json:"size"`
			SizeHuman string `json:"size_human"`
			Model     string `json:"model"`
			Type      string `json:"type"`
			InUse     bool   `json:"in_use"`
			InRAID    string `json:"in_raid,omitempty"`
		}

		var available []AvailableDevice

		// Get all block devices using lsblk
		output, err := exec.Command("lsblk", "-J", "-b", "-o", "NAME,SIZE,TYPE,MODEL,MOUNTPOINT,FSTYPE").Output()
		if err != nil {
			http.Error(w, "Failed to list devices", http.StatusInternalServerError)
			return
		}

		var lsblkOutput struct {
			BlockDevices []struct {
				Name       string `json:"name"`
				Size       string `json:"size"`
				Type       string `json:"type"`
				Model      string `json:"model"`
				MountPoint string `json:"mountpoint"`
				FSType     string `json:"fstype"`
				Children   []struct {
					Name       string `json:"name"`
					Size       string `json:"size"`
					Type       string `json:"type"`
					MountPoint string `json:"mountpoint"`
					FSType     string `json:"fstype"`
				} `json:"children"`
			} `json:"blockdevices"`
		}

		if err := json.Unmarshal(output, &lsblkOutput); err != nil {
			http.Error(w, "Failed to parse device list", http.StatusInternalServerError)
			return
		}

		// Get existing RAID arrays
		raids, _ := getRAIDArrays()
		raidMembers := make(map[string]string) // device -> raid name
		for _, raid := range raids {
			for _, member := range raid.Members {
				raidMembers[member.Device] = raid.Name
			}
		}

		for _, dev := range lsblkOutput.BlockDevices {
			if dev.Type != "disk" {
				continue
			}

			// Check whole disk
			path := "/dev/" + dev.Name
			size, _ := strconv.ParseUint(dev.Size, 10, 64)

			// A disk is available if it's not mounted and has no filesystem
			// or if it has partitions that are not mounted
			inUse := dev.MountPoint != "" || (dev.FSType != "" && dev.FSType != "linux_raid_member")

			// Check if it's part of a RAID
			raidName := ""
			if dev.FSType == "linux_raid_member" {
				if rn, ok := raidMembers[path]; ok {
					raidName = rn
				}
			}

			if !inUse && raidName == "" {
				available = append(available, AvailableDevice{
					Path:      path,
					Size:      size,
					SizeHuman: formatBytes(size),
					Model:     dev.Model,
					Type:      "disk",
					InUse:     false,
				})
			}

			// Also check partitions
			for _, child := range dev.Children {
				childPath := "/dev/" + child.Name
				childSize, _ := strconv.ParseUint(child.Size, 10, 64)

				childInUse := child.MountPoint != "" || (child.FSType != "" && child.FSType != "linux_raid_member")
				childRaidName := ""
				if child.FSType == "linux_raid_member" {
					if rn, ok := raidMembers[childPath]; ok {
						childRaidName = rn
					}
				}

				if !childInUse && childRaidName == "" {
					available = append(available, AvailableDevice{
						Path:      childPath,
						Size:      childSize,
						SizeHuman: formatBytes(childSize),
						Model:     dev.Model,
						Type:      "partition",
						InUse:     false,
					})
				} else if childRaidName != "" {
					available = append(available, AvailableDevice{
						Path:      childPath,
						Size:      childSize,
						SizeHuman: formatBytes(childSize),
						Model:     dev.Model,
						Type:      "partition",
						InUse:     true,
						InRAID:    childRaidName,
					})
				}
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(available)
	}
}

// CreateRAIDArray creates a new software RAID array
func CreateRAIDArray() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req models.CreateRAIDRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		// Validate request
		if req.Name == "" {
			http.Error(w, "Array name is required", http.StatusBadRequest)
			return
		}
		if req.Level == "" {
			http.Error(w, "RAID level is required", http.StatusBadRequest)
			return
		}
		if len(req.Devices) < 2 {
			http.Error(w, "At least 2 devices are required", http.StatusBadRequest)
			return
		}

		// Validate RAID level
		validLevels := map[string]bool{
			"raid0": true, "0": true,
			"raid1": true, "1": true,
			"raid5": true, "5": true,
			"raid6": true, "6": true,
			"raid10": true, "10": true,
		}
		if !validLevels[strings.ToLower(req.Level)] {
			http.Error(w, "Invalid RAID level. Supported: raid0, raid1, raid5, raid6, raid10", http.StatusBadRequest)
			return
		}

		// Normalize RAID level (remove 'raid' prefix if present)
		level := strings.ToLower(req.Level)
		if strings.HasPrefix(level, "raid") {
			level = strings.TrimPrefix(level, "raid")
		}

		// Validate minimum device count for each level
		minDevices := map[string]int{
			"0":  2,
			"1":  2,
			"5":  3,
			"6":  4,
			"10": 4,
		}
		if min, ok := minDevices[level]; ok && len(req.Devices) < min {
			http.Error(w, fmt.Sprintf("RAID%s requires at least %d devices", level, min), http.StatusBadRequest)
			return
		}

		// Build mdadm command
		// Ensure name starts with md
		name := req.Name
		if !strings.HasPrefix(name, "md") {
			name = "md" + name
		}
		devicePath := "/dev/" + name

		args := []string{
			"--create", devicePath,
			"--level=" + level,
			"--raid-devices=" + strconv.Itoa(len(req.Devices)),
			"--run", // Don't prompt
		}

		// Add chunk size if specified
		if req.Chunk != "" {
			args = append(args, "--chunk="+req.Chunk)
		}

		// Add spare devices if specified
		if len(req.Spares) > 0 {
			args = append(args, "--spare-devices="+strconv.Itoa(len(req.Spares)))
		}

		// Add main devices
		args = append(args, req.Devices...)

		// Add spare devices
		args = append(args, req.Spares...)

		// Run mdadm
		output, err := exec.Command("mdadm", args...).CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to create RAID array: %s - %s", err.Error(), string(output)), http.StatusInternalServerError)
			return
		}

		// Save the configuration to mdadm.conf
		go func() {
			// Get the detail of the new array
			detail, _ := exec.Command("mdadm", "--detail", "--scan", devicePath).Output()
			if len(detail) > 0 {
				// Append to mdadm.conf
				f, err := os.OpenFile("/etc/mdadm.conf", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
				if err == nil {
					f.WriteString(string(detail))
					f.Close()
				}
			}
		}()

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"message": fmt.Sprintf("RAID array %s created successfully", devicePath),
			"device":  devicePath,
		})
	}
}

// StopRAIDArray stops a RAID array (makes it inactive)
func StopRAIDArray() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Name string `json:"name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		if req.Name == "" {
			http.Error(w, "Array name is required", http.StatusBadRequest)
			return
		}

		name := req.Name
		if !strings.HasPrefix(name, "/dev/") {
			name = "/dev/" + name
		}

		// Stop the array
		output, err := exec.Command("mdadm", "--stop", name).CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to stop RAID array: %s - %s", err.Error(), string(output)), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"message": fmt.Sprintf("RAID array %s stopped", name),
		})
	}
}

// RemoveRAIDArray removes a RAID array completely
func RemoveRAIDArray() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := r.URL.Query().Get("name")
		force := r.URL.Query().Get("force") == "true"

		if name == "" {
			http.Error(w, "Array name is required", http.StatusBadRequest)
			return
		}

		if !strings.HasPrefix(name, "/dev/") {
			name = "/dev/" + name
		}

		// Get array members before stopping
		raids, err := getRAIDArrays()
		if err != nil {
			http.Error(w, "Failed to get RAID info", http.StatusInternalServerError)
			return
		}

		var targetRaid *models.RAIDArray
		for _, raid := range raids {
			if raid.Path == name || raid.Name == strings.TrimPrefix(name, "/dev/") {
				targetRaid = &raid
				break
			}
		}

		if targetRaid == nil && !force {
			http.Error(w, "RAID array not found", http.StatusNotFound)
			return
		}

		// Stop the array first
		stopOutput, err := exec.Command("mdadm", "--stop", name).CombinedOutput()
		if err != nil && !force {
			http.Error(w, fmt.Sprintf("Failed to stop RAID array: %s - %s", err.Error(), string(stopOutput)), http.StatusInternalServerError)
			return
		}

		// Zero the superblocks on member devices
		if targetRaid != nil {
			for _, member := range targetRaid.Members {
				exec.Command("mdadm", "--zero-superblock", member.Device).Run()
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"message": fmt.Sprintf("RAID array %s removed", name),
		})
	}
}

// AddRAIDDevice adds a device to a RAID array
func AddRAIDDevice() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Array  string `json:"array"`
			Device string `json:"device"`
			Spare  bool   `json:"spare"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		if req.Array == "" || req.Device == "" {
			http.Error(w, "Array and device are required", http.StatusBadRequest)
			return
		}

		array := req.Array
		if !strings.HasPrefix(array, "/dev/") {
			array = "/dev/" + array
		}

		device := req.Device
		if !strings.HasPrefix(device, "/dev/") {
			device = "/dev/" + device
		}

		// Add device to array
		args := []string{"--add", array, device}
		output, err := exec.Command("mdadm", args...).CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to add device: %s - %s", err.Error(), string(output)), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"message": fmt.Sprintf("Device %s added to %s", device, array),
		})
	}
}

// RemoveRAIDDevice removes a device from a RAID array
func RemoveRAIDDevice() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Array  string `json:"array"`
			Device string `json:"device"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		if req.Array == "" || req.Device == "" {
			http.Error(w, "Array and device are required", http.StatusBadRequest)
			return
		}

		array := req.Array
		if !strings.HasPrefix(array, "/dev/") {
			array = "/dev/" + array
		}

		device := req.Device
		if !strings.HasPrefix(device, "/dev/") {
			device = "/dev/" + device
		}

		// First mark the device as faulty if it isn't already
		exec.Command("mdadm", "--fail", array, device).Run()

		// Remove device from array
		output, err := exec.Command("mdadm", "--remove", array, device).CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to remove device: %s - %s", err.Error(), string(output)), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"message": fmt.Sprintf("Device %s removed from %s", device, array),
		})
	}
}

// MarkRAIDDeviceFaulty marks a device as faulty in a RAID array
func MarkRAIDDeviceFaulty() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Array  string `json:"array"`
			Device string `json:"device"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		if req.Array == "" || req.Device == "" {
			http.Error(w, "Array and device are required", http.StatusBadRequest)
			return
		}

		array := req.Array
		if !strings.HasPrefix(array, "/dev/") {
			array = "/dev/" + array
		}

		device := req.Device
		if !strings.HasPrefix(device, "/dev/") {
			device = "/dev/" + device
		}

		output, err := exec.Command("mdadm", "--fail", array, device).CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to mark device as faulty: %s - %s", err.Error(), string(output)), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"message": fmt.Sprintf("Device %s marked as faulty in %s", device, array),
		})
	}
}

// GetZFSPools returns ZFS pool information
func GetZFSPools() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pools, err := getZFSPools()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(pools)
	}
}

func getZFSPools() ([]models.ZFSPool, error) {
	if !checkCommandExists("zpool") {
		return []models.ZFSPool{}, nil
	}

	output, err := execCommand("zpool", "list", "-Hp", "-o",
		"name,size,alloc,free,frag,cap,health,dedup,altroot")
	if err != nil {
		return []models.ZFSPool{}, nil
	}

	var pools []models.ZFSPool
	scanner := bufio.NewScanner(strings.NewReader(output))
	for scanner.Scan() {
		fields := strings.Split(scanner.Text(), "\t")
		if len(fields) < 8 {
			continue
		}

		size, _ := strconv.ParseUint(fields[1], 10, 64)
		allocated, _ := strconv.ParseUint(fields[2], 10, 64)
		free, _ := strconv.ParseUint(fields[3], 10, 64)
		frag, _ := strconv.Atoi(strings.TrimSuffix(fields[4], "%"))
		cap, _ := strconv.Atoi(strings.TrimSuffix(fields[5], "%"))
		dedup, _ := strconv.ParseFloat(strings.TrimSuffix(fields[7], "x"), 64)

		pool := models.ZFSPool{
			Name:          fields[0],
			Size:          size,
			SizeHuman:     formatBytes(size),
			Allocated:     allocated,
			Free:          free,
			FreeHuman:     formatBytes(free),
			Fragmentation: frag,
			Capacity:      cap,
			Health:        fields[6],
			Dedup:         dedup,
		}

		if len(fields) > 8 && fields[8] != "-" {
			pool.AltRoot = fields[8]
		}

		// Get vdev information
		pool.VDevs, _ = getZFSVDevs(pool.Name)

		// Get datasets
		pool.Datasets, _ = getZFSDatasets(pool.Name)

		pools = append(pools, pool)
	}

	return pools, nil
}

func getZFSVDevs(poolName string) ([]models.ZFSVDev, error) {
	output, err := execCommand("zpool", "status", poolName)
	if err != nil {
		return nil, err
	}

	var vdevs []models.ZFSVDev
	inConfig := false
	scanner := bufio.NewScanner(strings.NewReader(output))

	for scanner.Scan() {
		line := scanner.Text()

		if strings.Contains(line, "config:") {
			inConfig = true
			continue
		}

		if !inConfig || strings.TrimSpace(line) == "" {
			continue
		}

		if strings.Contains(line, "errors:") {
			break
		}

		// Parse vdev line: NAME STATE READ WRITE CKSUM
		fields := strings.Fields(line)
		if len(fields) < 5 {
			continue
		}

		// Skip header
		if fields[0] == "NAME" {
			continue
		}

		read, _ := strconv.ParseInt(fields[2], 10, 64)
		write, _ := strconv.ParseInt(fields[3], 10, 64)
		cksum, _ := strconv.ParseInt(fields[4], 10, 64)

		vdevType := "disk"
		name := fields[0]
		if strings.HasPrefix(name, "mirror") {
			vdevType = "mirror"
		} else if strings.HasPrefix(name, "raidz") {
			vdevType = name
		}

		vdevs = append(vdevs, models.ZFSVDev{
			Name:     name,
			Type:     vdevType,
			State:    fields[1],
			Read:     read,
			Write:    write,
			Checksum: cksum,
		})
	}

	return vdevs, nil
}

func getZFSDatasets(poolName string) ([]models.ZFSDataset, error) {
	output, err := execCommand("zfs", "list", "-Hp", "-r", "-o",
		"name,type,used,avail,refer,mountpoint,compression,compressratio,quota", poolName)
	if err != nil {
		return nil, err
	}

	var datasets []models.ZFSDataset
	scanner := bufio.NewScanner(strings.NewReader(output))
	for scanner.Scan() {
		fields := strings.Split(scanner.Text(), "\t")
		if len(fields) < 9 {
			continue
		}

		used, _ := strconv.ParseUint(fields[2], 10, 64)
		avail, _ := strconv.ParseUint(fields[3], 10, 64)
		refer, _ := strconv.ParseUint(fields[4], 10, 64)
		compRatio, _ := strconv.ParseFloat(strings.TrimSuffix(fields[7], "x"), 64)
		quota, _ := strconv.ParseUint(fields[8], 10, 64)

		dataset := models.ZFSDataset{
			Name:          fields[0],
			Type:          fields[1],
			Used:          used,
			UsedHuman:     formatBytes(used),
			Available:     avail,
			AvailHuman:    formatBytes(avail),
			Referenced:    refer,
			Compression:   fields[6],
			CompressRatio: compRatio,
		}

		if fields[5] != "-" && fields[5] != "none" {
			dataset.MountPoint = fields[5]
		}

		if quota > 0 {
			dataset.Quota = quota
			dataset.QuotaHuman = formatBytes(quota)
		}

		datasets = append(datasets, dataset)
	}

	return datasets, nil
}

// checkQuotasEnabled checks if quota support is available
func checkQuotasEnabled() bool {
	// Check if repquota command exists
	return checkCommandExists("repquota")
}

// GetFstab returns fstab entries
func GetFstab() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		entries, err := getFstabEntries()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(entries)
	}
}

func getFstabEntries() ([]models.FstabEntry, error) {
	data, err := os.ReadFile("/etc/fstab")
	if err != nil {
		return nil, err
	}

	// Get current mounts to check if entries are mounted
	mounts, _ := getMountPoints()
	mountedPaths := make(map[string]bool)
	for _, m := range mounts {
		mountedPaths[m.MountPath] = true
	}

	var entries []models.FstabEntry
	scanner := bufio.NewScanner(strings.NewReader(string(data)))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())

		// Skip comments and empty lines
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		fields := strings.Fields(line)
		if len(fields) < 4 {
			continue
		}

		dump := 0
		pass := 0
		if len(fields) > 4 {
			dump, _ = strconv.Atoi(fields[4])
		}
		if len(fields) > 5 {
			pass, _ = strconv.Atoi(fields[5])
		}

		entry := models.FstabEntry{
			Device:     fields[0],
			MountPoint: fields[1],
			FSType:     fields[2],
			Options:    fields[3],
			Dump:       dump,
			Pass:       pass,
			IsMounted:  mountedPaths[fields[1]],
		}

		entries = append(entries, entry)
	}

	return entries, nil
}

// GetIOStats returns I/O statistics for block devices
func GetIOStats() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		stats, err := getIOStats()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(stats)
	}
}

func getIOStats() ([]models.IOStats, error) {
	data, err := os.ReadFile("/proc/diskstats")
	if err != nil {
		return nil, err
	}

	var stats []models.IOStats
	scanner := bufio.NewScanner(strings.NewReader(string(data)))
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 14 {
			continue
		}

		device := fields[2]
		// Skip partitions and loop devices for the main view
		if strings.HasPrefix(device, "loop") || strings.HasPrefix(device, "dm-") {
			continue
		}

		readOps, _ := strconv.ParseUint(fields[3], 10, 64)
		readSectors, _ := strconv.ParseUint(fields[5], 10, 64)
		readTime, _ := strconv.ParseUint(fields[6], 10, 64)
		writeOps, _ := strconv.ParseUint(fields[7], 10, 64)
		writeSectors, _ := strconv.ParseUint(fields[9], 10, 64)
		writeTime, _ := strconv.ParseUint(fields[10], 10, 64)
		ioInProgress, _ := strconv.ParseUint(fields[11], 10, 64)
		ioTime, _ := strconv.ParseUint(fields[12], 10, 64)

		readBytes := readSectors * 512
		writeBytes := writeSectors * 512

		stats = append(stats, models.IOStats{
			Device:       device,
			ReadBytes:    readBytes,
			WriteBytes:   writeBytes,
			ReadOps:      readOps,
			WriteOps:     writeOps,
			ReadTime:     readTime,
			WriteTime:    writeTime,
			IOInProgress: ioInProgress,
			IOTime:       ioTime,
			ReadHuman:    formatBytes(readBytes),
			WriteHuman:   formatBytes(writeBytes),
		})
	}

	return stats, nil
}

// Mount mounts a filesystem
func Mount() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req models.MountRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		// Validate mount point exists
		if _, err := os.Stat(req.MountPoint); os.IsNotExist(err) {
			// Try to create it
			if err := os.MkdirAll(req.MountPoint, 0755); err != nil {
				http.Error(w, fmt.Sprintf("Failed to create mount point: %v", err), http.StatusBadRequest)
				return
			}
		}

		// Build mount command
		args := []string{}
		if req.FSType != "" {
			args = append(args, "-t", req.FSType)
		}
		if req.Options != "" {
			args = append(args, "-o", req.Options)
		}
		args = append(args, req.Device, req.MountPoint)

		cmd := exec.Command("mount", args...)
		output, err := cmd.CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("Mount failed: %s", string(output)), http.StatusInternalServerError)
			return
		}

		// Add to fstab if requested
		if req.Persistent {
			addToFstab(req)
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"message": "Mounted successfully"})
	}
}

func addToFstab(req models.MountRequest) error {
	entry := fmt.Sprintf("%s %s %s %s 0 0\n", req.Device, req.MountPoint, req.FSType, req.Options)

	f, err := os.OpenFile("/etc/fstab", os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	defer f.Close()

	_, err = f.WriteString(entry)
	return err
}

// Unmount unmounts a filesystem
func Unmount() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		mountPoint := r.URL.Query().Get("path")
		if mountPoint == "" {
			http.Error(w, "Mount point required", http.StatusBadRequest)
			return
		}

		force := r.URL.Query().Get("force") == "true"

		args := []string{}
		if force {
			args = append(args, "-f")
		}
		args = append(args, mountPoint)

		cmd := exec.Command("umount", args...)
		output, err := cmd.CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("Unmount failed: %s", string(output)), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"message": "Unmounted successfully"})
	}
}

// FormatPartition formats a partition with a filesystem
func FormatPartition() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req models.FormatRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		// Safety check - ensure device path is valid
		if !strings.HasPrefix(req.Device, "/dev/") {
			http.Error(w, "Invalid device path", http.StatusBadRequest)
			return
		}

		// Check if device is mounted
		mounts, _ := getMountPoints()
		for _, m := range mounts {
			if m.Device == req.Device {
				http.Error(w, "Device is currently mounted", http.StatusBadRequest)
				return
			}
		}

		// Build mkfs command based on filesystem type
		var cmd *exec.Cmd
		switch req.FSType {
		case "ext4":
			args := []string{"-t", "ext4"}
			if req.Force {
				args = append(args, "-F")
			}
			if req.Label != "" {
				args = append(args, "-L", req.Label)
			}
			args = append(args, req.Device)
			cmd = exec.Command("mkfs", args...)
		case "xfs":
			args := []string{}
			if req.Force {
				args = append(args, "-f")
			}
			if req.Label != "" {
				args = append(args, "-L", req.Label)
			}
			args = append(args, req.Device)
			cmd = exec.Command("mkfs.xfs", args...)
		case "btrfs":
			args := []string{}
			if req.Force {
				args = append(args, "-f")
			}
			if req.Label != "" {
				args = append(args, "-L", req.Label)
			}
			args = append(args, req.Device)
			cmd = exec.Command("mkfs.btrfs", args...)
		default:
			http.Error(w, "Unsupported filesystem type", http.StatusBadRequest)
			return
		}

		output, err := cmd.CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("Format failed: %s", string(output)), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"message": "Formatted successfully"})
	}
}

// CreatePartition creates a new partition on a disk
func CreatePartition() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req models.CreatePartitionRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		// Validate disk path
		if !strings.HasPrefix(req.Disk, "/dev/") {
			http.Error(w, "Invalid disk path", http.StatusBadRequest)
			return
		}

		// Use parted to create partition
		args := []string{"-s", req.Disk, "mkpart", "primary", req.Start, req.End}
		cmd := exec.Command("parted", args...)
		output, err := cmd.CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to create partition: %s", string(output)), http.StatusInternalServerError)
			return
		}

		// Inform kernel of partition changes
		exec.Command("partprobe", req.Disk).Run()

		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"message": "Partition created successfully"})
	}
}

// CreatePartitionTable creates a new partition table on a disk (GPT or MBR/msdos)
func CreatePartitionTable() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Disk      string `json:"disk"`
			TableType string `json:"table_type"` // "gpt" or "msdos"
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		// Validate disk path
		if !strings.HasPrefix(req.Disk, "/dev/") {
			http.Error(w, "Invalid disk path", http.StatusBadRequest)
			return
		}

		// Validate table type
		if req.TableType != "gpt" && req.TableType != "msdos" {
			http.Error(w, "Invalid table type. Use 'gpt' or 'msdos'", http.StatusBadRequest)
			return
		}

		// Check if disk has mounted partitions
		mounts, _ := getMountPoints()
		for _, m := range mounts {
			if strings.HasPrefix(m.Device, req.Disk) {
				http.Error(w, fmt.Sprintf("Disk has mounted partition: %s at %s", m.Device, m.MountPath), http.StatusBadRequest)
				return
			}
		}

		// Create partition table using parted
		cmd := exec.Command("parted", "-s", req.Disk, "mklabel", req.TableType)
		output, err := cmd.CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to create partition table: %s", string(output)), http.StatusInternalServerError)
			return
		}

		// Inform kernel of partition changes
		exec.Command("partprobe", req.Disk).Run()

		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{
			"message":    "Partition table created successfully",
			"disk":       req.Disk,
			"table_type": req.TableType,
		})
	}
}

// DeletePartition deletes a partition
func DeletePartition() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		device := r.URL.Query().Get("device")
		if device == "" {
			http.Error(w, "Device path required", http.StatusBadRequest)
			return
		}

		// Validate device path
		if !strings.HasPrefix(device, "/dev/") {
			http.Error(w, "Invalid device path", http.StatusBadRequest)
			return
		}

		// Check if mounted
		mounts, _ := getMountPoints()
		for _, m := range mounts {
			if m.Device == device {
				http.Error(w, "Partition is currently mounted", http.StatusBadRequest)
				return
			}
		}

		// Extract disk and partition number
		// e.g., /dev/sda1 -> disk=/dev/sda, partnum=1
		re := regexp.MustCompile(`^(/dev/[a-z]+)(\d+)$`)
		matches := re.FindStringSubmatch(device)
		if len(matches) != 3 {
			// Try nvme format: /dev/nvme0n1p1
			re = regexp.MustCompile(`^(/dev/nvme\d+n\d+)p(\d+)$`)
			matches = re.FindStringSubmatch(device)
			if len(matches) != 3 {
				http.Error(w, "Cannot parse device path", http.StatusBadRequest)
				return
			}
		}

		disk := matches[1]
		partNum := matches[2]

		cmd := exec.Command("parted", "-s", disk, "rm", partNum)
		output, err := cmd.CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to delete partition: %s", string(output)), http.StatusInternalServerError)
			return
		}

		exec.Command("partprobe", disk).Run()

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"message": "Partition deleted successfully"})
	}
}

// CreateVolumeGroup creates an LVM volume group
func CreateVolumeGroup() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req models.CreateVolumeGroupRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		if req.Name == "" || len(req.Devices) == 0 {
			http.Error(w, "Name and devices are required", http.StatusBadRequest)
			return
		}

		// Initialize physical volumes first
		for _, dev := range req.Devices {
			cmd := exec.Command("pvcreate", "-f", dev)
			output, err := cmd.CombinedOutput()
			if err != nil {
				http.Error(w, fmt.Sprintf("Failed to create PV on %s: %s", dev, string(output)), http.StatusInternalServerError)
				return
			}
		}

		// Create volume group
		args := append([]string{req.Name}, req.Devices...)
		cmd := exec.Command("vgcreate", args...)
		output, err := cmd.CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to create VG: %s", string(output)), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"message": "Volume group created successfully"})
	}
}

// CreateLogicalVolume creates an LVM logical volume
func CreateLogicalVolume() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req models.CreateLogicalVolumeRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		if req.Name == "" || req.VGName == "" || req.Size == "" {
			http.Error(w, "Name, volume group, and size are required", http.StatusBadRequest)
			return
		}

		// Create logical volume
		args := []string{"-n", req.Name}

		if strings.HasSuffix(req.Size, "%FREE") || strings.HasSuffix(req.Size, "%VG") {
			args = append(args, "-l", req.Size)
		} else {
			args = append(args, "-L", req.Size)
		}

		if req.Snapshot != "" {
			args = append(args, "-s", filepath.Join("/dev", req.VGName, req.Snapshot))
		}

		args = append(args, req.VGName)

		cmd := exec.Command("lvcreate", args...)
		output, err := cmd.CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to create LV: %s", string(output)), http.StatusInternalServerError)
			return
		}

		// Format if filesystem specified
		lvPath := filepath.Join("/dev", req.VGName, req.Name)
		if req.FSType != "" {
			cmd := exec.Command("mkfs", "-t", req.FSType, lvPath)
			output, err := cmd.CombinedOutput()
			if err != nil {
				http.Error(w, fmt.Sprintf("LV created but format failed: %s", string(output)), http.StatusInternalServerError)
				return
			}
		}

		// Mount if mount point specified
		if req.Mount != "" {
			os.MkdirAll(req.Mount, 0755)
			cmd := exec.Command("mount", lvPath, req.Mount)
			output, err := cmd.CombinedOutput()
			if err != nil {
				http.Error(w, fmt.Sprintf("LV created and formatted but mount failed: %s", string(output)), http.StatusInternalServerError)
				return
			}
		}

		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{
			"message": "Logical volume created successfully",
			"path":    lvPath,
		})
	}
}

// DeleteVolumeGroup deletes an LVM volume group
func DeleteVolumeGroup() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := r.URL.Query().Get("name")
		force := r.URL.Query().Get("force") == "true"

		if name == "" {
			http.Error(w, "Volume group name required", http.StatusBadRequest)
			return
		}

		args := []string{"-y"}
		if force {
			args = append(args, "-f")
		}
		args = append(args, name)

		cmd := exec.Command("vgremove", args...)
		output, err := cmd.CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to delete VG: %s", string(output)), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"message": "Volume group deleted successfully"})
	}
}

// DeleteLogicalVolume deletes an LVM logical volume
func DeleteLogicalVolume() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vg := r.URL.Query().Get("vg")
		lv := r.URL.Query().Get("lv")
		force := r.URL.Query().Get("force") == "true"

		if vg == "" || lv == "" {
			http.Error(w, "Volume group and logical volume names required", http.StatusBadRequest)
			return
		}

		lvPath := filepath.Join("/dev", vg, lv)

		// Check if mounted
		mounts, _ := getMountPoints()
		for _, m := range mounts {
			if m.Device == lvPath {
				http.Error(w, "Logical volume is currently mounted", http.StatusBadRequest)
				return
			}
		}

		args := []string{"-y"}
		if force {
			args = append(args, "-f")
		}
		args = append(args, lvPath)

		cmd := exec.Command("lvremove", args...)
		output, err := cmd.CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to delete LV: %s", string(output)), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"message": "Logical volume deleted successfully"})
	}
}

// ResizeLogicalVolume resizes an LVM logical volume
func ResizeLogicalVolume() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req models.ResizeRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		// Determine if extending or reducing
		var cmd *exec.Cmd
		if strings.HasPrefix(req.Size, "+") || strings.HasPrefix(req.Size, "-") {
			// Relative size change
			if strings.HasPrefix(req.Size, "-") {
				// Shrink - need to resize FS first
				if req.ResizeFS {
					// This is dangerous, would need unmount first
					http.Error(w, "Shrinking with filesystem resize requires manual intervention", http.StatusBadRequest)
					return
				}
				cmd = exec.Command("lvreduce", "-y", "-L", req.Size, req.Device)
			} else {
				args := []string{"-y", "-L", req.Size}
				if req.ResizeFS {
					args = append(args, "-r")
				}
				args = append(args, req.Device)
				cmd = exec.Command("lvextend", args...)
			}
		} else {
			// Absolute size
			args := []string{"-y", "-L", req.Size}
			if req.ResizeFS {
				args = append(args, "-r")
			}
			args = append(args, req.Device)
			cmd = exec.Command("lvresize", args...)
		}

		output, err := cmd.CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("Resize failed: %s", string(output)), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"message": "Logical volume resized successfully"})
	}
}

// BrowseDirectories returns a list of directories for path browsing/autocomplete
func BrowseDirectories() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		basePath := r.URL.Query().Get("path")
		if basePath == "" {
			basePath = "/"
		}

		// Clean the path
		basePath = filepath.Clean(basePath)

		// Ensure path starts with /
		if !strings.HasPrefix(basePath, "/") {
			basePath = "/" + basePath
		}

		// Check if path exists
		info, err := os.Stat(basePath)
		if os.IsNotExist(err) {
			// Return parent directory contents instead
			basePath = filepath.Dir(basePath)
			info, err = os.Stat(basePath)
			if err != nil {
				http.Error(w, "Path not found", http.StatusNotFound)
				return
			}
		} else if err != nil {
			http.Error(w, fmt.Sprintf("Error accessing path: %v", err), http.StatusInternalServerError)
			return
		}

		// If it's a file, use parent directory
		if !info.IsDir() {
			basePath = filepath.Dir(basePath)
		}

		// Read directory contents
		entries, err := os.ReadDir(basePath)
		if err != nil {
			http.Error(w, fmt.Sprintf("Error reading directory: %v", err), http.StatusInternalServerError)
			return
		}

		type DirEntry struct {
			Name     string `json:"name"`
			Path     string `json:"path"`
			IsDir    bool   `json:"is_dir"`
			Writable bool   `json:"writable"`
		}

		var dirs []DirEntry

		// Add parent directory if not at root
		if basePath != "/" {
			parentPath := filepath.Dir(basePath)
			dirs = append(dirs, DirEntry{
				Name:     "..",
				Path:     parentPath,
				IsDir:    true,
				Writable: isWritable(parentPath),
			})
		}

		for _, entry := range entries {
			// Only include directories
			if !entry.IsDir() {
				continue
			}

			// Skip hidden directories (except for common mount points)
			name := entry.Name()
			if strings.HasPrefix(name, ".") {
				continue
			}

			// Skip system directories that shouldn't be used for storage
			skipDirs := map[string]bool{
				"proc": true, "sys": true, "dev": true, "run": true,
				"boot": true, "lib": true, "lib64": true, "bin": true,
				"sbin": true, "usr": true, "etc": true, "lost+found": true,
			}
			if skipDirs[name] && basePath == "/" {
				continue
			}

			fullPath := filepath.Join(basePath, name)
			dirs = append(dirs, DirEntry{
				Name:     name,
				Path:     fullPath,
				IsDir:    true,
				Writable: isWritable(fullPath),
			})
		}

		response := struct {
			CurrentPath string     `json:"current_path"`
			ParentPath  string     `json:"parent_path"`
			Entries     []DirEntry `json:"entries"`
		}{
			CurrentPath: basePath,
			ParentPath:  filepath.Dir(basePath),
			Entries:     dirs,
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
	}
}

// isWritable checks if a path is writable
func isWritable(path string) bool {
	// Try to create a temp file to check writability
	testFile := filepath.Join(path, ".write_test_"+fmt.Sprintf("%d", time.Now().UnixNano()))
	f, err := os.Create(testFile)
	if err != nil {
		return false
	}
	f.Close()
	os.Remove(testFile)
	return true
}

// GetAvailableDevices returns unmounted block devices suitable for storage
func GetAvailableDevices() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		disks, err := getDisks()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// Get current mounts to filter out mounted devices
		mounts, _ := getMountPoints()
		mountedDevices := make(map[string]bool)
		for _, m := range mounts {
			mountedDevices[m.Device] = true
		}

		type AvailableDevice struct {
			Name       string `json:"name"`
			Path       string `json:"path"`
			Size       uint64 `json:"size"`
			SizeHuman  string `json:"size_human"`
			Type       string `json:"type"`
			Model      string `json:"model"`
			Serial     string `json:"serial"`
			FSType     string `json:"fstype"`
			Label      string `json:"label"`
			UUID       string `json:"uuid"`
			IsMounted  bool   `json:"is_mounted"`
			MountPoint string `json:"mount_point"`
			ParentDisk string `json:"parent_disk"`
			IsWholeDisk bool  `json:"is_whole_disk"`
		}

		var available []AvailableDevice

		for _, disk := range disks {
			// Check partitions
			for _, part := range disk.Partitions {
				isMounted := mountedDevices[part.Path] || part.MountPoint != ""
				available = append(available, AvailableDevice{
					Name:        part.Name,
					Path:        part.Path,
					Size:        part.Size,
					SizeHuman:   part.SizeHuman,
					Type:        "partition",
					Model:       disk.Model,
					Serial:      disk.Serial,
					FSType:      part.FSType,
					Label:       part.Label,
					UUID:        part.UUID,
					IsMounted:   isMounted,
					MountPoint:  part.MountPoint,
					ParentDisk:  disk.Path,
					IsWholeDisk: false,
				})
			}

			// If disk has no partitions, it might be usable as a whole
			if len(disk.Partitions) == 0 && !disk.ReadOnly {
				// Check if the whole disk itself is mounted
				diskMounted := mountedDevices[disk.Path] || disk.MountPoint != ""
				available = append(available, AvailableDevice{
					Name:        disk.Name,
					Path:        disk.Path,
					Size:        disk.Size,
					SizeHuman:   disk.SizeHuman,
					Type:        disk.Type,
					Model:       disk.Model,
					Serial:      disk.Serial,
					FSType:      disk.FSType,     // Include disk-level filesystem
					Label:       disk.Label,      // Include disk-level label
					UUID:        disk.UUID,       // Include disk-level UUID
					IsMounted:   diskMounted,     // Check if disk itself is mounted
					MountPoint:  disk.MountPoint, // Include disk-level mount point
					ParentDisk:  "",
					IsWholeDisk: true,
				})
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(available)
	}
}

// CreateMountPoint creates a directory for mounting
func CreateMountPoint() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Path string `json:"path"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		if req.Path == "" {
			http.Error(w, "Path is required", http.StatusBadRequest)
			return
		}

		// Validate path is absolute
		if !strings.HasPrefix(req.Path, "/") {
			http.Error(w, "Path must be absolute", http.StatusBadRequest)
			return
		}

		// Ensure parent directory exists
		parentDir := filepath.Dir(req.Path)
		if _, err := os.Stat(parentDir); os.IsNotExist(err) {
			http.Error(w, "Parent directory does not exist", http.StatusBadRequest)
			return
		}

		// Create the mount point directory
		if err := os.MkdirAll(req.Path, 0755); err != nil {
			http.Error(w, fmt.Sprintf("Failed to create directory: %v", err), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{
			"message": "Mount point created successfully",
			"path":    req.Path,
		})
	}
}

// SetupStorageDevice handles the complete process of formatting, mounting, and optionally adding to fstab
func SetupStorageDevice() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Device     string `json:"device"`
			FSType     string `json:"fstype"`
			Label      string `json:"label"`
			MountPoint string `json:"mount_point"`
			Persistent bool   `json:"persistent"`
			Force      bool   `json:"force"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		// Validate inputs
		if req.Device == "" || req.MountPoint == "" {
			http.Error(w, "Device and mount_point are required", http.StatusBadRequest)
			return
		}
		if req.FSType == "" {
			req.FSType = "ext4" // Default to ext4
		}

		// Safety check - ensure device path is valid
		if !strings.HasPrefix(req.Device, "/dev/") {
			http.Error(w, "Invalid device path", http.StatusBadRequest)
			return
		}

		// Check if device is mounted
		mounts, _ := getMountPoints()
		for _, m := range mounts {
			if m.Device == req.Device {
				http.Error(w, "Device is currently mounted", http.StatusBadRequest)
				return
			}
		}

		// Step 1: Create mount point directory
		if err := os.MkdirAll(req.MountPoint, 0755); err != nil {
			http.Error(w, fmt.Sprintf("Failed to create mount point: %v", err), http.StatusInternalServerError)
			return
		}

		// Step 2: Format the device
		var formatCmd *exec.Cmd
		switch req.FSType {
		case "ext4":
			args := []string{"-t", "ext4"}
			if req.Force {
				args = append(args, "-F")
			}
			if req.Label != "" {
				args = append(args, "-L", req.Label)
			}
			args = append(args, req.Device)
			formatCmd = exec.Command("mkfs", args...)
		case "xfs":
			args := []string{}
			if req.Force {
				args = append(args, "-f")
			}
			if req.Label != "" {
				args = append(args, "-L", req.Label)
			}
			args = append(args, req.Device)
			formatCmd = exec.Command("mkfs.xfs", args...)
		case "btrfs":
			args := []string{}
			if req.Force {
				args = append(args, "-f")
			}
			if req.Label != "" {
				args = append(args, "-L", req.Label)
			}
			args = append(args, req.Device)
			formatCmd = exec.Command("mkfs.btrfs", args...)
		default:
			http.Error(w, "Unsupported filesystem type. Supported: ext4, xfs, btrfs", http.StatusBadRequest)
			return
		}

		output, err := formatCmd.CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("Format failed: %s", string(output)), http.StatusInternalServerError)
			return
		}

		// Step 3: Mount the device
		mountCmd := exec.Command("mount", "-t", req.FSType, req.Device, req.MountPoint)
		output, err = mountCmd.CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("Mount failed: %s", string(output)), http.StatusInternalServerError)
			return
		}

		// Step 4: Add to fstab if persistent
		if req.Persistent {
			// Get UUID of the newly formatted device
			uuidOutput, err := execCommand("blkid", "-s", "UUID", "-o", "value", req.Device)
			uuid := strings.TrimSpace(uuidOutput)

			var fstabEntry string
			if err == nil && uuid != "" {
				fstabEntry = fmt.Sprintf("UUID=%s %s %s defaults 0 2\n", uuid, req.MountPoint, req.FSType)
			} else {
				fstabEntry = fmt.Sprintf("%s %s %s defaults 0 2\n", req.Device, req.MountPoint, req.FSType)
			}

			f, err := os.OpenFile("/etc/fstab", os.O_APPEND|os.O_WRONLY, 0644)
			if err != nil {
				// Mount succeeded but fstab update failed - warn but don't fail
				w.WriteHeader(http.StatusOK)
				json.NewEncoder(w).Encode(map[string]interface{}{
					"message":    "Device formatted and mounted, but fstab update failed",
					"warning":    fmt.Sprintf("Could not update /etc/fstab: %v", err),
					"device":     req.Device,
					"mount_point": req.MountPoint,
					"fstype":     req.FSType,
				})
				return
			}
			defer f.Close()
			f.WriteString(fstabEntry)
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"message":     "Device setup completed successfully",
			"device":      req.Device,
			"mount_point": req.MountPoint,
			"fstype":      req.FSType,
			"persistent":  req.Persistent,
		})
	}
}
