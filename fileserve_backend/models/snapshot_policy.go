package models

import "time"

// SnapshotPolicy represents an automated snapshot schedule
type SnapshotPolicy struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Dataset     string    `json:"dataset"`      // ZFS dataset (e.g., "pool/data")
	Enabled     bool      `json:"enabled"`
	Schedule    string    `json:"schedule"`     // cron-like: "hourly", "daily", "weekly", "monthly", or custom
	Retention   int       `json:"retention"`    // Number of snapshots to keep
	Prefix      string    `json:"prefix"`       // Snapshot name prefix (default: "auto")
	Recursive   bool      `json:"recursive"`    // Create recursive snapshots
	LastRun     *time.Time `json:"last_run,omitempty"`
	NextRun     *time.Time `json:"next_run,omitempty"`
	LastError   string    `json:"last_error,omitempty"`
	SnapshotCount int     `json:"snapshot_count"` // Current number of snapshots from this policy
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// SnapshotSchedule represents predefined schedule options
type SnapshotSchedule string

const (
	ScheduleHourly  SnapshotSchedule = "hourly"
	ScheduleDaily   SnapshotSchedule = "daily"
	ScheduleWeekly  SnapshotSchedule = "weekly"
	ScheduleMonthly SnapshotSchedule = "monthly"
)

// GetScheduleDescription returns a human-readable description of the schedule
func (p *SnapshotPolicy) GetScheduleDescription() string {
	switch SnapshotSchedule(p.Schedule) {
	case ScheduleHourly:
		return "Every hour at :00"
	case ScheduleDaily:
		return "Every day at 00:00"
	case ScheduleWeekly:
		return "Every Sunday at 00:00"
	case ScheduleMonthly:
		return "First day of each month at 00:00"
	default:
		return p.Schedule
	}
}

// GetSnapshotName generates a snapshot name for this policy
func (p *SnapshotPolicy) GetSnapshotName() string {
	prefix := p.Prefix
	if prefix == "" {
		prefix = "auto"
	}
	timestamp := time.Now().Format("2006-01-02_15-04-05")
	return prefix + "-" + p.Schedule + "-" + timestamp
}
