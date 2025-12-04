package handlers

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"regexp"
	"strings"
)

// SharingServiceStatus represents the status of a sharing protocol service
type SharingServiceStatus struct {
	Protocol     string `json:"protocol"`      // smb, nfs
	DisplayName  string `json:"display_name"`  // SMB/CIFS, NFS
	Installed    bool   `json:"installed"`     // Package is installed
	Running      bool   `json:"running"`       // Service is running
	Enabled      bool   `json:"enabled"`       // Service is enabled at boot
	Version      string `json:"version"`       // Package version
	PackageName  string `json:"package_name"`  // System package name
	ServiceName  string `json:"service_name"`  // Systemd service name
	ActiveShares int    `json:"active_shares"` // Number of active shares
	Message      string `json:"message"`       // Status message or error
}

// SharingServicesResponse contains status for all sharing services
type SharingServicesResponse struct {
	SMB           SharingServiceStatus `json:"smb"`
	NFS           SharingServiceStatus `json:"nfs"`
	PackageManager string              `json:"package_manager"` // dnf, yum, apt
	CanInstall    bool                 `json:"can_install"`     // Can install packages (has sudo)
}

// GetSharingServices returns the status of SMB and NFS services
func GetSharingServices() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		response := SharingServicesResponse{
			SMB: getSMBStatus(),
			NFS: getNFSStatus(),
		}

		// Detect package manager
		response.PackageManager = detectPackageManager()

		// Check if we can install packages (sudo access)
		response.CanInstall = canInstallPackages()

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
	}
}

func getSMBStatus() SharingServiceStatus {
	status := SharingServiceStatus{
		Protocol:    "smb",
		DisplayName: "SMB/CIFS (Samba)",
		ServiceName: "smbd",
		PackageName: "samba",
	}

	// Check if Samba is installed by looking for smbd
	smbdPath, err := exec.LookPath("smbd")
	status.Installed = err == nil && smbdPath != ""

	if !status.Installed {
		// Also check for package
		status.Installed = isPackageInstalled("samba")
	}

	if status.Installed {
		// Get version
		output, err := exec.Command("smbd", "--version").CombinedOutput()
		if err == nil {
			// Parse: Version 4.x.x
			if match := regexp.MustCompile(`Version (\S+)`).FindStringSubmatch(string(output)); len(match) > 1 {
				status.Version = match[1]
			}
		}

		// Check if service is running
		output, _ = exec.Command("systemctl", "is-active", "smbd").CombinedOutput()
		status.Running = strings.TrimSpace(string(output)) == "active"

		// Also check nmbd
		if !status.Running {
			output, _ = exec.Command("systemctl", "is-active", "smb").CombinedOutput()
			status.Running = strings.TrimSpace(string(output)) == "active"
			if status.Running {
				status.ServiceName = "smb"
			}
		}

		// Check if enabled
		output, _ = exec.Command("systemctl", "is-enabled", status.ServiceName).CombinedOutput()
		status.Enabled = strings.TrimSpace(string(output)) == "enabled"

		// Count active shares from smb.conf
		status.ActiveShares = countSMBShares()

		if status.Running {
			status.Message = "SMB server is running and accepting connections"
		} else if status.Enabled {
			status.Message = "SMB server is installed and enabled, but not currently running"
		} else {
			status.Message = "SMB server is installed but not enabled or running"
		}
	} else {
		status.Message = "Samba is not installed. Install it to enable SMB/CIFS file sharing."
	}

	return status
}

