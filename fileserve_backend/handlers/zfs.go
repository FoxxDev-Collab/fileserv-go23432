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
)

// ZFSStatus represents overall ZFS status
type ZFSStatus struct {
	Installed      bool   `json:"installed"`
	KernelModule   bool   `json:"kernel_module"`
	Version        string `json:"version"`
	PackageName    string `json:"package_name"`
	CanInstall     bool   `json:"can_install"`
	Message        string `json:"message"`
	PackageManager string `json:"package_manager"`
}

// ZFSPool represents a ZFS pool
type ZFSPool struct {
	Name       string  `json:"name"`
	Size       int64   `json:"size"`
	Allocated  int64   `json:"allocated"`
	Free       int64   `json:"free"`
	Fragmentation string `json:"fragmentation"`
	Capacity   string  `json:"capacity"`
	Dedup      string  `json:"dedup"`
	Health     string  `json:"health"`
	Altroot    string  `json:"altroot"`
}

// ZFSPoolStatus represents detailed pool status
type ZFSPoolStatus struct {
	Name       string           `json:"name"`
	State      string           `json:"state"`
	Status     string           `json:"status"`
	Action     string           `json:"action"`
	Scan       string           `json:"scan"`
	Config     []ZFSVDevConfig  `json:"config"`
	Errors     string           `json:"errors"`
}

// ZFSVDevConfig represents vdev configuration
type ZFSVDevConfig struct {
	Name   string `json:"name"`
	State  string `json:"state"`
	Read   string `json:"read"`
	Write  string `json:"write"`
	Cksum  string `json:"cksum"`
	Indent int    `json:"indent"`
}

// ZFSDataset represents a ZFS dataset (filesystem or volume)
type ZFSDataset struct {
	Name        string `json:"name"`
	Type        string `json:"type"` // filesystem, volume, snapshot
	Used        int64  `json:"used"`
	Available   int64  `json:"available"`
	Referenced  int64  `json:"referenced"`
	Mountpoint  string `json:"mountpoint"`
	Compression string `json:"compression"`
	Quota       string `json:"quota"`
	Reservation string `json:"reservation"`
	RecordSize  string `json:"recordsize"`
	Atime       string `json:"atime"`
	Sync        string `json:"sync"`
}

// ZFSSnapshot represents a ZFS snapshot
type ZFSSnapshot struct {
	Name       string `json:"name"`
	Dataset    string `json:"dataset"`
	Used       int64  `json:"used"`
	Referenced int64  `json:"referenced"`
	Creation   string `json:"creation"`
}

// GetZFSStatus returns ZFS installation and status
func GetZFSStatus() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		status := ZFSStatus{
			PackageName:    "zfs",
			PackageManager: detectPackageManager(),
		}

		// Check if zpool command exists
		zpoolPath, err := exec.LookPath("zpool")
		status.Installed = err == nil && zpoolPath != ""

		// Check kernel module
		modOutput, _ := exec.Command("lsmod").CombinedOutput()
		status.KernelModule = strings.Contains(string(modOutput), "zfs")

		if status.Installed {
			// Get version
			output, err := exec.Command("zfs", "version").CombinedOutput()
			if err == nil {
				lines := strings.Split(string(output), "\n")
				for _, line := range lines {
					if strings.HasPrefix(line, "zfs-") {
						status.Version = strings.TrimPrefix(line, "zfs-")
						break
					}
				}
			}

			if status.KernelModule {
				status.Message = "ZFS is installed and the kernel module is loaded"
			} else {
				status.Message = "ZFS is installed but the kernel module is not loaded. Run 'modprobe zfs' to load it."
			}
		} else {
			status.Message = "ZFS is not installed"
			// Determine package name based on distro
			switch status.PackageManager {
			case "dnf", "yum":
				status.PackageName = "zfs"
			case "apt":
				status.PackageName = "zfsutils-linux"
			}
		}

		status.CanInstall = canInstallPackages()

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(status)
	}
}

