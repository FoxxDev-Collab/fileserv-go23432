/**
 * API utility for communicating with the FileServ backend
 */

const API_BASE = '/api';

// Store token in memory (also persisted to localStorage)
let authToken: string | null = null;

// Encode path segments individually, preserving '/' separators
function encodePathSegments(path: string): string {
  return path.split('/').map(segment => encodeURIComponent(segment)).join('/');
}

// Normalize path to always start with /
function normalizePath(path: string): string {
  if (!path || path === '/') return '/';
  return path.startsWith('/') ? path : `/${path}`;
}

export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) {
    localStorage.setItem('auth_token', token);
  } else {
    localStorage.removeItem('auth_token');
  }
}

export function getAuthToken(): string | null {
  if (!authToken) {
    authToken = localStorage.getItem('auth_token');
  }
  return authToken;
}

export function clearAuthToken() {
  authToken = null;
  localStorage.removeItem('auth_token');
  localStorage.removeItem('user');
}

async function fetchAPI<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken();

  const headers: HeadersInit = {
    ...options.headers,
  };

  // Add auth header if we have a token
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  // Add content-type for non-FormData requests
  if (!(options.body instanceof FormData)) {
    (headers as Record<string, string>)['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }

  // Handle empty responses (like 204 No Content)
  if (response.status === 204) {
    return {} as T;
  }

  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return response.json();
  }

  return {} as T;
}

// Auth API
export interface LoginResponse {
  token: string;
  expires_at: number;
  user: {
    id: string;
    username: string;
    email?: string;
    is_admin: boolean;
    groups: string[];
    created_at: string;
    updated_at: string;
  };
}

export interface CurrentUserResponse {
  id: string;
  username: string;
  is_admin: boolean;
  groups: string[];
}

export const authAPI = {
  login: (username: string, password: string) =>
    fetchAPI<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  logout: () =>
    fetchAPI<{ message: string }>('/auth/logout', {
      method: 'POST',
    }),

  refresh: () =>
    fetchAPI<{ token: string; expires_at: number }>('/auth/refresh', {
      method: 'POST',
    }),

  getCurrentUser: () =>
    fetchAPI<CurrentUserResponse>('/auth/me', {
      method: 'GET',
    }),
};

// Files API
export interface FileInfo {
  name: string;
  path: string;
  size: number;
  is_dir: boolean;
  mod_time: string;
  mode: string;
  owner: string;
  group: string;
  uid: number;
  gid: number;
  mime_type?: string;
  extension?: string;
}

export const filesAPI = {
  list: (path: string = '/') =>
    fetchAPI<FileInfo[]>(`/files?path=${encodeURIComponent(path)}`),

  download: (path: string) => {
    const token = getAuthToken();
    const url = `${API_BASE}/files${encodePathSegments(path)}`;

    // Create a hidden link and click it to download
    const link = document.createElement('a');
    link.href = url;
    link.download = path.split('/').pop() || 'download';

    // For authenticated download, we need to fetch with auth header
    return fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => res.blob())
      .then((blob) => {
        const blobUrl = URL.createObjectURL(blob);
        link.href = blobUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
      });
  },

  upload: (path: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    return fetchAPI<{ message: string; path: string }>(`/files${encodePathSegments(path)}`, {
      method: 'POST',
      body: formData,
    });
  },

  delete: (path: string) =>
    fetchAPI<void>(`/files${encodePathSegments(path)}`, {
      method: 'DELETE',
    }),

  rename: (oldPath: string, newPath: string) =>
    fetchAPI<{ message: string; path: string }>(`/files${encodePathSegments(oldPath)}`, {
      method: 'PUT',
      body: JSON.stringify({ new_path: newPath }),
    }),

  createFolder: (path: string) =>
    fetchAPI<{ message: string; path: string }>(`/folders${encodePathSegments(path)}`, {
      method: 'POST',
    }),
};

// ============================================================================
// Zone-Based Files API (Uses Storage Pools & Zones)
// ============================================================================

export interface UserZoneInfo {
  zone_id: string;
  zone_name: string;
  zone_type: 'personal' | 'group' | 'public';
  pool_id: string;
  pool_name: string;
  full_path: string;
  user_path: string;
  description: string;
  can_upload: boolean;
  can_share: boolean;
}

// Pagination options for file listings
export interface ListOptions {
  limit?: number;
  offset?: number;
  sort_by?: 'name' | 'size' | 'modified' | 'type';
  sort_desc?: boolean;
  type?: 'file' | 'folder' | '';
}