func getNFSStatus() SharingServiceStatus {
	status := SharingServiceStatus{
		Protocol:    "nfs",
		DisplayName: "NFS (Network File System)",
		ServiceName: "nfs-server",
		PackageName: "nfs-utils",
	}

	// Check if NFS is installed
	exportfsPath, err := exec.LookPath("exportfs")
	status.Installed = err == nil && exportfsPath != ""

	if !status.Installed {
		status.Installed = isPackageInstalled("nfs-utils") || isPackageInstalled("nfs-kernel-server")
	}

	if status.Installed {
		// Get version
		output, err := exec.Command("rpcinfo", "-V").CombinedOutput()
		if err == nil && len(output) > 0 {
			lines := strings.Split(string(output), "\n")
			if len(lines) > 0 {
				status.Version = strings.TrimSpace(lines[0])
			}
		}

		// Try to get NFS version from exportfs
		if status.Version == "" {
			output, _ = exec.Command("exportfs", "-V").CombinedOutput()
			if match := regexp.MustCompile(`exportfs (\S+)`).FindStringSubmatch(string(output)); len(match) > 1 {
				status.Version = match[1]
			}
		}

		// Check if service is running
		activeOutput, _ := exec.Command("systemctl", "is-active", "nfs-server").CombinedOutput()
		status.Running = strings.TrimSpace(string(activeOutput)) == "active"

		// Check if enabled
		enabledOutput, _ := exec.Command("systemctl", "is-enabled", "nfs-server").CombinedOutput()
		status.Enabled = strings.TrimSpace(string(enabledOutput)) == "enabled"

		// Count active exports
		status.ActiveShares = countNFSExports()

		if status.Running {
			status.Message = "NFS server is running and exporting shares"
		} else if status.Enabled {
			status.Message = "NFS server is installed and enabled, but not currently running"
		} else {
			status.Message = "NFS server is installed but not enabled or running"
		}
	} else {
		status.Message = "NFS server is not installed. Install nfs-utils to enable NFS file sharing."
		// Adjust package name based on distro
		if detectPackageManager() == "apt" {
			status.PackageName = "nfs-kernel-server"
		}
	}

	return status
}

func countSMBShares() int {
	count := 0
	file, err := os.Open("/etc/samba/smb.conf")
	if err != nil {
		return 0
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		// Count sections that aren't [global], [homes], [printers], [print$]
		if strings.HasPrefix(line, "[") && strings.HasSuffix(line, "]") {
			section := strings.ToLower(strings.Trim(line, "[]"))
			if section != "global" && section != "homes" && section != "printers" && section != "print$" {
				count++
			}
		}
	}
	return count
}

func countNFSExports() int {
	count := 0
	file, err := os.Open("/etc/exports")
	if err != nil {
		return 0
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		// Count non-empty, non-comment lines
		if line != "" && !strings.HasPrefix(line, "#") {
			count++
		}
	}
	return count
}

func detectPackageManager() string {
	if _, err := exec.LookPath("dnf"); err == nil {
		return "dnf"
	}
	if _, err := exec.LookPath("yum"); err == nil {
		return "yum"
	}
	if _, err := exec.LookPath("apt"); err == nil {
		return "apt"
	}
	if _, err := exec.LookPath("apt-get"); err == nil {
		return "apt"
	}
	return ""
}

func isPackageInstalled(pkg string) bool {
	pm := detectPackageManager()
	var cmd *exec.Cmd

	switch pm {
	case "dnf", "yum":
		cmd = exec.Command("rpm", "-q", pkg)
	case "apt":
		cmd = exec.Command("dpkg", "-s", pkg)
	default:
		return false
	}

	err := cmd.Run()
	return err == nil
}

func canInstallPackages() bool {
	// Check if we can run sudo without password or if we're root
	if os.Geteuid() == 0 {
		return true
	}

	// Check sudo access
	cmd := exec.Command("sudo", "-n", "true")
	return cmd.Run() == nil
}

// InstallSharingService installs a sharing service package
func InstallSharingService() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Service string `json:"service"` // smb or nfs
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		pm := detectPackageManager()
		if pm == "" {
			http.Error(w, "No supported package manager found", http.StatusInternalServerError)
			return
		}

		var packages []string
		switch req.Service {
		case "smb":
			packages = []string{"samba"}
		case "nfs":
			if pm == "apt" {
				packages = []string{"nfs-kernel-server"}
			} else {
				packages = []string{"nfs-utils"}
			}
		default:
			http.Error(w, "Invalid service type. Use 'smb' or 'nfs'", http.StatusBadRequest)
			return
		}

		// Build install command
		var args []string
		switch pm {
		case "dnf":
			args = append([]string{"dnf", "install", "-y"}, packages...)
		case "yum":
			args = append([]string{"yum", "install", "-y"}, packages...)
		case "apt":
			// Run apt update first
			updateCmd := exec.Command("sudo", "apt", "update")
			updateCmd.Run()
			args = append([]string{"apt", "install", "-y"}, packages...)
		}

		// Run with sudo
		cmd := exec.Command("sudo", args...)
		output, err := cmd.CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to install package: %s\n%s", err.Error(), string(output)), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"message": fmt.Sprintf("Successfully installed %s", req.Service),
		})
	}
}