// detectELVersion detects the Enterprise Linux version (7, 8, 9, 10)
func detectELVersion() string {
	// Try /etc/os-release first
	output, err := exec.Command("cat", "/etc/os-release").CombinedOutput()
	if err == nil {
		content := string(output)
		// Look for VERSION_ID
		for _, line := range strings.Split(content, "\n") {
			if strings.HasPrefix(line, "VERSION_ID=") {
				version := strings.Trim(strings.TrimPrefix(line, "VERSION_ID="), "\"")
				// Extract major version
				parts := strings.Split(version, ".")
				if len(parts) > 0 {
					return parts[0]
				}
			}
		}
	}

	// Fallback: check kernel version for elN pattern
	kernelOutput, _ := exec.Command("uname", "-r").CombinedOutput()
	kernel := string(kernelOutput)
	if strings.Contains(kernel, ".el10") {
		return "10"
	} else if strings.Contains(kernel, ".el9") {
		return "9"
	} else if strings.Contains(kernel, ".el8") {
		return "8"
	} else if strings.Contains(kernel, ".el7") {
		return "7"
	}

	return "9" // Default to el9
}

// LoadZFSModule loads the ZFS kernel module
func LoadZFSModule() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cmd := exec.Command("sudo", "modprobe", "zfs")
		output, err := cmd.CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to load ZFS module: %s - %s", err.Error(), string(output)), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"message": "ZFS kernel module loaded successfully",
		})
	}
}

// ListZFSPools lists all ZFS pools
func ListZFSPools() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pools := []ZFSPool{}

		// zpool list -H -p -o name,size,allocated,free,fragmentation,capacity,dedupratio,health,altroot
		output, err := exec.Command("zpool", "list", "-H", "-p", "-o", "name,size,allocated,free,fragmentation,capacity,dedupratio,health,altroot").CombinedOutput()
		if err != nil {
			// No pools or zfs not available
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(pools)
			return
		}

		scanner := bufio.NewScanner(strings.NewReader(string(output)))
		for scanner.Scan() {
			fields := strings.Fields(scanner.Text())
			if len(fields) >= 8 {
				pool := ZFSPool{
					Name:          fields[0],
					Fragmentation: fields[4],
					Capacity:      fields[5],
					Dedup:         fields[6],
					Health:        fields[7],
				}
				pool.Size, _ = strconv.ParseInt(fields[1], 10, 64)
				pool.Allocated, _ = strconv.ParseInt(fields[2], 10, 64)
				pool.Free, _ = strconv.ParseInt(fields[3], 10, 64)
				if len(fields) > 8 {
					pool.Altroot = fields[8]
				}
				pools = append(pools, pool)
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(pools)
	}
}

// GetZFSPoolStatus gets detailed status of a pool
func GetZFSPoolStatus() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		poolName := r.URL.Query().Get("pool")
		if poolName == "" {
			http.Error(w, "Pool name required", http.StatusBadRequest)
			return
		}

		output, err := exec.Command("zpool", "status", poolName).CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to get pool status: %s", string(output)), http.StatusInternalServerError)
			return
		}

		status := parseZpoolStatus(string(output))
		status.Name = poolName

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(status)
	}
}

func parseZpoolStatus(output string) ZFSPoolStatus {
	status := ZFSPoolStatus{
		Config: []ZFSVDevConfig{},
	}

	lines := strings.Split(output, "\n")
	inConfig := false

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)

		if strings.HasPrefix(trimmed, "state:") {
			status.State = strings.TrimSpace(strings.TrimPrefix(trimmed, "state:"))
		} else if strings.HasPrefix(trimmed, "status:") {
			status.Status = strings.TrimSpace(strings.TrimPrefix(trimmed, "status:"))
		} else if strings.HasPrefix(trimmed, "action:") {
			status.Action = strings.TrimSpace(strings.TrimPrefix(trimmed, "action:"))
		} else if strings.HasPrefix(trimmed, "scan:") {
			status.Scan = strings.TrimSpace(strings.TrimPrefix(trimmed, "scan:"))
		} else if strings.HasPrefix(trimmed, "errors:") {
			status.Errors = strings.TrimSpace(strings.TrimPrefix(trimmed, "errors:"))
		} else if strings.HasPrefix(trimmed, "config:") {
			inConfig = true
		} else if inConfig && trimmed != "" && !strings.HasPrefix(trimmed, "NAME") {
			// Parse config lines
			indent := len(line) - len(strings.TrimLeft(line, " \t"))
			fields := strings.Fields(trimmed)
			if len(fields) >= 5 {
				vdev := ZFSVDevConfig{
					Name:   fields[0],
					State:  fields[1],
					Read:   fields[2],
					Write:  fields[3],
					Cksum:  fields[4],
					Indent: indent,
				}
				status.Config = append(status.Config, vdev)
			}
		}
	}

	return status
}

