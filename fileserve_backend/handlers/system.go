package handlers

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"

	"fileserv/models"
)

// Service name validation regex - only alphanumeric, dashes, underscores, and @
// systemd service names follow a specific pattern
var serviceNameRegex = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_@.-]*$`)

// validateServiceName validates a systemd service name
func validateServiceName(name string) error {
	if name == "" {
		return fmt.Errorf("service name is required")
	}

	// Max length check
	if len(name) > 256 {
		return fmt.Errorf("service name too long")
	}

	// Check for path traversal
	if strings.Contains(name, "/") || strings.Contains(name, "..") {
		return fmt.Errorf("invalid service name: path traversal not allowed")
	}

	// Check regex pattern
	if !serviceNameRegex.MatchString(name) {
		return fmt.Errorf("invalid service name: must contain only alphanumeric characters, dashes, underscores, dots, and @")
	}

	// Prevent special system services
	blockedPrefixes := []string{"init", "rescue", "emergency"}
	lowerName := strings.ToLower(name)
	for _, prefix := range blockedPrefixes {
		if strings.HasPrefix(lowerName, prefix) {
			return fmt.Errorf("access to system service '%s' is restricted", name)
		}
	}

	return nil
}

// Valid dmesg log levels
var validDmesgLevels = map[string]bool{
	"emerg": true, "alert": true, "crit": true, "err": true,
	"warn": true, "notice": true, "info": true, "debug": true,
}

// Valid dmesg facilities
var validDmesgFacilities = map[string]bool{
	"kern": true, "user": true, "mail": true, "daemon": true,
	"auth": true, "syslog": true, "lpr": true, "news": true,
}

// validateDmesgLevel validates a dmesg log level
func validateDmesgLevel(level string) error {
	if level == "" {
		return nil // Empty is allowed
	}

	// Allow comma-separated levels
	for _, l := range strings.Split(level, ",") {
		l = strings.TrimSpace(l)
		if l != "" && !validDmesgLevels[l] {
			return fmt.Errorf("invalid dmesg level: %s", l)
		}
	}
	return nil
}

// validateDmesgFacility validates a dmesg facility
func validateDmesgFacility(facility string) error {
	if facility == "" {
		return nil // Empty is allowed
	}

	// Allow comma-separated facilities
	for _, f := range strings.Split(facility, ",") {
		f = strings.TrimSpace(f)
		if f != "" && !validDmesgFacilities[f] {
			return fmt.Errorf("invalid dmesg facility: %s", f)
		}
	}
	return nil
}

// Unit name regex - systemd unit names have a specific format
var journalUnitRegex = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_@.-]*\.(service|socket|target|mount|automount|swap|timer|path|slice|scope)$`)

// validateJournalUnit validates a journalctl unit name
func validateJournalUnit(unit string) error {
	if unit == "" {
		return nil // Empty is allowed
	}

	// Max length check
	if len(unit) > 256 {
		return fmt.Errorf("unit name too long")
	}

	// Check for path traversal
	if strings.Contains(unit, "/") || strings.Contains(unit, "..") {
		return fmt.Errorf("invalid unit name: path characters not allowed")
	}

	// Validate format (or allow simple service name without extension)
	if !journalUnitRegex.MatchString(unit) {
		// Allow simple name without extension (will be treated as .service)
		if matched, _ := regexp.MatchString(`^[a-zA-Z0-9][a-zA-Z0-9_@.-]*$`, unit); !matched {
			return fmt.Errorf("invalid unit name format")
		}
	}

	return nil
}

// Valid journalctl priorities (0-7 or names)
var validJournalPriorities = map[string]bool{
	"0": true, "1": true, "2": true, "3": true, "4": true, "5": true, "6": true, "7": true,
	"emerg": true, "alert": true, "crit": true, "err": true,
	"warning": true, "notice": true, "info": true, "debug": true,
}

