package handlers

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
)

// StreamEvent represents a server-sent event
type StreamEvent struct {
	Type    string `json:"type"`    // "output", "error", "complete"
	Message string `json:"message"`
	Success bool   `json:"success,omitempty"`
}

// sendSSE sends a server-sent event
func sendSSE(w http.ResponseWriter, event StreamEvent) {
	data, _ := json.Marshal(event)
	fmt.Fprintf(w, "data: %s\n\n", data)
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}
}

// isSecureBootEnabled checks if Secure Boot is enabled
func isSecureBootEnabled() bool {
	// Check using mokutil first (most reliable)
	if output, err := exec.Command("mokutil", "--sb-state").Output(); err == nil {
		return strings.Contains(string(output), "SecureBoot enabled")
	}

	// Fallback: check EFI variable directly
	matches, err := filepath.Glob("/sys/firmware/efi/efivars/SecureBoot-*")
	if err != nil || len(matches) == 0 {
		return false // No EFI or no SecureBoot variable
	}

	for _, match := range matches {
		data, err := os.ReadFile(match)
		if err == nil && len(data) >= 5 {
			// The last byte indicates the status (1 = enabled)
			if data[len(data)-1] == 1 {
				return true
			}
		}
	}
	return false
}

// streamCommand runs a command and streams its output
func streamCommand(w http.ResponseWriter, cmdArgs []string) error {
	sendSSE(w, StreamEvent{Type: "output", Message: fmt.Sprintf("$ %s", strings.Join(cmdArgs, " "))})

	cmd := exec.Command(cmdArgs[0], cmdArgs[1:]...)

	// Get stdout and stderr pipes
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return err
	}

	// Start the command
	if err := cmd.Start(); err != nil {
		return err
	}

	// Use WaitGroup to ensure we read all output before returning
	var wg sync.WaitGroup
	wg.Add(2)

	// Stream stdout
	go func() {
		defer wg.Done()
		reader := bufio.NewReader(stdout)
		for {
			line, err := reader.ReadString('\n')
			if err != nil {
				if err != io.EOF {
					sendSSE(w, StreamEvent{Type: "error", Message: err.Error()})
				}
				break
			}
			sendSSE(w, StreamEvent{Type: "output", Message: strings.TrimRight(line, "\n")})
		}
	}()

	// Stream stderr
	go func() {
		defer wg.Done()
		reader := bufio.NewReader(stderr)
		for {
			line, err := reader.ReadString('\n')
			if err != nil {
				if err != io.EOF {
					// Don't send EOF as error
				}
				break
			}
			sendSSE(w, StreamEvent{Type: "output", Message: strings.TrimRight(line, "\n")})
		}
	}()

	// Wait for all output to be read
	wg.Wait()

	// Then wait for command to finish
	err = cmd.Wait()
	return err
}

