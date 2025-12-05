package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os/exec"
	"sort"
	"strings"
	"sync"
	"time"

	"fileserv/models"
	"fileserv/storage"

	"github.com/go-chi/chi/v5"
)

// SnapshotScheduler manages automated ZFS snapshots
type SnapshotScheduler struct {
	store    storage.DataStore
	stopChan chan struct{}
	wg       sync.WaitGroup
	mu       sync.Mutex
	running  bool
}

// NewSnapshotScheduler creates a new snapshot scheduler
func NewSnapshotScheduler(store storage.DataStore) *SnapshotScheduler {
	return &SnapshotScheduler{
		store:    store,
		stopChan: make(chan struct{}),
	}
}

// Start begins the snapshot scheduler background goroutine
func (s *SnapshotScheduler) Start() {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return
	}
	s.running = true
	s.stopChan = make(chan struct{})
	s.mu.Unlock()

	s.wg.Add(1)
	go s.run()
	log.Println("Snapshot scheduler started")
}

// Stop stops the snapshot scheduler
func (s *SnapshotScheduler) Stop() {
	s.mu.Lock()
	if !s.running {
		s.mu.Unlock()
		return
	}
	s.running = false
	close(s.stopChan)
	s.mu.Unlock()

	s.wg.Wait()
	log.Println("Snapshot scheduler stopped")
}

// run is the main scheduler loop
func (s *SnapshotScheduler) run() {
	defer s.wg.Done()

	// Check every minute for policies that need to run
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	// Initial check
	s.checkAndRunPolicies()

	for {
		select {
		case <-s.stopChan:
			return
		case <-ticker.C:
			s.checkAndRunPolicies()
		}
	}
}

// checkAndRunPolicies checks all policies and runs those that are due
func (s *SnapshotScheduler) checkAndRunPolicies() {
	policies := s.store.ListEnabledSnapshotPolicies()
	now := time.Now()

	for _, policy := range policies {
		// Initialize NextRun if not set
		if policy.NextRun == nil {
			nextRun := s.calculateNextRun(policy.Schedule, now)
			s.store.UpdateSnapshotPolicyRun(policy.ID, now, nextRun, "")
			continue
		}

		// Check if it's time to run
		if now.After(*policy.NextRun) || now.Equal(*policy.NextRun) {
			s.runPolicy(policy)
		}
	}
}

// runPolicy executes a snapshot policy
func (s *SnapshotScheduler) runPolicy(policy *models.SnapshotPolicy) {
	log.Printf("Running snapshot policy: %s (dataset: %s)", policy.Name, policy.Dataset)

	now := time.Now()
	var lastError string

	// Create the snapshot
	snapshotName := policy.GetSnapshotName()
	fullName := fmt.Sprintf("%s@%s", policy.Dataset, snapshotName)

	args := []string{"zfs", "snapshot"}
	if policy.Recursive {
		args = append(args, "-r")
	}
	args = append(args, fullName)

	cmd := exec.Command("sudo", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		lastError = fmt.Sprintf("Failed to create snapshot: %s - %s", err.Error(), string(output))
		log.Printf("Snapshot policy %s failed: %s", policy.Name, lastError)
	} else {
		log.Printf("Snapshot created: %s", fullName)

		// Prune old snapshots if retention is set
		if policy.Retention > 0 {
			s.pruneSnapshots(policy)
		}
	}

	// Calculate next run time
	nextRun := s.calculateNextRun(policy.Schedule, now)

	// Update policy with run information
	s.store.UpdateSnapshotPolicyRun(policy.ID, now, nextRun, lastError)
}

// pruneSnapshots removes old snapshots beyond the retention limit
func (s *SnapshotScheduler) pruneSnapshots(policy *models.SnapshotPolicy) {
	prefix := policy.Prefix
	if prefix == "" {
		prefix = "auto"
	}

	// List snapshots for this dataset
	args := []string{"list", "-H", "-t", "snapshot", "-o", "name,creation", "-s", "creation"}
	if policy.Recursive {
		args = append(args, "-r")
	}
	args = append(args, policy.Dataset)

	output, err := exec.Command("zfs", args...).Output()
	if err != nil {
		log.Printf("Failed to list snapshots for pruning: %v", err)
		return
	}

	// Parse snapshots and filter by prefix
	var policySnapshots []string
	lines := strings.Split(string(output), "\n")
	for _, line := range lines {
		fields := strings.Fields(line)
		if len(fields) < 1 {
			continue
		}
		snapName := fields[0]
		// Check if snapshot name matches our prefix pattern
		if strings.Contains(snapName, "@"+prefix+"-"+policy.Schedule+"-") {
			policySnapshots = append(policySnapshots, snapName)
		}
	}

	// Sort by name (which includes timestamp) - oldest first
	sort.Strings(policySnapshots)

	// Delete snapshots beyond retention limit
	deleteCount := len(policySnapshots) - policy.Retention
	if deleteCount > 0 {
		for i := 0; i < deleteCount; i++ {
			snapName := policySnapshots[i]
			log.Printf("Pruning old snapshot: %s", snapName)

			args := []string{"zfs", "destroy"}
			if policy.Recursive {
				args = append(args, "-r")
			}
			args = append(args, snapName)

			cmd := exec.Command("sudo", args...)
			if output, err := cmd.CombinedOutput(); err != nil {
				log.Printf("Failed to delete snapshot %s: %s - %s", snapName, err.Error(), string(output))
			}
		}
	}
}