// validateJournalPriority validates a journalctl priority
func validateJournalPriority(priority string) error {
	if priority == "" {
		return nil
	}

	if !validJournalPriorities[priority] {
		return fmt.Errorf("invalid priority: must be 0-7 or emerg/alert/crit/err/warning/notice/info/debug")
	}
	return nil
}

// validateJournalLines validates the lines parameter
func validateJournalLines(lines string) error {
	if lines == "" {
		return nil
	}

	n, err := strconv.Atoi(lines)
	if err != nil {
		return fmt.Errorf("lines must be a number")
	}

	if n < 1 || n > 10000 {
		return fmt.Errorf("lines must be between 1 and 10000")
	}

	return nil
}

// GetSystemResources returns system resource information
func GetSystemResources() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		resources := models.SystemResources{
			CPUCores:     runtime.NumCPU(),
			Architecture: runtime.GOARCH,
		}

		// Get hostname
		hostname, _ := os.Hostname()
		resources.Hostname = hostname

		// Get CPU model
		cpuInfo, _ := os.ReadFile("/proc/cpuinfo")
		if match := regexp.MustCompile(`model name\s*:\s*(.+)`).FindSubmatch(cpuInfo); len(match) > 1 {
			resources.CPUModel = strings.TrimSpace(string(match[1]))
		}

		// Get CPU usage from /proc/stat
		resources.CPUUsage = getCPUUsage()

		// Get memory info from /proc/meminfo
		memInfo, _ := os.ReadFile("/proc/meminfo")
		scanner := bufio.NewScanner(strings.NewReader(string(memInfo)))
		for scanner.Scan() {
			line := scanner.Text()
			if strings.HasPrefix(line, "MemTotal:") {
				fields := strings.Fields(line)
				if len(fields) >= 2 {
					val, _ := strconv.ParseUint(fields[1], 10, 64)
					resources.MemoryTotal = val * 1024 // Convert from KB to bytes
				}
			} else if strings.HasPrefix(line, "MemFree:") {
				fields := strings.Fields(line)
				if len(fields) >= 2 {
					val, _ := strconv.ParseUint(fields[1], 10, 64)
					resources.MemoryFree = val * 1024
				}
			} else if strings.HasPrefix(line, "MemAvailable:") {
				fields := strings.Fields(line)
				if len(fields) >= 2 {
					val, _ := strconv.ParseUint(fields[1], 10, 64)
					resources.MemoryFree = val * 1024 // Use available instead of free
				}
			} else if strings.HasPrefix(line, "SwapTotal:") {
				fields := strings.Fields(line)
				if len(fields) >= 2 {
					val, _ := strconv.ParseUint(fields[1], 10, 64)
					resources.SwapTotal = val * 1024
				}
			} else if strings.HasPrefix(line, "SwapFree:") {
				fields := strings.Fields(line)
				if len(fields) >= 2 {
					val, _ := strconv.ParseUint(fields[1], 10, 64)
					resources.SwapUsed = resources.SwapTotal - (val * 1024)
				}
			}
		}

		resources.MemoryUsed = resources.MemoryTotal - resources.MemoryFree
		if resources.MemoryTotal > 0 {
			resources.MemoryPercent = float64(resources.MemoryUsed) / float64(resources.MemoryTotal) * 100
		}
		if resources.SwapTotal > 0 {
			resources.SwapPercent = float64(resources.SwapUsed) / float64(resources.SwapTotal) * 100
		}

		// Get uptime
		uptimeData, _ := os.ReadFile("/proc/uptime")
		fields := strings.Fields(string(uptimeData))
		if len(fields) >= 1 {
			uptime, _ := strconv.ParseFloat(fields[0], 64)
			resources.Uptime = int64(uptime)
			resources.UptimeHuman = formatUptime(int64(uptime))
		}

		// Get load average
		loadavgData, _ := os.ReadFile("/proc/loadavg")
		fields = strings.Fields(string(loadavgData))
		if len(fields) >= 3 {
			resources.LoadAvg1, _ = strconv.ParseFloat(fields[0], 64)
			resources.LoadAvg5, _ = strconv.ParseFloat(fields[1], 64)
			resources.LoadAvg15, _ = strconv.ParseFloat(fields[2], 64)
		}

		// Get kernel version
		kernelData, _ := os.ReadFile("/proc/version")
		if match := regexp.MustCompile(`Linux version (\S+)`).FindSubmatch(kernelData); len(match) > 1 {
			resources.KernelVersion = string(match[1])
		}

		// Get OS release
		osReleaseData, _ := os.ReadFile("/etc/os-release")
		if match := regexp.MustCompile(`PRETTY_NAME="(.+)"`).FindSubmatch(osReleaseData); len(match) > 1 {
			resources.OSRelease = string(match[1])
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resources)
	}
}