// InstallZFSStream installs ZFS with streaming output
func InstallZFSStream() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Set headers for SSE
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("Access-Control-Allow-Origin", "*")

		// Check for Secure Boot
		if isSecureBootEnabled() {
			sendSSE(w, StreamEvent{Type: "error", Message: "⚠️  WARNING: Secure Boot is ENABLED"})
			sendSSE(w, StreamEvent{Type: "error", Message: "ZFS kernel modules cannot be loaded with Secure Boot enabled."})
			sendSSE(w, StreamEvent{Type: "error", Message: "Please disable Secure Boot in your UEFI/BIOS settings and try again."})
			sendSSE(w, StreamEvent{Type: "output", Message: ""})
			sendSSE(w, StreamEvent{Type: "output", Message: "Continuing installation anyway (module will fail to load)..."})
			sendSSE(w, StreamEvent{Type: "output", Message: ""})
		}

		pm := detectPackageManager()
		if pm == "" {
			sendSSE(w, StreamEvent{Type: "error", Message: "No supported package manager found"})
			sendSSE(w, StreamEvent{Type: "complete", Success: false, Message: "Installation failed"})
			return
		}

		var commands [][]string

		switch pm {
		case "dnf", "yum":
			elVersion := detectELVersion()
			sendSSE(w, StreamEvent{Type: "output", Message: fmt.Sprintf("Detected EL version: %s", elVersion)})
			sendSSE(w, StreamEvent{Type: "output", Message: fmt.Sprintf("Using package manager: %s", pm)})

			// EL10 doesn't have an official zfs-release package yet
			if elVersion == "10" {
				sendSSE(w, StreamEvent{Type: "output", Message: "EL10 detected - ZFS repo must be manually configured or use --nogpgcheck"})
				commands = [][]string{
					{"sudo", pm, "install", "-y", "epel-release"},
					{"sudo", pm, "install", "-y", "kernel-devel"},
					{"sudo", pm, "install", "-y", "--nogpgcheck", "zfs"},
				}
			} else {
				var zfsRepoURL string
				switch elVersion {
				case "9":
					zfsRepoURL = "https://zfsonlinux.org/epel/zfs-release-2-3.el9.noarch.rpm"
				case "8":
					zfsRepoURL = "https://zfsonlinux.org/epel/zfs-release-2-3.el8.noarch.rpm"
				case "7":
					zfsRepoURL = "https://zfsonlinux.org/epel/zfs-release-2-3.el7.noarch.rpm"
				default:
					zfsRepoURL = "https://zfsonlinux.org/epel/zfs-release-2-3.el9.noarch.rpm"
				}

				commands = [][]string{
					{"sudo", pm, "install", "-y", "epel-release"},
					{"sudo", pm, "install", "-y", zfsRepoURL},
					{"sudo", pm, "install", "-y", "kernel-devel"},
					{"sudo", pm, "install", "-y", "zfs"},
				}
			}

		case "apt":
			sendSSE(w, StreamEvent{Type: "output", Message: "Detected Debian/Ubuntu system"})
			commands = [][]string{
				{"sudo", "apt", "update"},
				{"sudo", "apt", "install", "-y", "zfsutils-linux", "zfs-dkms"},
			}

		default:
			sendSSE(w, StreamEvent{Type: "error", Message: "Unsupported package manager"})
			sendSSE(w, StreamEvent{Type: "complete", Success: false, Message: "Installation failed"})
			return
		}

		// Run each command
		var lastError error
		for i, cmdArgs := range commands {
			sendSSE(w, StreamEvent{Type: "output", Message: fmt.Sprintf("\n=== Step %d/%d ===", i+1, len(commands))})
			if err := streamCommand(w, cmdArgs); err != nil {
				lastError = err
				sendSSE(w, StreamEvent{Type: "error", Message: fmt.Sprintf("Command failed: %s", err.Error())})
				// Continue with other commands
			}
		}

		// Build DKMS module if needed (for systems using zfs-dkms)
		sendSSE(w, StreamEvent{Type: "output", Message: "\n=== Building ZFS DKMS module ==="})
		if err := streamCommand(w, []string{"sudo", "dkms", "autoinstall"}); err != nil {
			sendSSE(w, StreamEvent{Type: "output", Message: "DKMS autoinstall completed (some warnings may be expected)"})
		}

		// Try to load kernel module
		sendSSE(w, StreamEvent{Type: "output", Message: "\n=== Loading ZFS kernel module ==="})
		if err := streamCommand(w, []string{"sudo", "modprobe", "zfs"}); err != nil {
			sendSSE(w, StreamEvent{Type: "error", Message: fmt.Sprintf("Failed to load module: %s", err.Error())})
		}

		// Check if ZFS is available
		_, zpoolErr := exec.LookPath("zpool")
		zpoolFound := zpoolErr == nil

		// Check if ZFS module is loaded
		moduleLoaded := false
		if output, err := exec.Command("lsmod").Output(); err == nil {
			moduleLoaded = strings.Contains(string(output), "zfs")
		}

		if zpoolFound && moduleLoaded {
			sendSSE(w, StreamEvent{Type: "output", Message: "\n✓ ZFS installed and module loaded successfully!"})
			sendSSE(w, StreamEvent{Type: "complete", Success: true, Message: "ZFS installation completed successfully"})
		} else if zpoolFound && !moduleLoaded {
			if isSecureBootEnabled() {
				sendSSE(w, StreamEvent{Type: "error", Message: "\n✗ ZFS installed but module failed to load (Secure Boot is enabled)"})
				sendSSE(w, StreamEvent{Type: "complete", Success: false, Message: "Disable Secure Boot and reboot to use ZFS"})
			} else {
				sendSSE(w, StreamEvent{Type: "error", Message: "\n✗ ZFS installed but module failed to load"})
				sendSSE(w, StreamEvent{Type: "complete", Success: false, Message: "ZFS module failed to load - check dmesg for errors"})
			}
		} else if lastError != nil {
			sendSSE(w, StreamEvent{Type: "complete", Success: false, Message: fmt.Sprintf("Installation failed: %s", lastError.Error())})
		} else {
			sendSSE(w, StreamEvent{Type: "complete", Success: false, Message: "Installation completed but zpool command not found"})
		}
	}
}