// ControlSharingService starts/stops/enables a sharing service
func ControlSharingService() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Service string `json:"service"` // smb or nfs
			Action  string `json:"action"`  // start, stop, restart, enable, disable
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		// Validate action
		validActions := map[string]bool{
			"start":   true,
			"stop":    true,
			"restart": true,
			"enable":  true,
			"disable": true,
		}
		if !validActions[req.Action] {
			http.Error(w, "Invalid action", http.StatusBadRequest)
			return
		}

		// Map service to systemd unit names
		var services []string
		switch req.Service {
		case "smb":
			// Try smbd first, fall back to smb
			if isServiceAvailable("smbd") {
				services = []string{"smbd", "nmbd"}
			} else {
				services = []string{"smb", "nmb"}
			}
		case "nfs":
			services = []string{"nfs-server"}
		default:
			http.Error(w, "Invalid service type", http.StatusBadRequest)
			return
		}

		// Execute action on all related services
		for _, svc := range services {
			cmd := exec.Command("sudo", "systemctl", req.Action, svc)
			output, err := cmd.CombinedOutput()
			if err != nil {
				http.Error(w, fmt.Sprintf("Failed to %s %s: %s", req.Action, svc, string(output)), http.StatusInternalServerError)
				return
			}
		}

		// If enabling, also start. If disabling, also stop
		if req.Action == "enable" {
			for _, svc := range services {
				exec.Command("sudo", "systemctl", "start", svc).Run()
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"message": fmt.Sprintf("Successfully executed %s on %s", req.Action, req.Service),
		})
	}
}

func isServiceAvailable(name string) bool {
	output, _ := exec.Command("systemctl", "list-unit-files", name+".service").CombinedOutput()
	return strings.Contains(string(output), name)
}

// GetSMBConfig returns the current SMB configuration
func GetSMBConfig() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		content, err := os.ReadFile("/etc/samba/smb.conf")
		if err != nil {
			if os.IsNotExist(err) {
				http.Error(w, "SMB not configured", http.StatusNotFound)
				return
			}
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"config": string(content),
		})
	}
}

// GetNFSExports returns the current NFS exports
func GetNFSExports() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		content, err := os.ReadFile("/etc/exports")
		if err != nil {
			if os.IsNotExist(err) {
				// Return empty exports
				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode(map[string]string{
					"exports": "",
				})
				return
			}
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"exports": string(content),
		})
	}
}

// TestSMBConnection tests if SMB is reachable
func TestSMBConnection() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Try to connect to local SMB port
		cmd := exec.Command("timeout", "2", "bash", "-c", "echo > /dev/tcp/127.0.0.1/445")
		err := cmd.Run()

		result := map[string]interface{}{
			"reachable": err == nil,
			"port":      445,
		}

		if err == nil {
			result["message"] = "SMB port 445 is accepting connections"
		} else {
			result["message"] = "SMB port 445 is not reachable"
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
	}
}

// TestNFSConnection tests if NFS is reachable
func TestNFSConnection() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Use showmount to test NFS
		cmd := exec.Command("showmount", "-e", "127.0.0.1")
		output, err := cmd.CombinedOutput()

		result := map[string]interface{}{
			"reachable": err == nil,
			"port":      2049,
		}

		if err == nil {
			result["message"] = "NFS server is responding"
			result["exports"] = strings.TrimSpace(string(output))
		} else {
			result["message"] = "NFS server is not responding or showmount is not available"
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
	}
}

// SMBConnection represents an active SMB connection
type SMBConnection struct {
	PID       int    `json:"pid"`
	Username  string `json:"username"`
	Group     string `json:"group"`
	Machine   string `json:"machine"`
	IPAddress string `json:"ip_address"`
	Protocol  string `json:"protocol"`
	Signing   string `json:"signing"`
	Encryption string `json:"encryption"`
}

// SMBShare represents an active SMB share session
type SMBShare struct {
	Service   string `json:"service"`
	PID       int    `json:"pid"`
	Machine   string `json:"machine"`
	ConnectedAt string `json:"connected_at"`
}

// SMBOpenFile represents an open file on SMB
type SMBOpenFile struct {
	PID      int    `json:"pid"`
	Username string `json:"username"`
	Mode     string `json:"mode"`
	Access   string `json:"access"`
	RW       string `json:"rw"`
	Oplock   string `json:"oplock"`
	SharePath string `json:"share_path"`
	Name     string `json:"name"`
}