func getCPUUsage() float64 {
	// Read first sample
	stat1, _ := os.ReadFile("/proc/stat")
	time.Sleep(100 * time.Millisecond)
	stat2, _ := os.ReadFile("/proc/stat")

	parse := func(data []byte) (idle, total uint64) {
		scanner := bufio.NewScanner(strings.NewReader(string(data)))
		for scanner.Scan() {
			line := scanner.Text()
			if strings.HasPrefix(line, "cpu ") {
				fields := strings.Fields(line)
				if len(fields) >= 8 {
					var vals []uint64
					for _, f := range fields[1:] {
						v, _ := strconv.ParseUint(f, 10, 64)
						vals = append(vals, v)
						total += v
					}
					if len(vals) >= 4 {
						idle = vals[3] // idle is 4th field
					}
				}
				break
			}
		}
		return
	}

	idle1, total1 := parse(stat1)
	idle2, total2 := parse(stat2)

	idleDelta := float64(idle2 - idle1)
	totalDelta := float64(total2 - total1)

	if totalDelta == 0 {
		return 0
	}

	return (1 - idleDelta/totalDelta) * 100
}

func formatUptime(seconds int64) string {
	days := seconds / 86400
	hours := (seconds % 86400) / 3600
	minutes := (seconds % 3600) / 60

	if days > 0 {
		return fmt.Sprintf("%dd %dh %dm", days, hours, minutes)
	}
	if hours > 0 {
		return fmt.Sprintf("%dh %dm", hours, minutes)
	}
	return fmt.Sprintf("%dm", minutes)
}

// GetServices returns status of system services
func GetServices() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		filter := r.URL.Query().Get("filter") // storage, network, all

		services := []string{}

		switch filter {
		case "storage":
			services = []string{
				"smbd", "nmbd", "nfs-server", "nfs-mountd", "nfs-idmapd",
				"iscsid", "iscsi", "multipathd", "lvm2-monitor", "mdmonitor",
				"zfs-import", "zfs-mount", "zfs-share",
			}
		case "network":
			services = []string{
				"sshd", "NetworkManager", "systemd-networkd", "firewalld",
				"iptables", "nftables", "named", "dnsmasq",
			}
		default:
			// Get all loaded services
			output, err := execCommand("systemctl", "list-units", "--type=service", "--all", "--no-pager", "--plain", "--no-legend")
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			scanner := bufio.NewScanner(strings.NewReader(output))
			for scanner.Scan() {
				fields := strings.Fields(scanner.Text())
				if len(fields) >= 1 {
					name := strings.TrimSuffix(fields[0], ".service")
					services = append(services, name)
				}
			}
		}

		var serviceInfos []models.ServiceInfo

		for _, svc := range services {
			info := getServiceInfo(svc)
			if info.Status != "" || filter != "all" {
				serviceInfos = append(serviceInfos, info)
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(serviceInfos)
	}
}