// InstallSharingServiceStream installs SMB or NFS with streaming output
func InstallSharingServiceStream() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		service := r.URL.Query().Get("service")
		if service != "smb" && service != "nfs" {
			http.Error(w, "Invalid service. Use 'smb' or 'nfs'", http.StatusBadRequest)
			return
		}

		// Set headers for SSE
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("Access-Control-Allow-Origin", "*")

		pm := detectPackageManager()
		if pm == "" {
			sendSSE(w, StreamEvent{Type: "error", Message: "No supported package manager found"})
			sendSSE(w, StreamEvent{Type: "complete", Success: false, Message: "Installation failed"})
			return
		}

		var commands [][]string
		var serviceName string

		switch service {
		case "smb":
			serviceName = "Samba (SMB)"
			switch pm {
			case "dnf", "yum":
				commands = [][]string{
					{"sudo", pm, "install", "-y", "samba", "samba-client"},
				}
			case "apt":
				commands = [][]string{
					{"sudo", "apt", "update"},
					{"sudo", "apt", "install", "-y", "samba", "samba-client"},
				}
			}
		case "nfs":
			serviceName = "NFS"
			switch pm {
			case "dnf", "yum":
				commands = [][]string{
					{"sudo", pm, "install", "-y", "nfs-utils"},
				}
			case "apt":
				commands = [][]string{
					{"sudo", "apt", "update"},
					{"sudo", "apt", "install", "-y", "nfs-kernel-server", "nfs-common"},
				}
			}
		}

		sendSSE(w, StreamEvent{Type: "output", Message: fmt.Sprintf("Installing %s...", serviceName)})
		sendSSE(w, StreamEvent{Type: "output", Message: fmt.Sprintf("Using package manager: %s", pm)})

		// Run each command
		var lastError error
		for i, cmdArgs := range commands {
			sendSSE(w, StreamEvent{Type: "output", Message: fmt.Sprintf("\n=== Step %d/%d ===", i+1, len(commands))})
			if err := streamCommand(w, cmdArgs); err != nil {
				lastError = err
				sendSSE(w, StreamEvent{Type: "error", Message: fmt.Sprintf("Command failed: %s", err.Error())})
			}
		}

		// Enable and start the service
		var svcNames []string
		switch service {
		case "smb":
			svcNames = []string{"smb", "nmb"}
		case "nfs":
			switch pm {
			case "dnf", "yum":
				svcNames = []string{"nfs-server"}
			case "apt":
				svcNames = []string{"nfs-kernel-server"}
			}
		}

		for _, svc := range svcNames {
			sendSSE(w, StreamEvent{Type: "output", Message: fmt.Sprintf("\n=== Enabling %s service ===", svc)})
			if err := streamCommand(w, []string{"sudo", "systemctl", "enable", "--now", svc}); err != nil {
				sendSSE(w, StreamEvent{Type: "error", Message: fmt.Sprintf("Failed to enable %s: %s", svc, err.Error())})
			}
		}

		if lastError != nil {
			sendSSE(w, StreamEvent{Type: "complete", Success: false, Message: fmt.Sprintf("Installation failed: %s", lastError.Error())})
		} else {
			sendSSE(w, StreamEvent{Type: "output", Message: fmt.Sprintf("\n✓ %s installed successfully!", serviceName)})
			sendSSE(w, StreamEvent{Type: "complete", Success: true, Message: fmt.Sprintf("%s installation completed successfully", serviceName)})
		}
	}
}