// Paginated result
export interface ListResult {
  files: FileInfo[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export const zoneFilesAPI = {
  // Get all zones accessible to the current user
  getAccessibleZones: () => fetchAPI<UserZoneInfo[]>('/zones/accessible'),

  // List files in a zone (non-paginated for backwards compatibility)
  list: (zoneId: string, path: string = '') => {
    const params = path ? `?path=${encodeURIComponent(path)}` : '';
    return fetchAPI<FileInfo[]>(`/zones/${zoneId}/files/${params}`);
  },

  // List files in a zone with pagination
  listPaginated: (zoneId: string, path: string = '', options: ListOptions = {}) => {
    const params = new URLSearchParams();
    if (path) params.set('path', path);
    if (options.limit) params.set('limit', options.limit.toString());
    if (options.offset) params.set('offset', options.offset.toString());
    if (options.sort_by) params.set('sort_by', options.sort_by);
    if (options.sort_desc) params.set('sort_desc', 'true');
    if (options.type) params.set('type', options.type);
    return fetchAPI<ListResult>(`/zones/${zoneId}/files/?${params.toString()}`);
  },

  // Download a file from a zone
  download: (zoneId: string, path: string) => {
    const token = getAuthToken();
    const url = `${API_BASE}/zones/${zoneId}/files${encodePathSegments(normalizePath(path))}`;

    return fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = path.split('/').pop() || 'download';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
      });
  },

  // Get download URL for direct linking
  getDownloadUrl: (zoneId: string, path: string) => {
    return `${API_BASE}/zones/${zoneId}/files${encodePathSegments(normalizePath(path))}`;
  },

  // Upload file to a zone
  upload: (zoneId: string, path: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    return fetchAPI<{ message: string; path: string }>(`/zones/${zoneId}/files${encodePathSegments(normalizePath(path))}`, {
      method: 'POST',
      body: formData,
    });
  },

  // Delete file or folder in a zone
  delete: (zoneId: string, path: string) =>
    fetchAPI<void>(`/zones/${zoneId}/files${encodePathSegments(normalizePath(path))}`, {
      method: 'DELETE',
    }),

  // Rename/move file or folder in a zone
  rename: (zoneId: string, oldPath: string, newPath: string) =>
    fetchAPI<{ message: string; path: string }>(`/zones/${zoneId}/files${encodePathSegments(normalizePath(oldPath))}`, {
      method: 'PUT',
      body: JSON.stringify({ new_path: newPath }),
    }),

  // Create folder in a zone
  createFolder: (zoneId: string, path: string) =>
    fetchAPI<{ message: string; path: string }>(`/zones/${zoneId}/folders${encodePathSegments(normalizePath(path))}`, {
      method: 'POST',
    }),

  // List folders only (for folder picker)
  listFolders: (zoneId: string, path: string = '/') => {
    const params = `?path=${encodeURIComponent(path)}`;
    return fetchAPI<FileInfo[]>(`/zones/${zoneId}/folders${params}`);
  },

  // Bulk delete files/folders in a zone
  bulkDelete: (zoneId: string, paths: string[]) =>
    fetchAPI<BulkDeleteResponse>(`/zones/${zoneId}/bulk/delete`, {
      method: 'POST',
      body: JSON.stringify({ paths }),
    }),

  // Bulk move files/folders to a destination in a zone
  bulkMove: (zoneId: string, paths: string[], destination: string) =>
    fetchAPI<BulkMoveResponse>(`/zones/${zoneId}/bulk/move`, {
      method: 'POST',
      body: JSON.stringify({ paths, destination }),
    }),
};

// Bulk operation response types
export interface BulkDeleteResponse {
  deleted: string[];
  failed?: BulkErrorDetail[];
}

export interface BulkMoveResponse {
  moved: BulkMoveResult[];
  failed?: BulkErrorDetail[];
}

export interface BulkMoveResult {
  old_path: string;
  new_path: string;
}

export interface BulkErrorDetail {
  path: string;
  error: string;
}