func getServiceInfo(name string) models.ServiceInfo {
	info := models.ServiceInfo{
		Name: name,
	}

	// Get service status
	output, err := execCommand("systemctl", "show", name+".service",
		"--property=LoadState,ActiveState,SubState,Description,MainPID,MemoryCurrent")
	if err != nil {
		return info
	}

	for _, line := range strings.Split(output, "\n") {
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}
		key, val := parts[0], parts[1]

		switch key {
		case "LoadState":
			if val == "not-found" {
				return info
			}
		case "ActiveState":
			info.ActiveState = val
			switch val {
			case "active":
				info.Status = "running"
			case "inactive":
				info.Status = "stopped"
			case "failed":
				info.Status = "failed"
			default:
				info.Status = val
			}
		case "SubState":
			info.SubState = val
		case "Description":
			info.Description = val
			info.DisplayName = val
		case "MainPID":
			info.MainPID, _ = strconv.Atoi(val)
		case "MemoryCurrent":
			if val != "[not set]" {
				info.MemoryUsage, _ = strconv.ParseUint(val, 10, 64)
			}
		}
	}

	// Check if enabled
	output, _ = execCommand("systemctl", "is-enabled", name+".service")
	info.Enabled = strings.TrimSpace(output) == "enabled"

	return info
}

// ControlService starts/stops/restarts a service
func ControlService() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Service string `json:"service"`
			Action  string `json:"action"` // start, stop, restart, enable, disable
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
			"reload":  true,
		}

		if !validActions[req.Action] {
			http.Error(w, "Invalid action", http.StatusBadRequest)
			return
		}

		// Validate service name using comprehensive validation
		if err := validateServiceName(req.Service); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		cmd := exec.Command("systemctl", req.Action, req.Service+".service")
		output, err := cmd.CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to %s service: %s", req.Action, string(output)), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{
			"message": fmt.Sprintf("Service %s %sed successfully", req.Service, req.Action),
		})
	}
}

// GetNetworkInterfaces returns network interface information
func GetNetworkInterfaces() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		interfaces, err := getNetworkInterfaces()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(interfaces)
	}
}