// SMBStatus represents the full SMB status
type SMBStatus struct {
	Available    bool            `json:"available"`
	Connections  []SMBConnection `json:"connections"`
	Shares       []SMBShare      `json:"shares"`
	OpenFiles    []SMBOpenFile   `json:"open_files"`
	TotalClients int             `json:"total_clients"`
	TotalShares  int             `json:"total_shares"`
	TotalFiles   int             `json:"total_files"`
	Error        string          `json:"error,omitempty"`
}

// NFSClient represents an NFS client connection
type NFSClient struct {
	IPAddress   string `json:"ip_address"`
	Hostname    string `json:"hostname"`
	MountedPath string `json:"mounted_path"`
	ExportPath  string `json:"export_path"`
	NFSVersion  string `json:"nfs_version,omitempty"`
	Port        string `json:"port,omitempty"`
}

// NFSExport represents an NFS export
type NFSExport struct {
	Path        string   `json:"path"`
	Clients     []string `json:"clients"`
	Options     string   `json:"options"`
}

// NFSStatus represents the full NFS status
type NFSStatus struct {
	Available    bool        `json:"available"`
	Exports      []NFSExport `json:"exports"`
	Clients      []NFSClient `json:"clients"`
	TotalExports int         `json:"total_exports"`
	TotalClients int         `json:"total_clients"`
	Error        string      `json:"error,omitempty"`
}

// GetSMBStatus returns detailed SMB connection status
func GetSMBStatus() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		status := SMBStatus{
			Connections: []SMBConnection{},
			Shares:      []SMBShare{},
			OpenFiles:   []SMBOpenFile{},
		}

		// Check if smbstatus is available
		smbstatusPath, err := exec.LookPath("smbstatus")
		if err != nil || smbstatusPath == "" {
			status.Available = false
			status.Error = "smbstatus command not available (Samba not installed)"
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(status)
			return
		}

		status.Available = true

		// Get connections using smbstatus -p (processes/sessions)
		output, err := exec.Command("smbstatus", "-p", "--json").CombinedOutput()
		if err == nil {
			var sessionsData struct {
				Sessions map[string]struct {
					SessionID  string `json:"session_id"`
					ServerID   struct {
						PID string `json:"pid"`
					} `json:"server_id"`
					UID           int    `json:"uid"`
					Username      string `json:"username"`
					Groupname     string `json:"groupname"`
					RemoteMachine string `json:"remote_machine"`
					Hostname      string `json:"hostname"`
					SessionDialect string `json:"session_dialect"`
					Signing       struct {
						Cipher string `json:"cipher"`
						Degree string `json:"degree"`
					} `json:"signing"`
					Encryption    struct {
						Cipher string `json:"cipher"`
						Degree string `json:"degree"`
					} `json:"encryption"`
				} `json:"sessions"`
			}
			if err := json.Unmarshal(output, &sessionsData); err == nil {
				for _, sess := range sessionsData.Sessions {
					pid := 0
					fmt.Sscanf(sess.ServerID.PID, "%d", &pid)
					conn := SMBConnection{
						PID:        pid,
						Username:   sess.Username,
						Group:      sess.Groupname,
						Machine:    sess.Hostname,
						IPAddress:  sess.RemoteMachine,
						Protocol:   sess.SessionDialect,
						Signing:    sess.Signing.Cipher,
						Encryption: sess.Encryption.Cipher,
					}
					status.Connections = append(status.Connections, conn)
				}
			}
		}

		// Get shares using smbstatus -S (shares)
		output, err = exec.Command("smbstatus", "-S", "--json").CombinedOutput()
		if err == nil {
			var sharesData struct {
				Tcons map[string]struct {
					Service     string `json:"service"`
					ServerID    struct {
						PID string `json:"pid"`
					} `json:"server_id"`
					Machine     string `json:"machine"`
					ConnectedAt string `json:"connected_at"`
				} `json:"tcons"`
			}
			if err := json.Unmarshal(output, &sharesData); err == nil {
				for _, tcon := range sharesData.Tcons {
					pid := 0
					fmt.Sscanf(tcon.ServerID.PID, "%d", &pid)
					share := SMBShare{
						Service:     tcon.Service,
						PID:         pid,
						Machine:     tcon.Machine,
						ConnectedAt: tcon.ConnectedAt,
					}
					status.Shares = append(status.Shares, share)
				}
			}
		}

		// Get locked files using smbstatus -L (locks)
		output, err = exec.Command("smbstatus", "-L", "--json").CombinedOutput()
		if err == nil {
			var locksData struct {
				OpenFiles map[string]struct {
					ServicePath string `json:"service_path"`
					Filename    string `json:"filename"`
					FileID      struct {
						Devid int64 `json:"devid"`
						Inode int64 `json:"inode"`
					} `json:"fileid"`
					NumPendingDeletes int `json:"num_pending_deletes"`
					Opens             map[string]struct {
						ServerID struct {
							PID string `json:"pid"`
						} `json:"server_id"`
						UID        int    `json:"uid"`
						Username   string `json:"username"`
						ShareMode  string `json:"share_mode"`
						AccessMask string `json:"access_mask"`
						Oplock     string `json:"oplock"`
					} `json:"opens"`
				} `json:"open_files"`
			}
			if err := json.Unmarshal(output, &locksData); err == nil {
				for _, file := range locksData.OpenFiles {
					for _, open := range file.Opens {
						pid := 0
						fmt.Sscanf(open.ServerID.PID, "%d", &pid)
						of := SMBOpenFile{
							PID:       pid,
							Username:  open.Username,
							SharePath: file.ServicePath,
							Name:      file.Filename,
							Access:    open.AccessMask,
							Oplock:    open.Oplock,
						}
						status.OpenFiles = append(status.OpenFiles, of)
					}
				}
			}
		}

		status.TotalClients = len(status.Connections)
		status.TotalShares = len(status.Shares)
		status.TotalFiles = len(status.OpenFiles)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(status)
	}
}