// CreateZFSPool creates a new ZFS pool
func CreateZFSPool() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Name      string   `json:"name"`
			VDevType  string   `json:"vdev_type"` // "", "mirror", "raidz", "raidz2", "raidz3"
			Devices   []string `json:"devices"`
			MountPoint string  `json:"mountpoint"`
			Force     bool     `json:"force"`
			Ashift    int      `json:"ashift"` // Sector size: 9=512, 12=4096, 13=8192
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		if req.Name == "" || len(req.Devices) == 0 {
			http.Error(w, "Pool name and at least one device required", http.StatusBadRequest)
			return
		}

		// Validate pool name
		if !regexp.MustCompile(`^[a-zA-Z][a-zA-Z0-9_-]*$`).MatchString(req.Name) {
			http.Error(w, "Invalid pool name. Must start with letter and contain only alphanumeric, underscore, hyphen", http.StatusBadRequest)
			return
		}

		// Build command
		args := []string{"create"}

		if req.Force {
			args = append(args, "-f")
		}

		if req.MountPoint != "" {
			args = append(args, "-m", req.MountPoint)
		}

		if req.Ashift > 0 {
			args = append(args, "-o", fmt.Sprintf("ashift=%d", req.Ashift))
		}

		args = append(args, req.Name)

		if req.VDevType != "" {
			args = append(args, req.VDevType)
		}

		args = append(args, req.Devices...)

		cmd := exec.Command("sudo", append([]string{"zpool"}, args...)...)
		output, err := cmd.CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to create pool: %s - %s", err.Error(), string(output)), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"message": fmt.Sprintf("Pool '%s' created successfully", req.Name),
		})
	}
}