func getNetworkInterfaces() ([]models.NetworkInterface, error) {
	// Use ip command to get interface info
	output, err := execCommand("ip", "-j", "addr")
	if err != nil {
		return nil, err
	}

	var ipOutput []struct {
		IfIndex   int    `json:"ifindex"`
		IfName    string `json:"ifname"`
		Flags     []string `json:"flags"`
		Mtu       int    `json:"mtu"`
		OperState string `json:"operstate"`
		Address   string `json:"address"`
		AddrInfo  []struct {
			Family    string `json:"family"`
			Local     string `json:"local"`
			PrefixLen int    `json:"prefixlen"`
		} `json:"addr_info"`
	}

	if err := json.Unmarshal([]byte(output), &ipOutput); err != nil {
		return nil, err
	}

	var interfaces []models.NetworkInterface

	for _, iface := range ipOutput {
		// Skip loopback
		if iface.IfName == "lo" {
			continue
		}

		netIface := models.NetworkInterface{
			Name:      iface.IfName,
			MAC:       iface.Address,
			MTU:       iface.Mtu,
			State:     iface.OperState,
			IPv4Addrs: []string{},
			IPv6Addrs: []string{},
		}

		for _, addr := range iface.AddrInfo {
			addrStr := fmt.Sprintf("%s/%d", addr.Local, addr.PrefixLen)
			if addr.Family == "inet" {
				netIface.IPv4Addrs = append(netIface.IPv4Addrs, addrStr)
			} else if addr.Family == "inet6" {
				netIface.IPv6Addrs = append(netIface.IPv6Addrs, addrStr)
			}
		}

		// Get speed and duplex
		ethtoolOutput, err := execCommand("ethtool", iface.IfName)
		if err == nil {
			if match := regexp.MustCompile(`Speed: (\S+)`).FindStringSubmatch(ethtoolOutput); len(match) > 1 {
				netIface.Speed = match[1]
			}
			if match := regexp.MustCompile(`Duplex: (\S+)`).FindStringSubmatch(ethtoolOutput); len(match) > 1 {
				netIface.Duplex = match[1]
			}
		}

		// Get statistics from /sys/class/net
		statsPath := fmt.Sprintf("/sys/class/net/%s/statistics", iface.IfName)
		if rxBytes, err := os.ReadFile(statsPath + "/rx_bytes"); err == nil {
			netIface.RxBytes, _ = strconv.ParseUint(strings.TrimSpace(string(rxBytes)), 10, 64)
			netIface.RxHuman = formatBytes(netIface.RxBytes)
		}
		if txBytes, err := os.ReadFile(statsPath + "/tx_bytes"); err == nil {
			netIface.TxBytes, _ = strconv.ParseUint(strings.TrimSpace(string(txBytes)), 10, 64)
			netIface.TxHuman = formatBytes(netIface.TxBytes)
		}
		if rxPackets, err := os.ReadFile(statsPath + "/rx_packets"); err == nil {
			netIface.RxPackets, _ = strconv.ParseUint(strings.TrimSpace(string(rxPackets)), 10, 64)
		}
		if txPackets, err := os.ReadFile(statsPath + "/tx_packets"); err == nil {
			netIface.TxPackets, _ = strconv.ParseUint(strings.TrimSpace(string(txPackets)), 10, 64)
		}
		if rxErrors, err := os.ReadFile(statsPath + "/rx_errors"); err == nil {
			netIface.RxErrors, _ = strconv.ParseUint(strings.TrimSpace(string(rxErrors)), 10, 64)
		}
		if txErrors, err := os.ReadFile(statsPath + "/tx_errors"); err == nil {
			netIface.TxErrors, _ = strconv.ParseUint(strings.TrimSpace(string(txErrors)), 10, 64)
		}

		interfaces = append(interfaces, netIface)
	}

	return interfaces, nil
}

// GetProcesses returns process list
func GetProcesses() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		sort := r.URL.Query().Get("sort")
		if sort == "" {
			sort = "cpu"
		}

		limit := r.URL.Query().Get("limit")
		if limit == "" {
			limit = "50"
		}

		// Use ps to get process list
		var output string
		var err error

		switch sort {
		case "cpu":
			output, err = execCommand("ps", "aux", "--sort=-%cpu")
		case "memory":
			output, err = execCommand("ps", "aux", "--sort=-%mem")
		default:
			output, err = execCommand("ps", "aux", "--sort=-%cpu")
		}

		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		var processes []models.Process
		scanner := bufio.NewScanner(strings.NewReader(output))

		// Skip header
		scanner.Scan()

		limitNum, _ := strconv.Atoi(limit)
		count := 0

		for scanner.Scan() && count < limitNum {
			fields := strings.Fields(scanner.Text())
			if len(fields) < 11 {
				continue
			}

			pid, _ := strconv.Atoi(fields[1])
			cpu, _ := strconv.ParseFloat(fields[2], 64)
			memory, _ := strconv.ParseFloat(fields[3], 64)
			vsz, _ := strconv.ParseUint(fields[4], 10, 64)
			rss, _ := strconv.ParseUint(fields[5], 10, 64)

			process := models.Process{
				PID:     pid,
				User:    fields[0],
				CPU:     cpu,
				Memory:  memory,
				VSZ:     vsz * 1024, // Convert KB to bytes
				RSS:     rss * 1024,
				State:   fields[7],
				Started: fields[8],
				Command: strings.Join(fields[10:], " "),
			}

			processes = append(processes, process)
			count++
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(processes)
	}
}