// GetNFSStatus returns detailed NFS connection status
func GetNFSStatus() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		status := NFSStatus{
			Exports: []NFSExport{},
			Clients: []NFSClient{},
		}

		// Check if exportfs is available
		exportfsPath, err := exec.LookPath("exportfs")
		if err != nil || exportfsPath == "" {
			status.Available = false
			status.Error = "exportfs command not available (NFS not installed)"
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(status)
			return
		}

		status.Available = true

		// Get exports using exportfs -v
		output, err := exec.Command("exportfs", "-v").CombinedOutput()
		if err == nil {
			scanner := bufio.NewScanner(strings.NewReader(string(output)))
			for scanner.Scan() {
				line := strings.TrimSpace(scanner.Text())
				if line == "" {
					continue
				}
				// Format: /path client(options)
				// Example: /srv/nfs 192.168.1.0/24(rw,sync,no_subtree_check)
				parts := strings.Fields(line)
				if len(parts) >= 2 {
					export := NFSExport{
						Path: parts[0],
					}
					for _, part := range parts[1:] {
						// Parse client(options)
						if idx := strings.Index(part, "("); idx > 0 {
							client := part[:idx]
							options := strings.Trim(part[idx:], "()")
							export.Clients = append(export.Clients, client)
							export.Options = options
						} else {
							export.Clients = append(export.Clients, part)
						}
					}
					status.Exports = append(status.Exports, export)
				}
			}
		}

		// Track unique clients by IP
		clientMap := make(map[string]*NFSClient)

		// Method 1: Use ss to find active NFS connections (most reliable for real-time)
		// NFS uses port 2049
		output, err = exec.Command("ss", "-tn", "state", "established", "sport", "=", ":2049").CombinedOutput()
		if err == nil {
			scanner := bufio.NewScanner(strings.NewReader(string(output)))
			for scanner.Scan() {
				line := scanner.Text()
				// Skip header line
				if strings.HasPrefix(line, "Recv-Q") || strings.TrimSpace(line) == "" {
					continue
				}
				// Format: Recv-Q Send-Q Local Address:Port Peer Address:Port
				fields := strings.Fields(line)
				if len(fields) >= 4 {
					peerAddr := fields[3]
					// Extract IP from peer address (format: IP:port or [IPv6]:port)
					var ip, port string
					if strings.HasPrefix(peerAddr, "[") {
						// IPv6
						if idx := strings.LastIndex(peerAddr, "]:"); idx > 0 {
							ip = peerAddr[1:idx]
							port = peerAddr[idx+2:]
						}
					} else {
						// IPv4
						if idx := strings.LastIndex(peerAddr, ":"); idx > 0 {
							ip = peerAddr[:idx]
							port = peerAddr[idx+1:]
						}
					}
					if ip != "" && clientMap[ip] == nil {
						clientMap[ip] = &NFSClient{
							IPAddress: ip,
							Port:      port,
						}
					}
				}
			}
		}

		// Method 2: /proc/fs/nfsd/clients for NFSv4 session info
		clientsDir := "/proc/fs/nfsd/clients"
		if entries, err := os.ReadDir(clientsDir); err == nil {
			for _, entry := range entries {
				if entry.IsDir() {
					infoPath := fmt.Sprintf("%s/%s/info", clientsDir, entry.Name())
					if data, err := os.ReadFile(infoPath); err == nil {
						var ip, hostname, nfsVersion string
						for _, line := range strings.Split(string(data), "\n") {
							line = strings.TrimSpace(line)
							if strings.HasPrefix(line, "address:") {
								ip = strings.TrimSpace(strings.TrimPrefix(line, "address:"))
							}
							if strings.HasPrefix(line, "name:") {
								hostname = strings.TrimSpace(strings.TrimPrefix(line, "name:"))
							}
							if strings.HasPrefix(line, "minor version:") {
								minorVer := strings.TrimSpace(strings.TrimPrefix(line, "minor version:"))
								nfsVersion = "NFSv4." + minorVer
							}
						}
						if ip != "" {
							if existing, ok := clientMap[ip]; ok {
								existing.Hostname = hostname
								existing.NFSVersion = nfsVersion
							} else {
								clientMap[ip] = &NFSClient{
									IPAddress:  ip,
									Hostname:   hostname,
									NFSVersion: nfsVersion,
								}
							}
						}
					}
				}
			}
		}

		// Method 3: showmount -a for mount info (may include stale entries)
		output, err = exec.Command("showmount", "-a", "--no-headers").CombinedOutput()
		if err == nil {
			scanner := bufio.NewScanner(strings.NewReader(string(output)))
			for scanner.Scan() {
				line := strings.TrimSpace(scanner.Text())
				if line == "" {
					continue
				}
				// Format: hostname:mountpoint or IP:mountpoint
				parts := strings.SplitN(line, ":", 2)
				if len(parts) == 2 {
					ip := parts[0]
					mountPath := parts[1]
					if existing, ok := clientMap[ip]; ok {
						existing.MountedPath = mountPath
					} else {
						// Only add if we have an active ss connection OR no ss connections detected
						if len(clientMap) == 0 {
							clientMap[ip] = &NFSClient{
								IPAddress:   ip,
								Hostname:    ip,
								MountedPath: mountPath,
							}
						}
					}
				}
			}
		}

		// Convert map to slice
		for _, client := range clientMap {
			status.Clients = append(status.Clients, *client)
		}

		status.TotalExports = len(status.Exports)
		status.TotalClients = len(status.Clients)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(status)
	}
}

