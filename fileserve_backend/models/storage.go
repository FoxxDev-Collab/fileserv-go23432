package models

import "time"

// DiskInfo represents a physical disk device
type DiskInfo struct {
	Name        string       `json:"name"`
	Path        string       `json:"path"`
	Size        uint64       `json:"size"`
	SizeHuman   string       `json:"size_human"`
	Model       string       `json:"model"`
	Serial      string       `json:"serial"`
	Type        string       `json:"type"` // ssd, hdd, nvme, virtual
	Rotational  bool         `json:"rotational"`
	Removable   bool         `json:"removable"`
	ReadOnly    bool         `json:"read_only"`
	Partitions  []Partition  `json:"partitions"`
	SMART       *SMARTInfo   `json:"smart,omitempty"`
	Temperature *int         `json:"temperature,omitempty"` // Celsius
}

// Partition represents a disk partition
type Partition struct {
	Name       string `json:"name"`
	Path       string `json:"path"`
	Size       uint64 `json:"size"`
	SizeHuman  string `json:"size_human"`
	Start      uint64 `json:"start"`
	End        uint64 `json:"end"`
	Type       string `json:"type"`       // primary, extended, logical
	FSType     string `json:"fstype"`     // ext4, xfs, ntfs, etc.
	UUID       string `json:"uuid"`
	Label      string `json:"label"`
	MountPoint string `json:"mountpoint"`
	Mounted    bool   `json:"mounted"`
	ReadOnly   bool   `json:"read_only"`
}

// SMARTInfo contains SMART health data for a disk
type SMARTInfo struct {
	Available      bool   `json:"available"`
	Healthy        bool   `json:"healthy"`
	PowerOnHours   int64  `json:"power_on_hours"`
	PowerCycles    int64  `json:"power_cycles"`
	ReallocSectors int64  `json:"reallocated_sectors"`
	PendingSectors int64  `json:"pending_sectors"`
	Temperature    int    `json:"temperature"`
	OverallStatus  string `json:"overall_status"` // PASSED, FAILED, UNKNOWN
}

// MountPoint represents a mounted filesystem
type MountPoint struct {
	Device      string  `json:"device"`
	MountPath   string  `json:"mount_path"`
	FSType      string  `json:"fstype"`
	Options     string  `json:"options"`
	Total       uint64  `json:"total"`
	Used        uint64  `json:"used"`
	Available   uint64  `json:"available"`
	UsedPercent float64 `json:"used_percent"`
	TotalHuman  string  `json:"total_human"`
	UsedHuman   string  `json:"used_human"`
	AvailHuman  string  `json:"available_human"`
	Inodes      uint64  `json:"inodes"`
	InodesUsed  uint64  `json:"inodes_used"`
	InodesFree  uint64  `json:"inodes_free"`
}

// VolumeGroup represents an LVM Volume Group
type VolumeGroup struct {
	Name          string          `json:"name"`
	UUID          string          `json:"uuid"`
	Size          uint64          `json:"size"`
	SizeHuman     string          `json:"size_human"`
	Free          uint64          `json:"free"`
	FreeHuman     string          `json:"free_human"`
	PVCount       int             `json:"pv_count"`
	LVCount       int             `json:"lv_count"`
	SnapCount     int             `json:"snap_count"`
	Attributes    string          `json:"attributes"`
	PhysicalVols  []PhysicalVolume `json:"physical_volumes"`
	LogicalVols   []LogicalVolume  `json:"logical_volumes"`
}

// PhysicalVolume represents an LVM Physical Volume
type PhysicalVolume struct {
	Name      string `json:"name"`
	Path      string `json:"path"`
	VGName    string `json:"vg_name"`
	Size      uint64 `json:"size"`
	SizeHuman string `json:"size_human"`
	Free      uint64 `json:"free"`
	FreeHuman string `json:"free_human"`
	UUID      string `json:"uuid"`
	Format    string `json:"format"`
}