// KillProcess kills a process
func KillProcess() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			PID    int    `json:"pid"`
			Signal string `json:"signal"` // TERM, KILL, HUP, etc.
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		if req.PID <= 0 {
			http.Error(w, "Invalid PID", http.StatusBadRequest)
			return
		}

		signal := "TERM"
		if req.Signal != "" {
			signal = strings.ToUpper(req.Signal)
		}

		// Validate signal
		validSignals := map[string]bool{
			"TERM": true, "KILL": true, "HUP": true,
			"INT": true, "QUIT": true, "STOP": true, "CONT": true,
		}

		if !validSignals[signal] {
			http.Error(w, "Invalid signal", http.StatusBadRequest)
			return
		}

		cmd := exec.Command("kill", "-"+signal, strconv.Itoa(req.PID))
		output, err := cmd.CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to kill process: %s", string(output)), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"message": "Signal sent successfully"})
	}
}

// GetSystemLogs returns system logs
func GetSystemLogs() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		unit := r.URL.Query().Get("unit")
		lines := r.URL.Query().Get("lines")
		priority := r.URL.Query().Get("priority")

		// Validate unit parameter
		if err := validateJournalUnit(unit); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		// Validate lines parameter
		if err := validateJournalLines(lines); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		// Validate priority parameter
		if err := validateJournalPriority(priority); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		if lines == "" {
			lines = "100"
		}

		args := []string{"--no-pager", "-n", lines}

		if unit != "" {
			args = append(args, "-u", unit)
		}

		if priority != "" {
			args = append(args, "-p", priority)
		}

		// Get JSON output
		args = append(args, "-o", "json")

		output, err := execCommand("journalctl", args...)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// Parse journal entries
		type LogEntry struct {
			Timestamp   string `json:"timestamp"`
			Priority    int    `json:"priority"`
			Unit        string `json:"unit"`
			Message     string `json:"message"`
			Hostname    string `json:"hostname"`
		}

		var entries []LogEntry
		scanner := bufio.NewScanner(strings.NewReader(output))
		for scanner.Scan() {
			var raw map[string]interface{}
			if err := json.Unmarshal(scanner.Bytes(), &raw); err != nil {
				continue
			}

			entry := LogEntry{}

			if ts, ok := raw["__REALTIME_TIMESTAMP"].(string); ok {
				usec, _ := strconv.ParseInt(ts, 10, 64)
				t := time.Unix(0, usec*1000)
				entry.Timestamp = t.Format(time.RFC3339)
			}

			if pri, ok := raw["PRIORITY"].(string); ok {
				entry.Priority, _ = strconv.Atoi(pri)
			}

			if unit, ok := raw["_SYSTEMD_UNIT"].(string); ok {
				entry.Unit = unit
			}

			if msg, ok := raw["MESSAGE"].(string); ok {
				entry.Message = msg
			}

			if host, ok := raw["_HOSTNAME"].(string); ok {
				entry.Hostname = host
			}

			entries = append(entries, entry)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(entries)
	}
}

// GetDMESGLogs returns kernel ring buffer messages
func GetDMESGLogs() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		level := r.URL.Query().Get("level")
		facility := r.URL.Query().Get("facility")

		// Validate level parameter
		if err := validateDmesgLevel(level); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		// Validate facility parameter
		if err := validateDmesgFacility(facility); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		args := []string{"--time-format=iso", "-T"}

		if level != "" {
			args = append(args, "--level="+level)
		}
		if facility != "" {
			args = append(args, "--facility="+facility)
		}

		output, err := execCommand("dmesg", args...)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		type DMesgEntry struct {
			Timestamp string `json:"timestamp"`
			Level     string `json:"level"`
			Facility  string `json:"facility"`
			Message   string `json:"message"`
		}

		var entries []DMesgEntry
		scanner := bufio.NewScanner(strings.NewReader(output))
		for scanner.Scan() {
			line := scanner.Text()
			// Parse ISO timestamp format: [2024-01-15T10:30:00,000000+0000] message
			if match := regexp.MustCompile(`^\[([^\]]+)\]\s*(.+)`).FindStringSubmatch(line); len(match) > 2 {
				entries = append(entries, DMesgEntry{
					Timestamp: match[1],
					Message:   match[2],
				})
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(entries)
	}
}