// Users API (admin only)
export interface User {
  id: string;
  username: string;
  email?: string;
  is_admin: boolean;
  groups: string[];
  must_change_password: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateUserRequest {
  username: string;
  password: string;
  email?: string;
  is_admin?: boolean;
  groups?: string[];
}

export interface UpdateUserRequest {
  username?: string;
  password?: string;
  email?: string;
  is_admin?: boolean;
  groups?: string[];
}

export const usersAPI = {
  list: () => fetchAPI<User[]>('/users'),

  create: (data: CreateUserRequest) =>
    fetchAPI<User>('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: UpdateUserRequest) =>
    fetchAPI<User>(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    fetchAPI<void>(`/users/${id}`, {
      method: 'DELETE',
    }),
};

// Permissions API (admin only)
export interface Permission {
  id: string;
  path: string;
  type: string;
  username?: string;
  group?: string;
  can_read?: boolean;
  can_write?: boolean;
  can_delete?: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreatePermissionRequest {
  path: string;
  type: string;
  username?: string;
  group?: string;
}

export interface UpdatePermissionRequest {
  path?: string;
  type?: string;
  username?: string;
  group?: string;
}

export const permissionsAPI = {
  list: () => fetchAPI<Permission[]>('/permissions'),

  create: (data: CreatePermissionRequest) =>
    fetchAPI<Permission>('/permissions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: UpdatePermissionRequest) =>
    fetchAPI<Permission>(`/permissions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    fetchAPI<void>(`/permissions/${id}`, {
      method: 'DELETE',
    }),
};

// Admin API
export interface AdminStats {
  total_users: number;
  total_files: number;
  total_folders: number;
  total_size: number;
  total_permissions: number;
}

export const adminAPI = {
  getStats: () => fetchAPI<AdminStats>('/admin/stats'),
};

// System Users API (admin only - for root/wheel management)
export interface SystemUser {
  username: string;
  uid: number;
  gid: number;
  name: string;
  home_dir: string;
  shell: string;
  groups: string[];
  is_system: boolean;
}

export interface SystemGroup {
  name: string;
  gid: number;
  members: string[];
}

export const systemUsersAPI = {
  list: (includeSystem: boolean = false) =>
    fetchAPI<SystemUser[]>(`/system/users?include_system=${includeSystem}`),

  get: (username: string) =>
    fetchAPI<SystemUser>(`/system/users/${encodeURIComponent(username)}`),

  listGroups: () => fetchAPI<SystemGroup[]>('/system/groups'),
};

// Shares API (admin only - SMB/NFS management)
export interface SMBShareOptions {
  comment?: string;
  valid_users?: string;
  invalid_users?: string;
  write_list?: string;
  read_list?: string;
  create_mask?: string;
  directory_mask?: string;
  force_user?: string;
  force_group?: string;
  veto_files?: string;
  inherit?: boolean;
}

export interface NFSShareOptions {
  allowed_hosts?: string[];
  root_squash?: boolean;
  all_squash?: boolean;
  anon_uid?: number;
  anon_gid?: number;
  sync?: boolean;
  no_subtree_check?: boolean;
  secure?: boolean;
  fsid?: string;
}

export interface Share {
  id: string;
  name: string;
  path: string;
  protocol: 'smb' | 'nfs';
  description: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  allowed_users: string[];
  allowed_groups: string[];
  deny_users: string[];
  deny_groups: string[];
  guest_access: boolean;
  read_only: boolean;
  browsable: boolean;
  smb_options?: SMBShareOptions;
  nfs_options?: NFSShareOptions;
}

export interface CreateShareRequest {
  name: string;
  path: string;
  protocol: 'smb' | 'nfs';
  description?: string;
  enabled?: boolean;
  allowed_users?: string[];
  allowed_groups?: string[];
  deny_users?: string[];
  deny_groups?: string[];
  guest_access?: boolean;
  read_only?: boolean;
  browsable?: boolean;
  smb_options?: SMBShareOptions;
  nfs_options?: NFSShareOptions;
}

export interface UpdateShareRequest {
  name?: string;
  path?: string;
  description?: string;
  enabled?: boolean;
  allowed_users?: string[];
  allowed_groups?: string[];
  deny_users?: string[];
  deny_groups?: string[];
  guest_access?: boolean;
  read_only?: boolean;
  browsable?: boolean;
  smb_options?: SMBShareOptions;
  nfs_options?: NFSShareOptions;
}

export const sharesAPI = {
  list: (protocol?: 'smb' | 'nfs') =>
    fetchAPI<Share[]>(protocol ? `/shares?protocol=${protocol}` : '/shares'),

  get: (id: string) => fetchAPI<Share>(`/shares/${id}`),

  create: (data: CreateShareRequest) =>
    fetchAPI<Share>('/shares', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: UpdateShareRequest) =>
    fetchAPI<Share>(`/shares/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    fetchAPI<void>(`/shares/${id}`, {
      method: 'DELETE',
    }),

  addAccess: (id: string, data: { username?: string; group_name?: string; can_write?: boolean }) =>
    fetchAPI<Share>(`/shares/${id}/access`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  removeAccess: (id: string, data: { username?: string; group_name?: string }) =>
    fetchAPI<Share>(`/shares/${id}/access`, {
      method: 'DELETE',
      body: JSON.stringify(data),
    }),
};

// ============================================
// Storage Management API (Enterprise - Admin Only)
// ============================================

// Storage Overview
export interface StorageOverview {
  total_disks: number;
  total_capacity: number;
  total_used: number;
  total_free: number;
  capacity_human: string;
  used_human: string;
  free_human: string;
  used_percent: number;
  mount_points: MountPoint[];
  disk_health: DiskHealth[];
  alerts: StorageAlert[];
  volume_groups: number;
  raid_arrays: number;
  zfs_pools: number;
  quotas_enabled: boolean;
}

export interface DiskHealth {
  name: string;
  path: string;
  health: 'healthy' | 'warning' | 'critical';
  temperature?: number;
}

export interface StorageAlert {
  level: 'info' | 'warning' | 'critical';
  type: string;
  message: string;
  resource: string;
  timestamp: string;
}

// Disk and Partition Types
export interface DiskInfo {
  name: string;
  path: string;
  size: number;
  size_human: string;
  model: string;
  serial: string;
  type: 'ssd' | 'hdd' | 'nvme' | 'virtual';
  rotational: boolean;
  removable: boolean;
  read_only: boolean;
  partitions: Partition[];
  smart?: SMARTInfo;
  temperature?: number;
}

export interface Partition {
  name: string;
  path: string;
  size: number;
  size_human: string;
  start: number;
  end: number;
  type: string;
  fstype: string;
  uuid: string;
  label: string;
  mountpoint: string;
  mounted: boolean;
  read_only: boolean;
}

export interface SMARTInfo {
  available: boolean;
  healthy: boolean;
  power_on_hours: number;
  power_cycles: number;
  reallocated_sectors: number;
  pending_sectors: number;
  temperature: number;
  overall_status: string;
}

// Mount Point Types
export interface MountPoint {
  device: string;
  mount_path: string;
  fstype: string;
  options: string;
  total: number;
  used: number;
  available: number;
  used_percent: number;
  total_human: string;
  used_human: string;
  available_human: string;
  inodes: number;
  inodes_used: number;
  inodes_free: number;
}

export interface FstabEntry {
  device: string;
  mount_point: string;
  fstype: string;
  options: string;
  dump: number;
  pass: number;
  is_mounted: boolean;
  has_error: boolean;
  error_msg?: string;
}

// LVM Types
export interface VolumeGroup {
  name: string;
  uuid: string;
  size: number;
  size_human: string;
  free: number;
  free_human: string;
  pv_count: number;
  lv_count: number;
  snap_count: number;
  attributes: string;
  physical_volumes: PhysicalVolume[];
  logical_volumes: LogicalVolume[];
}

export interface PhysicalVolume {
  name: string;
  path: string;
  vg_name: string;
  size: number;
  size_human: string;
  free: number;
  free_human: string;
  uuid: string;
  format: string;
}

export interface LogicalVolume {
  name: string;
  path: string;
  vg_name: string;
  size: number;
  size_human: string;
  attributes: string;
  pool_lv?: string;
  data_percent?: number;
  mountpoint?: string;
  fstype?: string;
  origin?: string;
  snap_percent?: number;
}

// RAID Types
export interface RAIDArray {
  name: string;
  path: string;
  level: string;
  state: string;
  size: number;
  size_human: string;
  devices: number;
  active_devices: number;
  spare_devices: number;
  failed_devices: number;
  sync_percent?: number;
  sync_speed?: string;
  members: RAIDMember[];
  uuid: string;
  chunk_size?: string;
}

export interface RAIDMember {
  device: string;
  role: string;
  state: string;
  slot: number;
}

// ZFS Types
export interface ZFSPool {
  name: string;
  size: number;
  size_human: string;
  allocated: number;
  free: number;
  free_human: string;
  fragmentation: number;
  capacity: number;
  health: string;
  dedup_ratio: number;
  altroot?: string;
  vdevs: ZFSVDev[];
  datasets?: ZFSDataset[];
}

export interface ZFSVDev {
  name: string;
  type: string;
  state: string;
  read_errors: number;
  write_errors: number;
  checksum_errors: number;
  children?: ZFSVDev[];
}

export interface ZFSDataset {
  name: string;
  type: string;
  used: number;
  used_human: string;
  available: number;
  available_human: string;
  referenced: number;
  mountpoint?: string;
  compression: string;
  compress_ratio: number;
  quota?: number;
  quota_human?: string;
}

// Quota Types
export interface Quota {
  id: string;
  type: 'user' | 'group' | 'project';
  target: string;
  filesystem: string;
  mount_point: string;
  block_used: number;
  block_soft: number;
  block_hard: number;
  block_grace?: string;
  inode_used: number;
  inode_soft: number;
  inode_hard: number;
  inode_grace?: string;
  used_human: string;
  soft_human: string;
  hard_human: string;
  used_percent: number;
  over_quota: boolean;
  updated_at: string;
}

export interface QuotaStatus {
  filesystem: string;
  mount_point: string;
  user_quota: boolean;
  group_quota: boolean;
  user_state: 'on' | 'off' | 'not_configured';
  group_state: 'on' | 'off' | 'not_configured';
}

export interface QuotaConfig {
  type: 'user' | 'group' | 'project';
  target: string;
  filesystem: string;
  block_soft: number;
  block_hard: number;
  inode_soft: number;
  inode_hard: number;
}

// User Storage Usage
export interface UserStorageUsage {
  username: string;
  uid: number;
  home_dir: string;
  home_dir_size: number;
  home_size_human: string;
  quotas?: Quota[];
  total_used: number;
  total_human: string;
  file_count: number;
  dir_count: number;
}

// I/O Stats
export interface IOStats {
  device: string;
  read_bytes: number;
  write_bytes: number;
  read_ops: number;
  write_ops: number;
  read_time_ms: number;
  write_time_ms: number;
  io_in_progress: number;
  io_time_ms: number;
  read_human: string;
  write_human: string;
}

// System Resources
export interface SystemResources {
  cpu_cores: number;
  cpu_usage: number;
  cpu_model: string;
  memory_total: number;
  memory_used: number;
  memory_free: number;
  memory_percent: number;
  swap_total: number;
  swap_used: number;
  swap_percent: number;
  uptime: number;
  uptime_human: string;
  load_avg_1: number;
  load_avg_5: number;
  load_avg_15: number;
  hostname: string;
  kernel_version: string;
  os_release: string;
  architecture: string;
}

// Service Types
export interface ServiceInfo {
  name: string;
  display_name: string;
  description: string;
  status: 'running' | 'stopped' | 'failed';
  enabled: boolean;
  active_state: string;
  sub_state: string;
  main_pid?: number;
  memory_usage?: number;
  cpu_usage?: string;
}

// Network Types
export interface NetworkInterface {
  name: string;
  mac: string;
  mtu: number;
  state: string;
  speed?: string;
  duplex?: string;
  ipv4_addresses: string[];
  ipv6_addresses: string[];
  rx_bytes: number;
  tx_bytes: number;
  rx_packets: number;
  tx_packets: number;
  rx_errors: number;
  tx_errors: number;
  rx_human: string;
  tx_human: string;
}

// Process Types
export interface Process {
  pid: number;
  user: string;
  cpu: number;
  memory: number;
  vsz: number;
  rss: number;
  state: string;
  started: string;
  command: string;
}

// Log Types
export interface LogEntry {
  timestamp: string;
  priority: number;
  unit: string;
  message: string;
  hostname: string;
}

export interface DMesgEntry {
  timestamp: string;
  level?: string;
  facility?: string;
  message: string;
}

// Hardware Info
export interface HardwareInfo {
  cpu: {
    model: string;
    vendor: string;
    cores: number;
    threads: number;
    max_speed: string;
    current_speed: string;
    cache: string;
    architecture: string;
  };
  memory: {
    total: number;
    total_human: string;
    type: string;
    speed: string;
    slots: number;
    used_slots: number;
  };
  system: {
    manufacturer: string;
    product_name: string;
    version: string;
    serial: string;
    uuid: string;
  };
  bios: {
    vendor: string;
    version: string;
    date: string;
  };
}

// Scheduled Task
export interface ScheduledTask {
  name: string;
  type: 'cron' | 'timer';
  schedule: string;
  command?: string;
  user?: string;
  last_run?: string;
  next_run?: string;
  description?: string;
}

// Directory browsing types
export interface DirectoryEntry {
  name: string;
  path: string;
  is_dir: boolean;
  writable: boolean;
}

export interface BrowseResponse {
  current_path: string;
  parent_path: string;
  entries: DirectoryEntry[];
}

// Available device types
export interface AvailableDevice {
  name: string;
  path: string;
  size: number;
  size_human: string;
  type: string;
  model: string;
  serial: string;
  fstype: string;
  label: string;
  uuid: string;
  is_mounted: boolean;
  mount_point: string;
  parent_disk: string;
  is_whole_disk: boolean;
}

// Storage API
export const storageAPI = {
  // Overview
  getOverview: () => fetchAPI<StorageOverview>('/storage/overview'),

  // Disks and Partitions
  getDisks: () => fetchAPI<DiskInfo[]>('/storage/disks'),

  createPartition: (data: { disk: string; start: string; end: string; fstype?: string; label?: string }) =>
    fetchAPI<{ message: string }>('/storage/partitions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deletePartition: (device: string) =>
    fetchAPI<{ message: string }>(`/storage/partitions?device=${encodeURIComponent(device)}`, {
      method: 'DELETE',
    }),

  formatPartition: (data: { device: string; fstype: string; label?: string; force?: boolean }) =>
    fetchAPI<{ message: string }>('/storage/partitions/format', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Directory browsing for path selection
  browseDirectories: (path?: string) =>
    fetchAPI<BrowseResponse>(`/storage/browse${path ? `?path=${encodeURIComponent(path)}` : ''}`),

  // Available devices for storage setup
  getAvailableDevices: () => fetchAPI<AvailableDevice[]>('/storage/devices/available'),

  // Device setup (format + mount + fstab in one operation)
  setupDevice: (data: {
    device: string;
    fstype: string;
    label?: string;
    mount_point: string;
    persistent?: boolean;
    force?: boolean;
  }) =>
    fetchAPI<{ message: string; device: string; mount_point: string; fstype: string; persistent: boolean }>(
      '/storage/devices/setup',
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    ),

  // Create mount point directory
  createMountPoint: (path: string) =>
    fetchAPI<{ message: string; path: string }>('/storage/mountpoint', {
      method: 'POST',
      body: JSON.stringify({ path }),
    }),

  // Mounts
  getMounts: () => fetchAPI<MountPoint[]>('/storage/mounts'),

  mount: (data: { device: string; mount_point: string; fstype?: string; options?: string; persistent?: boolean }) =>
    fetchAPI<{ message: string }>('/storage/mounts', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  unmount: (path: string, force?: boolean) =>
    fetchAPI<{ message: string }>(`/storage/mounts?path=${encodeURIComponent(path)}&force=${force || false}`, {
      method: 'DELETE',
    }),

  getFstab: () => fetchAPI<FstabEntry[]>('/storage/fstab'),

  // I/O Stats
  getIOStats: () => fetchAPI<IOStats[]>('/storage/iostats'),

  // LVM
  getVolumeGroups: () => fetchAPI<VolumeGroup[]>('/storage/lvm/vgs'),

  createVolumeGroup: (data: { name: string; devices: string[] }) =>
    fetchAPI<{ message: string }>('/storage/lvm/vgs', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteVolumeGroup: (name: string, force?: boolean) =>
    fetchAPI<{ message: string }>(`/storage/lvm/vgs?name=${encodeURIComponent(name)}&force=${force || false}`, {
      method: 'DELETE',
    }),

  createLogicalVolume: (data: { name: string; vg_name: string; size: string; fstype?: string; mount?: string; snapshot?: string }) =>
    fetchAPI<{ message: string; path: string }>('/storage/lvm/lvs', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteLogicalVolume: (vg: string, lv: string, force?: boolean) =>
    fetchAPI<{ message: string }>(`/storage/lvm/lvs?vg=${encodeURIComponent(vg)}&lv=${encodeURIComponent(lv)}&force=${force || false}`, {
      method: 'DELETE',
    }),

  resizeLogicalVolume: (data: { device: string; size: string; resize_fs?: boolean }) =>
    fetchAPI<{ message: string }>('/storage/lvm/lvs/resize', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // RAID
  getRAIDArrays: () => fetchAPI<RAIDArray[]>('/storage/raid'),

  // ZFS
  getZFSPools: () => fetchAPI<ZFSPool[]>('/storage/zfs/pools'),

  // User Storage
  getUserStorageUsage: () => fetchAPI<UserStorageUsage[]>('/storage/users'),

  getSpecificUserStorage: (username: string) =>
    fetchAPI<UserStorageUsage>(`/storage/users/${encodeURIComponent(username)}`),

  scanFilesystem: (path?: string, depth?: number) =>
    fetchAPI<{ path: string; size: number; size_human: string }[]>(
      `/storage/scan?path=${encodeURIComponent(path || '/')}&depth=${depth || 2}`
    ),

  findLargeFiles: (path?: string, limit?: number, minSize?: string) =>
    fetchAPI<{ path: string; size: number; size_human: string; owner: string; modified: string }[]>(
      `/storage/large-files?path=${encodeURIComponent(path || '/')}&limit=${limit || 50}&min_size=${minSize || '100M'}`
    ),

  checkHealth: (device: string) =>
    fetchAPI<{ device: string; fstype: string; status: string; details: string; last_check?: string; errors: number }>(
      `/storage/health?device=${encodeURIComponent(device)}`
    ),
};

// Quotas API
export const quotasAPI = {
  list: (type?: 'user' | 'group', filesystem?: string) => {
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    if (filesystem) params.set('filesystem', filesystem);
    return fetchAPI<Quota[]>(`/quotas/?${params.toString()}`);
  },

  getUserQuota: (username: string) =>
    fetchAPI<Quota[]>(`/quotas/user?username=${encodeURIComponent(username)}`),

  getGroupQuota: (groupname: string) =>
    fetchAPI<Quota[]>(`/quotas/group?groupname=${encodeURIComponent(groupname)}`),

  setQuota: (data: QuotaConfig) =>
    fetchAPI<{ message: string }>('/quotas/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  removeQuota: (type: 'user' | 'group', target: string, filesystem: string) =>
    fetchAPI<{ message: string }>(
      `/quotas/?type=${type}&target=${encodeURIComponent(target)}&filesystem=${encodeURIComponent(filesystem)}`,
      { method: 'DELETE' }
    ),

  getStatus: () => fetchAPI<QuotaStatus[]>('/quotas/status'),

  enable: (data: { filesystem: string; user_quota?: boolean; group_quota?: boolean }) =>
    fetchAPI<{ message: string }>('/quotas/enable', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  disable: (filesystem: string) =>
    fetchAPI<{ message: string }>(`/quotas/disable?filesystem=${encodeURIComponent(filesystem)}`, {
      method: 'DELETE',
    }),
};

// System Management API
export const systemAPI = {
  // Resources
  getResources: () => fetchAPI<SystemResources>('/system/resources'),

  getHardware: () => fetchAPI<HardwareInfo>('/system/hardware'),

  // Services
  getServices: (filter?: 'storage' | 'network' | 'all') =>
    fetchAPI<ServiceInfo[]>(`/system/services${filter ? `?filter=${filter}` : ''}`),

  controlService: (service: string, action: 'start' | 'stop' | 'restart' | 'enable' | 'disable' | 'reload') =>
    fetchAPI<{ message: string }>('/system/services', {
      method: 'POST',
      body: JSON.stringify({ service, action }),
    }),

  // Network
  getNetworkInterfaces: () => fetchAPI<NetworkInterface[]>('/system/network'),

  // Processes
  getProcesses: (sort?: 'cpu' | 'memory', limit?: number) =>
    fetchAPI<Process[]>(`/system/processes?sort=${sort || 'cpu'}&limit=${limit || 50}`),

  killProcess: (pid: number, signal?: string) =>
    fetchAPI<{ message: string }>('/system/processes/kill', {
      method: 'POST',
      body: JSON.stringify({ pid, signal: signal || 'TERM' }),
    }),

  // Logs
  getLogs: (options?: { unit?: string; lines?: number; priority?: string }) => {
    const params = new URLSearchParams();
    if (options?.unit) params.set('unit', options.unit);
    if (options?.lines) params.set('lines', options.lines.toString());
    if (options?.priority) params.set('priority', options.priority);
    return fetchAPI<LogEntry[]>(`/system/logs?${params.toString()}`);
  },

  getDmesg: (options?: { level?: string; facility?: string }) => {
    const params = new URLSearchParams();
    if (options?.level) params.set('level', options.level);
    if (options?.facility) params.set('facility', options.facility);
    return fetchAPI<DMesgEntry[]>(`/system/dmesg?${params.toString()}`);
  },

  // Scheduled Tasks
  getScheduledTasks: () => fetchAPI<ScheduledTask[]>('/system/tasks'),

  // Power Control
  power: (action: 'reboot' | 'poweroff' | 'suspend' | 'hibernate') =>
    fetchAPI<{ message: string }>('/system/power', {
      method: 'POST',
      body: JSON.stringify({ action }),
    }),
};

// ============================================================================
// Storage Pools & Share Zones
// ============================================================================

export interface StoragePool {
  id: string;
  name: string;
  path: string;
  description: string;
  enabled: boolean;
  total_space: number;
  used_space: number;
  free_space: number;
  reserved: number;
  max_file_size: number;
  allowed_types: string[];
  denied_types: string[];
  default_user_quota: number;
  default_group_quota: number;
  created_at: string;
  updated_at: string;
}

// Zone SMB options
export interface ZoneSMBOptions {
  share_name: string;
  comment: string;
  valid_users: string;
  invalid_users: string;
  write_list: string;
  read_list: string;
  create_mask: string;
  directory_mask: string;
  force_user: string;
  force_group: string;
  veto_files: string;
  inherit: boolean;
}

// Zone NFS options
export interface ZoneNFSOptions {
  export_path: string;
  allowed_hosts: string[];
  root_squash: boolean;
  all_squash: boolean;
  anon_uid: number;
  anon_gid: number;
  sync: boolean;
  no_subtree_check: boolean;
  secure: boolean;
  fsid: string;
}

// Zone web options
export interface ZoneWebOptions {
  public_enabled: boolean;
  max_link_expiry: number;
  allow_download: boolean;
  allow_upload: boolean;
  allow_preview: boolean;
  allow_listing: boolean;
  require_auth: boolean;
  custom_branding?: string;
}

export interface ShareZone {
  id: string;
  pool_id: string;
  name: string;
  path: string;
  description: string;
  zone_type: 'personal' | 'group' | 'public';
  enabled: boolean;
  auto_provision: boolean;
  provision_template: string;
  allowed_users: string[];
  allowed_groups: string[];
  deny_users: string[];
  deny_groups: string[];
  allow_network_shares: boolean;
  allow_web_shares: boolean;
  allow_guest_access: boolean;
  smb_enabled: boolean;
  nfs_enabled: boolean;
  smb_options?: ZoneSMBOptions;
  nfs_options?: ZoneNFSOptions;
  web_options?: ZoneWebOptions;
  max_quota_per_user: number;
  read_only: boolean;
  browsable: boolean;
  created_at: string;
  updated_at: string;
}

export interface PoolUsage {
  pool: StoragePool;
  zone_count: number;
  share_count: number;
  usage_percent: number;
  available: number;
}

export interface ZoneUsage {
  zone: ShareZone;
  pool: StoragePool;
  full_path: string;
  total_size: number;
  file_count: number;
  dir_count: number;
  share_count: number;
}

export const poolsAPI = {
  list: () => fetchAPI<StoragePool[]>('/admin/pools'),

  get: (id: string) => fetchAPI<StoragePool>(`/admin/pools/${id}`),

  create: (pool: Partial<StoragePool>) =>
    fetchAPI<StoragePool>('/admin/pools', {
      method: 'POST',
      body: JSON.stringify(pool),
    }),

  update: (id: string, updates: Partial<StoragePool>) =>
    fetchAPI<StoragePool>(`/admin/pools/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  delete: (id: string) =>
    fetchAPI<{ message: string }>(`/admin/pools/${id}`, {
      method: 'DELETE',
    }),

  getUsage: (id: string) => fetchAPI<PoolUsage>(`/admin/pools/${id}/usage`),

  getZones: (id: string) => fetchAPI<ShareZone[]>(`/admin/pools/${id}/zones`),
};

export const zonesAPI = {
  list: (poolId?: string) => {
    const params = poolId ? `?pool_id=${poolId}` : '';
    return fetchAPI<ShareZone[]>(`/admin/zones${params}`);
  },

  get: (id: string) => fetchAPI<ShareZone>(`/admin/zones/${id}`),

  create: (zone: Partial<ShareZone>) =>
    fetchAPI<ShareZone>('/admin/zones', {
      method: 'POST',
      body: JSON.stringify(zone),
    }),

  update: (id: string, updates: Partial<ShareZone>) =>
    fetchAPI<ShareZone>(`/admin/zones/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  delete: (id: string) =>
    fetchAPI<{ message: string }>(`/admin/zones/${id}`, {
      method: 'DELETE',
    }),

  getUsage: (id: string) => fetchAPI<ZoneUsage>(`/admin/zones/${id}/usage`),

  provisionUser: (zoneId: string, username: string) =>
    fetchAPI<{ message: string; path: string }>(`/admin/zones/${zoneId}/provision`, {
      method: 'POST',
      body: JSON.stringify({ username }),
    }),
};

// ============================================================================
// Share Links (Web Sharing)
// ============================================================================

export interface ShareLink {
  id: string;
  share_id?: string;
  owner_id: string;
  target_path: string;
  target_type: 'file' | 'folder';
  target_name: string;
  token: string;
  password_hash?: string;
  expires_at?: string;
  max_downloads: number;
  download_count: number;
  max_views: number;
  view_count: number;
  allow_download: boolean;
  allow_preview: boolean;
  allow_upload: boolean;
  allow_listing: boolean;
  name: string;
  description: string;
  custom_message?: string;
  show_owner: boolean;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  last_accessed?: string;
}

export interface CreateShareLinkRequest {
  target_path: string;
  name?: string;
  description?: string;
  password?: string;
  expires_in?: number; // hours, 0 = default (7 days), -1 = no expiry
  max_downloads?: number;
  max_views?: number;
  allow_download?: boolean;
  allow_preview?: boolean;
  allow_upload?: boolean;
  allow_listing?: boolean;
  show_owner?: boolean;
  custom_message?: string;
}

export const shareLinksAPI = {
  // Get my share links
  list: () => fetchAPI<ShareLink[]>('/links'),

  // Admin: get all share links
  listAll: () => fetchAPI<ShareLink[]>('/admin/links'),

  get: (id: string) => fetchAPI<ShareLink>(`/links/${id}`),

  create: (request: CreateShareLinkRequest) =>
    fetchAPI<ShareLink>('/links', {
      method: 'POST',
      body: JSON.stringify(request),
    }),

  update: (id: string, updates: Partial<ShareLink> & { password?: string }) =>
    fetchAPI<ShareLink>(`/links/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  delete: (id: string) =>
    fetchAPI<{ message: string }>(`/links/${id}`, {
      method: 'DELETE',
    }),

  // Generate share URL
  getShareUrl: (link: ShareLink) => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    return `${baseUrl}/share/?token=${link.token}`;
  },
};

// ============================================================================
// Public Share Access (No Auth Required)
// ============================================================================

export interface PublicShareInfo {
  token: string;
  name: string;
  description?: string;
  target_type: 'file' | 'folder';
  target_name: string;
  size?: number;
  custom_message?: string;
  show_owner: boolean;
  owner_name?: string;
  allow_download: boolean;
  allow_preview: boolean;
  allow_upload: boolean;
  allow_listing: boolean;
  requires_password: boolean;
  expires_at?: string;
  created_at: string;
}

export interface PublicFileInfo {
  name: string;
  path: string;
  size: number;
  is_dir: boolean;
  mod_time: string;
}

// Public API doesn't use the standard fetchAPI since it doesn't require auth
async function fetchPublic<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers: HeadersInit = {
    ...options.headers,
  };

  if (!(options.body instanceof FormData)) {
    (headers as Record<string, string>)['Content-Type'] = 'application/json';
  }

  const response = await fetch(endpoint, { ...options, headers });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return response.json();
  }

  return {} as T;
}

export const publicShareAPI = {
  // Get public share info
  getInfo: (token: string) => fetchPublic<PublicShareInfo>(`/s/${token}`),

  // Verify password
  verifyPassword: (token: string, password: string) =>
    fetchPublic<{ valid: boolean }>(`/s/${token}/verify`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  // List folder contents
  list: (token: string, path?: string) => {
    const params = path ? `?path=${encodeURIComponent(path)}` : '';
    return fetchPublic<PublicFileInfo[]>(`/s/${token}/list${params}`);
  },

  // Get download URL
  getDownloadUrl: (token: string, path?: string) => {
    const params = path ? `?path=${encodeURIComponent(path)}` : '';
    return `/s/${token}/download${params}`;
  },

  // Get preview URL
  getPreviewUrl: (token: string, path?: string) => {
    const params = path ? `?path=${encodeURIComponent(path)}` : '';
    return `/s/${token}/preview${params}`;
  },

  // Upload file (for folders with upload enabled)
  upload: async (token: string, file: File, path?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (path) {
      formData.append('path', path);
    }

    const response = await fetch(`/s/${token}/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `HTTP ${response.status}`);
    }

    return response.json();
  },
};