// DestroyZFSPool destroys a ZFS pool
func DestroyZFSPool() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Name  string `json:"name"`
			Force bool   `json:"force"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		if req.Name == "" {
			http.Error(w, "Pool name required", http.StatusBadRequest)
			return
		}

		args := []string{"zpool", "destroy"}
		if req.Force {
			args = append(args, "-f")
		}
		args = append(args, req.Name)

		cmd := exec.Command("sudo", args...)
		output, err := cmd.CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to destroy pool: %s - %s", err.Error(), string(output)), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"message": fmt.Sprintf("Pool '%s' destroyed", req.Name),
		})
	}
}

// ListZFSDatasets lists all ZFS datasets
func ListZFSDatasets() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		poolFilter := r.URL.Query().Get("pool")
		datasets := []ZFSDataset{}

		// zfs list -H -p -o name,type,used,available,referenced,mountpoint,compression,quota,reservation,recordsize,atime,sync
		args := []string{"list", "-H", "-p", "-t", "filesystem,volume", "-o", "name,type,used,available,referenced,mountpoint,compression,quota,reservation,recordsize,atime,sync"}
		if poolFilter != "" {
			args = append(args, "-r", poolFilter)
		}

		output, err := exec.Command("zfs", args...).CombinedOutput()
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(datasets)
			return
		}

		scanner := bufio.NewScanner(strings.NewReader(string(output)))
		for scanner.Scan() {
			fields := strings.Fields(scanner.Text())
			if len(fields) >= 12 {
				ds := ZFSDataset{
					Name:        fields[0],
					Type:        fields[1],
					Mountpoint:  fields[5],
					Compression: fields[6],
					Quota:       fields[7],
					Reservation: fields[8],
					RecordSize:  fields[9],
					Atime:       fields[10],
					Sync:        fields[11],
				}
				ds.Used, _ = strconv.ParseInt(fields[2], 10, 64)
				ds.Available, _ = strconv.ParseInt(fields[3], 10, 64)
				ds.Referenced, _ = strconv.ParseInt(fields[4], 10, 64)
				datasets = append(datasets, ds)
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(datasets)
	}
}

// CreateZFSDataset creates a new ZFS dataset
func CreateZFSDataset() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Name        string `json:"name"`
			Type        string `json:"type"` // filesystem or volume
			VolumeSize  string `json:"volume_size"` // Required for volumes
			Mountpoint  string `json:"mountpoint"`
			Compression string `json:"compression"` // off, lz4, gzip, zstd, etc.
			Quota       string `json:"quota"`       // e.g., "10G"
			Reservation string `json:"reservation"`
			RecordSize  string `json:"recordsize"`  // 4K-1M
			Atime       string `json:"atime"`       // on, off
			Sync        string `json:"sync"`        // standard, always, disabled
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		if req.Name == "" {
			http.Error(w, "Dataset name required", http.StatusBadRequest)
			return
		}

		args := []string{"zfs", "create"}

		// For volumes
		if req.Type == "volume" {
			if req.VolumeSize == "" {
				http.Error(w, "Volume size required for volume type", http.StatusBadRequest)
				return
			}
			args = append(args, "-V", req.VolumeSize)
		}

		// Add properties
		if req.Mountpoint != "" && req.Type != "volume" {
			args = append(args, "-o", fmt.Sprintf("mountpoint=%s", req.Mountpoint))
		}
		if req.Compression != "" {
			args = append(args, "-o", fmt.Sprintf("compression=%s", req.Compression))
		}
		if req.Quota != "" {
			args = append(args, "-o", fmt.Sprintf("quota=%s", req.Quota))
		}
		if req.Reservation != "" {
			args = append(args, "-o", fmt.Sprintf("reservation=%s", req.Reservation))
		}
		if req.RecordSize != "" {
			args = append(args, "-o", fmt.Sprintf("recordsize=%s", req.RecordSize))
		}
		if req.Atime != "" {
			args = append(args, "-o", fmt.Sprintf("atime=%s", req.Atime))
		}
		if req.Sync != "" {
			args = append(args, "-o", fmt.Sprintf("sync=%s", req.Sync))
		}

		args = append(args, req.Name)

		cmd := exec.Command("sudo", args...)
		output, err := cmd.CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to create dataset: %s - %s", err.Error(), string(output)), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"message": fmt.Sprintf("Dataset '%s' created successfully", req.Name),
		})
	}
}

// DestroyZFSDataset destroys a ZFS dataset
func DestroyZFSDataset() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Name      string `json:"name"`
			Recursive bool   `json:"recursive"`
			Force     bool   `json:"force"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		if req.Name == "" {
			http.Error(w, "Dataset name required", http.StatusBadRequest)
			return
		}

		args := []string{"zfs", "destroy"}
		if req.Recursive {
			args = append(args, "-r")
		}
		if req.Force {
			args = append(args, "-f")
		}
		args = append(args, req.Name)

		cmd := exec.Command("sudo", args...)
		output, err := cmd.CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to destroy dataset: %s - %s", err.Error(), string(output)), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"message": fmt.Sprintf("Dataset '%s' destroyed", req.Name),
		})
	}
}

// SetZFSProperty sets a property on a dataset
func SetZFSProperty() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Dataset  string `json:"dataset"`
			Property string `json:"property"`
			Value    string `json:"value"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		if req.Dataset == "" || req.Property == "" {
			http.Error(w, "Dataset and property required", http.StatusBadRequest)
			return
		}

		cmd := exec.Command("sudo", "zfs", "set", fmt.Sprintf("%s=%s", req.Property, req.Value), req.Dataset)
		output, err := cmd.CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to set property: %s - %s", err.Error(), string(output)), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"message": fmt.Sprintf("Property '%s' set to '%s' on '%s'", req.Property, req.Value, req.Dataset),
		})
	}
}

// ListZFSSnapshots lists snapshots
func ListZFSSnapshots() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		datasetFilter := r.URL.Query().Get("dataset")
		snapshots := []ZFSSnapshot{}

		args := []string{"list", "-H", "-p", "-t", "snapshot", "-o", "name,used,referenced,creation"}
		if datasetFilter != "" {
			args = append(args, "-r", datasetFilter)
		}

		output, err := exec.Command("zfs", args...).CombinedOutput()
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(snapshots)
			return
		}

		scanner := bufio.NewScanner(strings.NewReader(string(output)))
		for scanner.Scan() {
			fields := strings.Fields(scanner.Text())
			if len(fields) >= 4 {
				snap := ZFSSnapshot{
					Name:     fields[0],
					Creation: fields[3],
				}
				// Extract dataset name from snapshot name (pool/dataset@snapshot)
				if idx := strings.Index(snap.Name, "@"); idx > 0 {
					snap.Dataset = snap.Name[:idx]
				}
				snap.Used, _ = strconv.ParseInt(fields[1], 10, 64)
				snap.Referenced, _ = strconv.ParseInt(fields[2], 10, 64)
				snapshots = append(snapshots, snap)
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(snapshots)
	}
}

// CreateZFSSnapshot creates a snapshot
func CreateZFSSnapshot() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Dataset   string `json:"dataset"`
			Name      string `json:"name"`
			Recursive bool   `json:"recursive"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		if req.Dataset == "" || req.Name == "" {
			http.Error(w, "Dataset and snapshot name required", http.StatusBadRequest)
			return
		}

		snapshotName := fmt.Sprintf("%s@%s", req.Dataset, req.Name)
		args := []string{"zfs", "snapshot"}
		if req.Recursive {
			args = append(args, "-r")
		}
		args = append(args, snapshotName)

		cmd := exec.Command("sudo", args...)
		output, err := cmd.CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to create snapshot: %s - %s", err.Error(), string(output)), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"message":  fmt.Sprintf("Snapshot '%s' created", snapshotName),
			"snapshot": snapshotName,
		})
	}
}