// PowerControl handles system power operations
func PowerControl() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Action string `json:"action"` // reboot, poweroff, suspend, hibernate
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		var cmd *exec.Cmd
		switch req.Action {
		case "reboot":
			cmd = exec.Command("systemctl", "reboot")
		case "poweroff":
			cmd = exec.Command("systemctl", "poweroff")
		case "suspend":
			cmd = exec.Command("systemctl", "suspend")
		case "hibernate":
			cmd = exec.Command("systemctl", "hibernate")
		default:
			http.Error(w, "Invalid action", http.StatusBadRequest)
			return
		}

		output, err := cmd.CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to %s: %s", req.Action, string(output)), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"message": fmt.Sprintf("System %s initiated", req.Action)})
	}
}

// GetHardwareInfo returns detailed hardware information
func GetHardwareInfo() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		type HardwareInfo struct {
			CPU struct {
				Model       string `json:"model"`
				Vendor      string `json:"vendor"`
				Cores       int    `json:"cores"`
				Threads     int    `json:"threads"`
				MaxSpeed    string `json:"max_speed"`
				CurrentSpeed string `json:"current_speed"`
				Cache       string `json:"cache"`
				Architecture string `json:"architecture"`
			} `json:"cpu"`
			Memory struct {
				Total     uint64 `json:"total"`
				TotalHuman string `json:"total_human"`
				Type      string `json:"type"`
				Speed     string `json:"speed"`
				Slots     int    `json:"slots"`
				UsedSlots int    `json:"used_slots"`
			} `json:"memory"`
			System struct {
				Manufacturer string `json:"manufacturer"`
				ProductName  string `json:"product_name"`
				Version      string `json:"version"`
				Serial       string `json:"serial"`
				UUID         string `json:"uuid"`
			} `json:"system"`
			BIOS struct {
				Vendor  string `json:"vendor"`
				Version string `json:"version"`
				Date    string `json:"date"`
			} `json:"bios"`
		}

		info := HardwareInfo{}

		// CPU info from /proc/cpuinfo
		cpuInfo, _ := os.ReadFile("/proc/cpuinfo")
		cpuStr := string(cpuInfo)

		if match := regexp.MustCompile(`model name\s*:\s*(.+)`).FindStringSubmatch(cpuStr); len(match) > 1 {
			info.CPU.Model = strings.TrimSpace(match[1])
		}
		if match := regexp.MustCompile(`vendor_id\s*:\s*(.+)`).FindStringSubmatch(cpuStr); len(match) > 1 {
			info.CPU.Vendor = strings.TrimSpace(match[1])
		}
		if match := regexp.MustCompile(`cpu cores\s*:\s*(\d+)`).FindStringSubmatch(cpuStr); len(match) > 1 {
			info.CPU.Cores, _ = strconv.Atoi(match[1])
		}
		if match := regexp.MustCompile(`cache size\s*:\s*(.+)`).FindStringSubmatch(cpuStr); len(match) > 1 {
			info.CPU.Cache = strings.TrimSpace(match[1])
		}

		info.CPU.Threads = runtime.NumCPU()
		info.CPU.Architecture = runtime.GOARCH

		// Get CPU frequency
		if freqData, err := os.ReadFile("/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq"); err == nil {
			freq, _ := strconv.ParseInt(strings.TrimSpace(string(freqData)), 10, 64)
			info.CPU.CurrentSpeed = fmt.Sprintf("%.2f GHz", float64(freq)/1000000)
		}
		if freqData, err := os.ReadFile("/sys/devices/system/cpu/cpu0/cpufreq/scaling_max_freq"); err == nil {
			freq, _ := strconv.ParseInt(strings.TrimSpace(string(freqData)), 10, 64)
			info.CPU.MaxSpeed = fmt.Sprintf("%.2f GHz", float64(freq)/1000000)
		}

		// Memory from /proc/meminfo
		memInfo, _ := os.ReadFile("/proc/meminfo")
		if match := regexp.MustCompile(`MemTotal:\s+(\d+)`).FindStringSubmatch(string(memInfo)); len(match) > 1 {
			kb, _ := strconv.ParseUint(match[1], 10, 64)
			info.Memory.Total = kb * 1024
			info.Memory.TotalHuman = formatBytes(info.Memory.Total)
		}

		// Try to get system info from DMI (requires root)
		if dmiData, err := os.ReadFile("/sys/class/dmi/id/sys_vendor"); err == nil {
			info.System.Manufacturer = strings.TrimSpace(string(dmiData))
		}
		if dmiData, err := os.ReadFile("/sys/class/dmi/id/product_name"); err == nil {
			info.System.ProductName = strings.TrimSpace(string(dmiData))
		}
		if dmiData, err := os.ReadFile("/sys/class/dmi/id/product_version"); err == nil {
			info.System.Version = strings.TrimSpace(string(dmiData))
		}
		if dmiData, err := os.ReadFile("/sys/class/dmi/id/product_uuid"); err == nil {
			info.System.UUID = strings.TrimSpace(string(dmiData))
		}

		// BIOS info
		if dmiData, err := os.ReadFile("/sys/class/dmi/id/bios_vendor"); err == nil {
			info.BIOS.Vendor = strings.TrimSpace(string(dmiData))
		}
		if dmiData, err := os.ReadFile("/sys/class/dmi/id/bios_version"); err == nil {
			info.BIOS.Version = strings.TrimSpace(string(dmiData))
		}
		if dmiData, err := os.ReadFile("/sys/class/dmi/id/bios_date"); err == nil {
			info.BIOS.Date = strings.TrimSpace(string(dmiData))
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(info)
	}
}