// calculateNextRun calculates the next run time based on schedule
func (s *SnapshotScheduler) calculateNextRun(schedule string, from time.Time) time.Time {
	switch models.SnapshotSchedule(schedule) {
	case models.ScheduleHourly:
		// Next hour at :00
		next := from.Truncate(time.Hour).Add(time.Hour)
		return next
	case models.ScheduleDaily:
		// Next day at 00:00
		next := time.Date(from.Year(), from.Month(), from.Day()+1, 0, 0, 0, 0, from.Location())
		return next
	case models.ScheduleWeekly:
		// Next Sunday at 00:00
		daysUntilSunday := (7 - int(from.Weekday())) % 7
		if daysUntilSunday == 0 && from.Hour() >= 0 {
			daysUntilSunday = 7
		}
		next := time.Date(from.Year(), from.Month(), from.Day()+daysUntilSunday, 0, 0, 0, 0, from.Location())
		return next
	case models.ScheduleMonthly:
		// First day of next month at 00:00
		next := time.Date(from.Year(), from.Month()+1, 1, 0, 0, 0, 0, from.Location())
		return next
	default:
		// Default to daily
		return time.Date(from.Year(), from.Month(), from.Day()+1, 0, 0, 0, 0, from.Location())
	}
}

// ============================================================================
// HTTP Handlers
// ============================================================================

// SnapshotPolicyHandler handles snapshot policy API requests
type SnapshotPolicyHandler struct {
	store     storage.DataStore
	scheduler *SnapshotScheduler
}

// NewSnapshotPolicyHandler creates a new handler
func NewSnapshotPolicyHandler(store storage.DataStore, scheduler *SnapshotScheduler) *SnapshotPolicyHandler {
	return &SnapshotPolicyHandler{
		store:     store,
		scheduler: scheduler,
	}
}