// LogicalVolume represents an LVM Logical Volume
type LogicalVolume struct {
	Name        string  `json:"name"`
	Path        string  `json:"path"`
	VGName      string  `json:"vg_name"`
	Size        uint64  `json:"size"`
	SizeHuman   string  `json:"size_human"`
	Attributes  string  `json:"attributes"`
	PoolLV      string  `json:"pool_lv,omitempty"`
	DataPercent float64 `json:"data_percent,omitempty"`
	MountPoint  string  `json:"mountpoint,omitempty"`
	FSType      string  `json:"fstype,omitempty"`
	Origin      string  `json:"origin,omitempty"` // For snapshots
	SnapPercent float64 `json:"snap_percent,omitempty"`
}

// RAIDArray represents a software RAID array (mdadm)
type RAIDArray struct {
	Name        string       `json:"name"`
	Path        string       `json:"path"`
	Level       string       `json:"level"` // raid0, raid1, raid5, raid6, raid10
	State       string       `json:"state"` // active, degraded, rebuilding
	Size        uint64       `json:"size"`
	SizeHuman   string       `json:"size_human"`
	Devices     int          `json:"devices"`
	ActiveDevs  int          `json:"active_devices"`
	SpareDevs   int          `json:"spare_devices"`
	FailedDevs  int          `json:"failed_devices"`
	SyncPercent float64      `json:"sync_percent,omitempty"`
	SyncSpeed   string       `json:"sync_speed,omitempty"`
	Members     []RAIDMember `json:"members"`
	UUID        string       `json:"uuid"`
	ChunkSize   string       `json:"chunk_size,omitempty"`
}

// RAIDMember represents a device in a RAID array
type RAIDMember struct {
	Device string `json:"device"`
	Role   string `json:"role"`   // active, spare, faulty
	State  string `json:"state"`  // in_sync, spare, faulty, rebuilding
	Slot   int    `json:"slot"`
}

// ZFSPool represents a ZFS storage pool
type ZFSPool struct {
	Name       string       `json:"name"`
	Size       uint64       `json:"size"`
	SizeHuman  string       `json:"size_human"`
	Allocated  uint64       `json:"allocated"`
	Free       uint64       `json:"free"`
	FreeHuman  string       `json:"free_human"`
	Fragmentation int       `json:"fragmentation"`
	Capacity   int          `json:"capacity"` // percentage
	Health     string       `json:"health"`   // ONLINE, DEGRADED, FAULTED
	Dedup      float64      `json:"dedup_ratio"`
	AltRoot    string       `json:"altroot,omitempty"`
	VDevs      []ZFSVDev    `json:"vdevs"`
	Datasets   []ZFSDataset `json:"datasets,omitempty"`
}

// ZFSVDev represents a virtual device in a ZFS pool
type ZFSVDev struct {
	Name     string    `json:"name"`
	Type     string    `json:"type"` // disk, mirror, raidz1, raidz2, raidz3
	State    string    `json:"state"`
	Read     int64     `json:"read_errors"`
	Write    int64     `json:"write_errors"`
	Checksum int64     `json:"checksum_errors"`
	Children []ZFSVDev `json:"children,omitempty"`
}

// ZFSDataset represents a ZFS dataset (filesystem, volume, snapshot)
type ZFSDataset struct {
	Name        string `json:"name"`
	Type        string `json:"type"` // filesystem, volume, snapshot
	Used        uint64 `json:"used"`
	UsedHuman   string `json:"used_human"`
	Available   uint64 `json:"available"`
	AvailHuman  string `json:"available_human"`
	Referenced  uint64 `json:"referenced"`
	MountPoint  string `json:"mountpoint,omitempty"`
	Compression string `json:"compression"`
	CompressRatio float64 `json:"compress_ratio"`
	Quota       uint64 `json:"quota,omitempty"`
	QuotaHuman  string `json:"quota_human,omitempty"`
}