// GetScheduledTasks returns cron jobs and systemd timers
func GetScheduledTasks() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		type ScheduledTask struct {
			Name        string `json:"name"`
			Type        string `json:"type"` // cron, timer
			Schedule    string `json:"schedule"`
			Command     string `json:"command,omitempty"`
			User        string `json:"user,omitempty"`
			LastRun     string `json:"last_run,omitempty"`
			NextRun     string `json:"next_run,omitempty"`
			Description string `json:"description,omitempty"`
		}

		var tasks []ScheduledTask

		// Get systemd timers
		output, err := execCommand("systemctl", "list-timers", "--all", "--no-pager", "--plain")
		if err == nil {
			scanner := bufio.NewScanner(strings.NewReader(output))
			// Skip header
			scanner.Scan()
			for scanner.Scan() {
				fields := strings.Fields(scanner.Text())
				if len(fields) >= 6 {
					tasks = append(tasks, ScheduledTask{
						Name:    strings.TrimSuffix(fields[len(fields)-1], ".timer"),
						Type:    "timer",
						NextRun: strings.Join(fields[0:3], " "),
						LastRun: strings.Join(fields[3:6], " "),
					})
				}
			}
		}

		// Get system cron jobs from /etc/crontab
		crontab, _ := os.ReadFile("/etc/crontab")
		scanner := bufio.NewScanner(strings.NewReader(string(crontab)))
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}

			fields := strings.Fields(line)
			if len(fields) >= 7 {
				schedule := strings.Join(fields[0:5], " ")
				user := fields[5]
				command := strings.Join(fields[6:], " ")

				tasks = append(tasks, ScheduledTask{
					Name:     fmt.Sprintf("cron-%s", fields[6]),
					Type:     "cron",
					Schedule: schedule,
					User:     user,
					Command:  command,
				})
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(tasks)
	}
}