// DeleteZFSSnapshot deletes a snapshot
func DeleteZFSSnapshot() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Name      string `json:"name"` // Full name: pool/dataset@snapshot
			Recursive bool   `json:"recursive"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		if req.Name == "" {
			http.Error(w, "Snapshot name required", http.StatusBadRequest)
			return
		}

		args := []string{"zfs", "destroy"}
		if req.Recursive {
			args = append(args, "-r")
		}
		args = append(args, req.Name)

		cmd := exec.Command("sudo", args...)
		output, err := cmd.CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to delete snapshot: %s - %s", err.Error(), string(output)), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"message": fmt.Sprintf("Snapshot '%s' deleted", req.Name),
		})
	}
}

// RollbackZFSSnapshot rolls back to a snapshot
func RollbackZFSSnapshot() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Name             string `json:"name"` // Full name: pool/dataset@snapshot
			DestroyRecent    bool   `json:"destroy_recent"` // -r: destroy snapshots newer than this one
			DestroyClones    bool   `json:"destroy_clones"` // -R: also destroy clones
			Force            bool   `json:"force"`          // -f: force unmount
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		if req.Name == "" {
			http.Error(w, "Snapshot name required", http.StatusBadRequest)
			return
		}

		args := []string{"zfs", "rollback"}
		if req.DestroyClones {
			args = append(args, "-R")
		} else if req.DestroyRecent {
			args = append(args, "-r")
		}
		if req.Force {
			args = append(args, "-f")
		}
		args = append(args, req.Name)

		cmd := exec.Command("sudo", args...)
		output, err := cmd.CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to rollback: %s - %s", err.Error(), string(output)), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"message": fmt.Sprintf("Rolled back to snapshot '%s'", req.Name),
		})
	}
}

// ScrubZFSPool starts/stops a scrub on a pool
func ScrubZFSPool() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Pool   string `json:"pool"`
			Action string `json:"action"` // start, stop, pause
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		if req.Pool == "" {
			http.Error(w, "Pool name required", http.StatusBadRequest)
			return
		}

		var args []string
		switch req.Action {
		case "stop":
			args = []string{"zpool", "scrub", "-s", req.Pool}
		case "pause":
			args = []string{"zpool", "scrub", "-p", req.Pool}
		default: // start
			args = []string{"zpool", "scrub", req.Pool}
		}

		cmd := exec.Command("sudo", args...)
		output, err := cmd.CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to %s scrub: %s - %s", req.Action, err.Error(), string(output)), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"message": fmt.Sprintf("Scrub %s on pool '%s'", req.Action, req.Pool),
		})
	}
}

// GetAvailableDisks returns disks available for ZFS pool creation
func GetAvailableDisksForZFS() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		type DiskInfo struct {
			Path   string `json:"path"`
			Size   int64  `json:"size"`
			Model  string `json:"model"`
			Type   string `json:"type"`
			InUse  bool   `json:"in_use"`
			InPool string `json:"in_pool"`
		}

		disks := []DiskInfo{}

		// Use lsblk to get disk info
		output, err := exec.Command("lsblk", "-J", "-b", "-o", "NAME,SIZE,MODEL,TYPE,MOUNTPOINT,FSTYPE").CombinedOutput()
		if err != nil {
			http.Error(w, "Failed to list disks", http.StatusInternalServerError)
			return
		}

		var lsblkOutput struct {
			Blockdevices []struct {
				Name       string `json:"name"`
				Size       int64  `json:"size"`
				Model      string `json:"model"`
				Type       string `json:"type"`
				Mountpoint string `json:"mountpoint"`
				Fstype     string `json:"fstype"`
			} `json:"blockdevices"`
		}

		if err := json.Unmarshal(output, &lsblkOutput); err != nil {
			http.Error(w, "Failed to parse disk info", http.StatusInternalServerError)
			return
		}

		// Get list of disks in ZFS pools
		zpoolDisks := make(map[string]string)
		zpoolOutput, _ := exec.Command("zpool", "status").CombinedOutput()
		// Parse zpool status to find disk membership (simplified)
		currentPool := ""
		for _, line := range strings.Split(string(zpoolOutput), "\n") {
			if strings.HasPrefix(line, "  pool:") {
				currentPool = strings.TrimSpace(strings.TrimPrefix(line, "  pool:"))
			}
			// Look for disk names in status output
			for _, dev := range lsblkOutput.Blockdevices {
				if dev.Type == "disk" && strings.Contains(line, dev.Name) {
					zpoolDisks[dev.Name] = currentPool
				}
			}
		}

		for _, dev := range lsblkOutput.Blockdevices {
			if dev.Type == "disk" {
				disk := DiskInfo{
					Path:  "/dev/" + dev.Name,
					Size:  dev.Size,
					Model: strings.TrimSpace(dev.Model),
					Type:  dev.Type,
				}

				// Check if in use
				if dev.Mountpoint != "" || dev.Fstype != "" {
					disk.InUse = true
				}

				// Check if in ZFS pool
				if pool, ok := zpoolDisks[dev.Name]; ok {
					disk.InUse = true
					disk.InPool = pool
				}

				disks = append(disks, disk)
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(disks)
	}
}

// ImportZFSPool imports a pool
func ImportZFSPool() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Pool   string `json:"pool"`
			Force  bool   `json:"force"`
			Altroot string `json:"altroot"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		args := []string{"zpool", "import"}
		if req.Force {
			args = append(args, "-f")
		}
		if req.Altroot != "" {
			args = append(args, "-R", req.Altroot)
		}
		if req.Pool != "" {
			args = append(args, req.Pool)
		}

		cmd := exec.Command("sudo", args...)
		output, err := cmd.CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to import pool: %s - %s", err.Error(), string(output)), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"message": "Pool imported successfully",
		})
	}
}