// Quota represents filesystem quota information for a user or group
type Quota struct {
	ID           string    `json:"id"`
	Type         string    `json:"type"`     // user, group, project
	Target       string    `json:"target"`   // username, groupname, or project id
	Filesystem   string    `json:"filesystem"`
	MountPoint   string    `json:"mount_point"`
	BlockUsed    uint64    `json:"block_used"`
	BlockSoft    uint64    `json:"block_soft"`
	BlockHard    uint64    `json:"block_hard"`
	BlockGrace   string    `json:"block_grace,omitempty"`
	InodeUsed    uint64    `json:"inode_used"`
	InodeSoft    uint64    `json:"inode_soft"`
	InodeHard    uint64    `json:"inode_hard"`
	InodeGrace   string    `json:"inode_grace,omitempty"`
	UsedHuman    string    `json:"used_human"`
	SoftHuman    string    `json:"soft_human"`
	HardHuman    string    `json:"hard_human"`
	UsedPercent  float64   `json:"used_percent"`
	OverQuota    bool      `json:"over_quota"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// QuotaConfig represents quota configuration for setting quotas
type QuotaConfig struct {
	Type       string `json:"type"`       // user, group, project
	Target     string `json:"target"`     // username, groupname, or project id
	Filesystem string `json:"filesystem"` // mount point or device
	BlockSoft  uint64 `json:"block_soft"` // soft limit in bytes
	BlockHard  uint64 `json:"block_hard"` // hard limit in bytes
	InodeSoft  uint64 `json:"inode_soft"` // soft limit for inodes
	InodeHard  uint64 `json:"inode_hard"` // hard limit for inodes
}

// StorageOverview provides a high-level view of storage resources
type StorageOverview struct {
	TotalDisks      int             `json:"total_disks"`
	TotalCapacity   uint64          `json:"total_capacity"`
	TotalUsed       uint64          `json:"total_used"`
	TotalFree       uint64          `json:"total_free"`
	CapacityHuman   string          `json:"capacity_human"`
	UsedHuman       string          `json:"used_human"`
	FreeHuman       string          `json:"free_human"`
	UsedPercent     float64         `json:"used_percent"`
	MountPoints     []MountPoint    `json:"mount_points"`
	DiskHealth      []DiskHealth    `json:"disk_health"`
	Alerts          []StorageAlert  `json:"alerts"`
	VolumeGroups    int             `json:"volume_groups"`
	RAIDArrays      int             `json:"raid_arrays"`
	ZFSPools        int             `json:"zfs_pools"`
	QuotasEnabled   bool            `json:"quotas_enabled"`
}

// DiskHealth represents simplified health status of a disk
type DiskHealth struct {
	Name   string `json:"name"`
	Path   string `json:"path"`
	Health string `json:"health"` // healthy, warning, critical
	Temp   *int   `json:"temperature,omitempty"`
}

// StorageAlert represents a storage-related alert
type StorageAlert struct {
	Level     string    `json:"level"`     // info, warning, critical
	Type      string    `json:"type"`      // disk_health, space_low, raid_degraded, etc.
	Message   string    `json:"message"`
	Resource  string    `json:"resource"`  // disk/partition/volume name
	Timestamp time.Time `json:"timestamp"`
}

// ServiceInfo represents a system service status
type ServiceInfo struct {
	Name        string `json:"name"`
	DisplayName string `json:"display_name"`
	Description string `json:"description"`
	Status      string `json:"status"`      // running, stopped, failed
	Enabled     bool   `json:"enabled"`     // starts on boot
	ActiveState string `json:"active_state"`
	SubState    string `json:"sub_state"`
	MainPID     int    `json:"main_pid,omitempty"`
	MemoryUsage uint64 `json:"memory_usage,omitempty"`
	CPUUsage    string `json:"cpu_usage,omitempty"`
}

// SystemResources represents overall system resource usage
type SystemResources struct {
	CPUCores       int     `json:"cpu_cores"`
	CPUUsage       float64 `json:"cpu_usage"`       // percentage
	CPUModel       string  `json:"cpu_model"`
	MemoryTotal    uint64  `json:"memory_total"`
	MemoryUsed     uint64  `json:"memory_used"`
	MemoryFree     uint64  `json:"memory_free"`
	MemoryPercent  float64 `json:"memory_percent"`
	SwapTotal      uint64  `json:"swap_total"`
	SwapUsed       uint64  `json:"swap_used"`
	SwapPercent    float64 `json:"swap_percent"`
	Uptime         int64   `json:"uptime"`         // seconds
	UptimeHuman    string  `json:"uptime_human"`
	LoadAvg1       float64 `json:"load_avg_1"`
	LoadAvg5       float64 `json:"load_avg_5"`
	LoadAvg15      float64 `json:"load_avg_15"`
	Hostname       string  `json:"hostname"`
	KernelVersion  string  `json:"kernel_version"`
	OSRelease      string  `json:"os_release"`
	Architecture   string  `json:"architecture"`
}

// NetworkInterface represents a network interface
type NetworkInterface struct {
	Name       string   `json:"name"`
	MAC        string   `json:"mac"`
	MTU        int      `json:"mtu"`
	State      string   `json:"state"` // up, down
	Speed      string   `json:"speed,omitempty"`
	Duplex     string   `json:"duplex,omitempty"`
	IPv4Addrs  []string `json:"ipv4_addresses"`
	IPv6Addrs  []string `json:"ipv6_addresses"`
	RxBytes    uint64   `json:"rx_bytes"`
	TxBytes    uint64   `json:"tx_bytes"`
	RxPackets  uint64   `json:"rx_packets"`
	TxPackets  uint64   `json:"tx_packets"`
	RxErrors   uint64   `json:"rx_errors"`
	TxErrors   uint64   `json:"tx_errors"`
	RxHuman    string   `json:"rx_human"`
	TxHuman    string   `json:"tx_human"`
}

// Process represents a running process
type Process struct {
	PID     int     `json:"pid"`
	User    string  `json:"user"`
	CPU     float64 `json:"cpu"`
	Memory  float64 `json:"memory"`
	VSZ     uint64  `json:"vsz"`
	RSS     uint64  `json:"rss"`
	State   string  `json:"state"`
	Started string  `json:"started"`
	Command string  `json:"command"`
}

// IOStats represents I/O statistics for a device
type IOStats struct {
	Device       string  `json:"device"`
	ReadBytes    uint64  `json:"read_bytes"`
	WriteBytes   uint64  `json:"write_bytes"`
	ReadOps      uint64  `json:"read_ops"`
	WriteOps     uint64  `json:"write_ops"`
	ReadTime     uint64  `json:"read_time_ms"`
	WriteTime    uint64  `json:"write_time_ms"`
	IOInProgress uint64  `json:"io_in_progress"`
	IOTime       uint64  `json:"io_time_ms"`
	ReadHuman    string  `json:"read_human"`
	WriteHuman   string  `json:"write_human"`
}

// UserStorageUsage represents storage usage for a specific user
type UserStorageUsage struct {
	Username     string      `json:"username"`
	UID          int         `json:"uid"`
	HomeDir      string      `json:"home_dir"`
	HomeDirSize  uint64      `json:"home_dir_size"`
	HomeSizeHuman string     `json:"home_size_human"`
	Quotas       []Quota     `json:"quotas,omitempty"`
	TotalUsed    uint64      `json:"total_used"`
	TotalHuman   string      `json:"total_human"`
	FileCount    int64       `json:"file_count"`
	DirCount     int64       `json:"dir_count"`
}

// FstabEntry represents an entry in /etc/fstab
type FstabEntry struct {
	Device     string `json:"device"`
	MountPoint string `json:"mount_point"`
	FSType     string `json:"fstype"`
	Options    string `json:"options"`
	Dump       int    `json:"dump"`
	Pass       int    `json:"pass"`
	IsMounted  bool   `json:"is_mounted"`
	HasError   bool   `json:"has_error"`
	ErrorMsg   string `json:"error_msg,omitempty"`
}

// PartitionTableType represents partition table types
type PartitionTableType string

const (
	PartTableGPT PartitionTableType = "gpt"
	PartTableMBR PartitionTableType = "msdos"
)

// CreatePartitionRequest represents a request to create a new partition
type CreatePartitionRequest struct {
	Disk   string `json:"disk"`
	Start  string `json:"start"`  // e.g., "0%", "1MiB", "100GiB"
	End    string `json:"end"`    // e.g., "100%", "50GiB"
	FSType string `json:"fstype"` // ext4, xfs, etc.
	Label  string `json:"label,omitempty"`
}

// CreateVolumeGroupRequest represents a request to create an LVM volume group
type CreateVolumeGroupRequest struct {
	Name    string   `json:"name"`
	Devices []string `json:"devices"` // Physical volume paths
}

// CreateLogicalVolumeRequest represents a request to create an LVM logical volume
type CreateLogicalVolumeRequest struct {
	Name     string `json:"name"`
	VGName   string `json:"vg_name"`
	Size     string `json:"size"`     // e.g., "10G", "100%FREE"
	FSType   string `json:"fstype,omitempty"`
	Mount    string `json:"mount,omitempty"`
	Snapshot string `json:"snapshot,omitempty"` // Source LV for snapshot
}

// CreateRAIDRequest represents a request to create a RAID array
type CreateRAIDRequest struct {
	Name    string   `json:"name"`    // e.g., "md0"
	Level   string   `json:"level"`   // raid0, raid1, raid5, raid6, raid10
	Devices []string `json:"devices"` // Device paths
	Spares  []string `json:"spares,omitempty"`
	Chunk   string   `json:"chunk,omitempty"` // e.g., "512K"
}

// CreateZFSPoolRequest represents a request to create a ZFS pool
type CreateZFSPoolRequest struct {
	Name       string   `json:"name"`
	VDevType   string   `json:"vdev_type"` // mirror, raidz, raidz2, raidz3, stripe
	Devices    []string `json:"devices"`
	MountPoint string   `json:"mount_point,omitempty"`
	Compress   string   `json:"compression,omitempty"` // lz4, gzip, zstd, off
	Dedup      bool     `json:"dedup,omitempty"`
}

// CreateZFSDatasetRequest represents a request to create a ZFS dataset
type CreateZFSDatasetRequest struct {
	Pool       string `json:"pool"`
	Name       string `json:"name"`
	Type       string `json:"type"`       // filesystem, volume
	Size       string `json:"size,omitempty"` // For volumes
	MountPoint string `json:"mount_point,omitempty"`
	Quota      string `json:"quota,omitempty"`
	Compress   string `json:"compression,omitempty"`
}

// MountRequest represents a request to mount a filesystem
type MountRequest struct {
	Device     string `json:"device"`
	MountPoint string `json:"mount_point"`
	FSType     string `json:"fstype,omitempty"`
	Options    string `json:"options,omitempty"`
	Persistent bool   `json:"persistent"` // Add to fstab
}

// FormatRequest represents a request to format a partition
type FormatRequest struct {
	Device string `json:"device"`
	FSType string `json:"fstype"` // ext4, xfs, btrfs, etc.
	Label  string `json:"label,omitempty"`
	Force  bool   `json:"force"`
}

// ResizeRequest represents a request to resize a volume
type ResizeRequest struct {
	Device    string `json:"device"`
	Size      string `json:"size"` // New size or +/- delta
	ResizeFS  bool   `json:"resize_fs"`
}