// SetSambaPassword sets a Samba password for a user
// This is required because Samba maintains its own password database separate from Linux
func SetSambaPassword() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		if req.Username == "" || req.Password == "" {
			http.Error(w, "Username and password are required", http.StatusBadRequest)
			return
		}

		// Check if smbpasswd is available
		smbpasswdPath, err := exec.LookPath("smbpasswd")
		if err != nil || smbpasswdPath == "" {
			http.Error(w, "smbpasswd command not available (Samba not installed)", http.StatusServiceUnavailable)
			return
		}

		// Use the helper from sharing_config.go
		if err := SetSambaUserPassword(req.Username, req.Password); err != nil {
			http.Error(w, fmt.Sprintf("Failed to set Samba password: %v", err), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"message": fmt.Sprintf("Samba password set successfully for user %s", req.Username),
		})
	}
}

// GetSambaUsers returns a list of Samba users
func GetSambaUsers() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Check if pdbedit is available
		pdbeditPath, err := exec.LookPath("pdbedit")
		if err != nil || pdbeditPath == "" {
			// Fallback: try reading from smbpasswd file
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{
				"available": false,
				"users":     []string{},
				"message":   "Samba tools not available",
			})
			return
		}

		// List Samba users
		output, err := exec.Command("pdbedit", "-L", "-w").CombinedOutput()
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{
				"available": true,
				"users":     []string{},
				"message":   "No Samba users configured",
			})
			return
		}

		var users []string
		scanner := bufio.NewScanner(strings.NewReader(string(output)))
		for scanner.Scan() {
			line := scanner.Text()
			// Format: username:uid:LM hash:NT hash:flags:pw last set
			parts := strings.Split(line, ":")
			if len(parts) > 0 && parts[0] != "" {
				users = append(users, parts[0])
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"available": true,
			"users":     users,
			"message":   fmt.Sprintf("%d Samba users configured", len(users)),
		})
	}
}