// ExportZFSPool exports a pool
func ExportZFSPool() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Pool  string `json:"pool"`
			Force bool   `json:"force"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		if req.Pool == "" {
			http.Error(w, "Pool name required", http.StatusBadRequest)
			return
		}

		args := []string{"zpool", "export"}
		if req.Force {
			args = append(args, "-f")
		}
		args = append(args, req.Pool)

		cmd := exec.Command("sudo", args...)
		output, err := cmd.CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to export pool: %s - %s", err.Error(), string(output)), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"message": fmt.Sprintf("Pool '%s' exported", req.Pool),
		})
	}
}

// ListImportablePools lists pools available for import
func ListImportablePools() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		type ImportablePool struct {
			Name   string `json:"name"`
			ID     string `json:"id"`
			State  string `json:"state"`
		}

		pools := []ImportablePool{}

		output, err := exec.Command("sudo", "zpool", "import").CombinedOutput()
		if err != nil {
			// No importable pools or error
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(pools)
			return
		}

		// Parse output
		var currentPool *ImportablePool
		for _, line := range strings.Split(string(output), "\n") {
			line = strings.TrimSpace(line)
			if strings.HasPrefix(line, "pool:") {
				if currentPool != nil {
					pools = append(pools, *currentPool)
				}
				currentPool = &ImportablePool{
					Name: strings.TrimSpace(strings.TrimPrefix(line, "pool:")),
				}
			} else if currentPool != nil {
				if strings.HasPrefix(line, "id:") {
					currentPool.ID = strings.TrimSpace(strings.TrimPrefix(line, "id:"))
				} else if strings.HasPrefix(line, "state:") {
					currentPool.State = strings.TrimSpace(strings.TrimPrefix(line, "state:"))
				}
			}
		}
		if currentPool != nil {
			pools = append(pools, *currentPool)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(pools)
	}
}