// ListPolicies returns all snapshot policies
func (h *SnapshotPolicyHandler) ListPolicies(w http.ResponseWriter, r *http.Request) {
	policies := h.store.ListSnapshotPolicies()

	// Update snapshot counts for each policy
	for _, policy := range policies {
		policy.SnapshotCount = h.countPolicySnapshots(policy)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(policies)
}

// GetPolicy returns a single snapshot policy
func (h *SnapshotPolicyHandler) GetPolicy(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	policy, err := h.store.GetSnapshotPolicy(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	policy.SnapshotCount = h.countPolicySnapshots(policy)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(policy)
}

// CreatePolicy creates a new snapshot policy
func (h *SnapshotPolicyHandler) CreatePolicy(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name      string `json:"name"`
		Dataset   string `json:"dataset"`
		Schedule  string `json:"schedule"`
		Retention int    `json:"retention"`
		Prefix    string `json:"prefix"`
		Recursive bool   `json:"recursive"`
		Enabled   bool   `json:"enabled"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate required fields
	if req.Name == "" {
		http.Error(w, "Policy name is required", http.StatusBadRequest)
		return
	}
	if req.Dataset == "" {
		http.Error(w, "Dataset is required", http.StatusBadRequest)
		return
	}
	if req.Schedule == "" {
		req.Schedule = "daily"
	}
	if req.Retention == 0 {
		req.Retention = 7
	}
	if req.Prefix == "" {
		req.Prefix = "auto"
	}

	// Validate schedule
	validSchedules := map[string]bool{
		"hourly": true, "daily": true, "weekly": true, "monthly": true,
	}
	if !validSchedules[req.Schedule] {
		http.Error(w, "Invalid schedule. Must be: hourly, daily, weekly, or monthly", http.StatusBadRequest)
		return
	}

	// Verify dataset exists
	output, err := exec.Command("zfs", "list", "-H", req.Dataset).CombinedOutput()
	if err != nil {
		http.Error(w, fmt.Sprintf("Dataset '%s' not found: %s", req.Dataset, string(output)), http.StatusBadRequest)
		return
	}

	// Calculate initial next run
	now := time.Now()
	nextRun := h.scheduler.calculateNextRun(req.Schedule, now)

	policy := &models.SnapshotPolicy{
		Name:      req.Name,
		Dataset:   req.Dataset,
		Schedule:  req.Schedule,
		Retention: req.Retention,
		Prefix:    req.Prefix,
		Recursive: req.Recursive,
		Enabled:   req.Enabled,
		NextRun:   &nextRun,
	}

	created, err := h.store.CreateSnapshotPolicy(policy)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to create policy: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(created)
}

// UpdatePolicy updates a snapshot policy
func (h *SnapshotPolicyHandler) UpdatePolicy(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var updates map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&updates); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// If schedule is being updated, recalculate next run
	if schedule, ok := updates["schedule"].(string); ok {
		validSchedules := map[string]bool{
			"hourly": true, "daily": true, "weekly": true, "monthly": true,
		}
		if !validSchedules[schedule] {
			http.Error(w, "Invalid schedule", http.StatusBadRequest)
			return
		}
	}

	// If dataset is being updated, verify it exists
	if dataset, ok := updates["dataset"].(string); ok {
		output, err := exec.Command("zfs", "list", "-H", dataset).CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("Dataset '%s' not found: %s", dataset, string(output)), http.StatusBadRequest)
			return
		}
	}

	updated, err := h.store.UpdateSnapshotPolicy(id, updates)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(updated)
}

// DeletePolicy deletes a snapshot policy
func (h *SnapshotPolicyHandler) DeletePolicy(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	if err := h.store.DeleteSnapshotPolicy(id); err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Policy deleted successfully",
	})
}

// RunPolicy manually triggers a snapshot policy
func (h *SnapshotPolicyHandler) RunPolicy(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	policy, err := h.store.GetSnapshotPolicy(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	// Run the policy
	h.scheduler.runPolicy(policy)

	// Return updated policy
	policy, _ = h.store.GetSnapshotPolicy(id)
	policy.SnapshotCount = h.countPolicySnapshots(policy)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message": "Snapshot policy executed",
		"policy":  policy,
	})
}

// GetPolicySnapshots returns snapshots created by a policy
func (h *SnapshotPolicyHandler) GetPolicySnapshots(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	policy, err := h.store.GetSnapshotPolicy(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	snapshots := h.listPolicySnapshots(policy)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(snapshots)
}

// countPolicySnapshots counts snapshots for a policy
func (h *SnapshotPolicyHandler) countPolicySnapshots(policy *models.SnapshotPolicy) int {
	return len(h.listPolicySnapshots(policy))
}

// listPolicySnapshots lists snapshots created by a policy
func (h *SnapshotPolicyHandler) listPolicySnapshots(policy *models.SnapshotPolicy) []map[string]interface{} {
	prefix := policy.Prefix
	if prefix == "" {
		prefix = "auto"
	}

	args := []string{"list", "-H", "-t", "snapshot", "-o", "name,used,referenced,creation", "-s", "creation"}
	if policy.Recursive {
		args = append(args, "-r")
	}
	args = append(args, policy.Dataset)

	output, err := exec.Command("zfs", args...).Output()
	if err != nil {
		return []map[string]interface{}{}
	}

	var snapshots []map[string]interface{}
	lines := strings.Split(string(output), "\n")
	for _, line := range lines {
		fields := strings.Fields(line)
		if len(fields) < 4 {
			continue
		}
		snapName := fields[0]
		// Check if snapshot name matches our prefix pattern
		if strings.Contains(snapName, "@"+prefix+"-"+policy.Schedule+"-") {
			snapshots = append(snapshots, map[string]interface{}{
				"name":       snapName,
				"used":       fields[1],
				"referenced": fields[2],
				"creation":   fields[3],
			})
		}
	}

	// Reverse to show newest first
	for i, j := 0, len(snapshots)-1; i < j; i, j = i+1, j-1 {
		snapshots[i], snapshots[j] = snapshots[j], snapshots[i]
	}

	return snapshots
}

// GetSchedulerStatus returns the status of the scheduler
func (h *SnapshotPolicyHandler) GetSchedulerStatus(w http.ResponseWriter, r *http.Request) {
	policies := h.store.ListSnapshotPolicies()
	enabledCount := 0
	for _, p := range policies {
		if p.Enabled {
			enabledCount++
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"running":          h.scheduler.running,
		"total_policies":   len(policies),
		"enabled_policies": enabledCount,
	})
}
