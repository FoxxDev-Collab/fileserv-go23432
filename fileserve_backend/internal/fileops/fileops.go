package fileops

import (
	"errors"
	"fmt"
	"io"
	"mime"
	"os"
	osuser "os/user"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"syscall"
	"time"
)

// ========================================================================
// UID/GID Cache - Eliminates per-file syscalls for user/group lookups
// ========================================================================

var (
	uidCache     sync.Map // map[uint32]string - UID -> username
	gidCache     sync.Map // map[uint32]string - GID -> group name
	cacheExpiry  time.Time
	cacheMutex   sync.RWMutex
	cacheTTL     = 5 * time.Minute // Refresh cache every 5 minutes
)

// InitOwnershipCache pre-populates the UID/GID cache from /etc/passwd and /etc/group
// Call this at startup for best performance
func InitOwnershipCache() {
	refreshCache()
}

// refreshCache reloads all users and groups into the cache
func refreshCache() {
	cacheMutex.Lock()
	defer cacheMutex.Unlock()

	// Clear existing cache
	uidCache = sync.Map{}
	gidCache = sync.Map{}

	// Load all users
	// Note: This reads /etc/passwd which is fast
	if file, err := os.Open("/etc/passwd"); err == nil {
		defer file.Close()
		var line string
		for {
			_, err := fmt.Fscanln(file, &line)
			if err != nil {
				break
			}
			parts := strings.Split(line, ":")
			if len(parts) >= 3 {
				var uid uint32
				fmt.Sscanf(parts[2], "%d", &uid)
				uidCache.Store(uid, parts[0])
			}
		}
	}

	// Also try the os/user package for any we might have missed
	// This handles NSS/LDAP users
	for uid := uint32(0); uid < 65534; uid++ {
		if _, ok := uidCache.Load(uid); !ok {
			if u, err := osuser.LookupId(fmt.Sprintf("%d", uid)); err == nil {
				uidCache.Store(uid, u.Username)
			}
		}
		// Only check common UIDs to avoid slow lookups
		if uid > 1000 && uid < 60000 {
			uid += 99 // Skip in batches for non-system users
		}
	}

	// Load all groups from /etc/group
	if file, err := os.Open("/etc/group"); err == nil {
		defer file.Close()
		var line string
		for {
			_, err := fmt.Fscanln(file, &line)
			if err != nil {
				break
			}
			parts := strings.Split(line, ":")
			if len(parts) >= 3 {
				var gid uint32
				fmt.Sscanf(parts[2], "%d", &gid)
				gidCache.Store(gid, parts[0])
			}
		}
	}

	cacheExpiry = time.Now().Add(cacheTTL)
}

// lookupUsername returns cached username for UID, or fetches and caches it
func lookupUsername(uid uint32) string {
	// Check if cache needs refresh
	cacheMutex.RLock()
	expired := time.Now().After(cacheExpiry)
	cacheMutex.RUnlock()

	if expired {
		go refreshCache() // Refresh in background, don't block
	}

	// Try cache first
	if name, ok := uidCache.Load(uid); ok {
		return name.(string)
	}

	// Cache miss - do the syscall and cache result
	if u, err := osuser.LookupId(fmt.Sprintf("%d", uid)); err == nil {
		uidCache.Store(uid, u.Username)
		return u.Username
	}

	// Fall back to numeric
	result := fmt.Sprintf("%d", uid)
	uidCache.Store(uid, result)
	return result
}

// lookupGroupname returns cached group name for GID, or fetches and caches it
func lookupGroupname(gid uint32) string {
	// Check if cache needs refresh
	cacheMutex.RLock()
	expired := time.Now().After(cacheExpiry)
	cacheMutex.RUnlock()

	if expired {
		go refreshCache() // Refresh in background, don't block
	}

	// Try cache first
	if name, ok := gidCache.Load(gid); ok {
		return name.(string)
	}

	// Cache miss - do the syscall and cache result
	if g, err := osuser.LookupGroupId(fmt.Sprintf("%d", gid)); err == nil {
		gidCache.Store(gid, g.Name)
		return g.Name
	}

	// Fall back to numeric
	result := fmt.Sprintf("%d", gid)
	gidCache.Store(gid, result)
	return result
}

// ========================================================================
// File Info Types
// ========================================================================

type FileInfo struct {
	Name      string    `json:"name"`
	Path      string    `json:"path"`
	Size      int64     `json:"size"`
	IsDir     bool      `json:"is_dir"`
	ModTime   time.Time `json:"mod_time"`
	Mode      string    `json:"mode"`
	Owner     string    `json:"owner"`
	Group     string    `json:"group"`
	UID       uint32    `json:"uid"`
	GID       uint32    `json:"gid"`
	MimeType  string    `json:"mime_type,omitempty"`
	Extension string    `json:"extension,omitempty"`
}

// ListOptions configures directory listing behavior
type ListOptions struct {
	Limit      int    // Max items to return (0 = unlimited)
	Offset     int    // Items to skip
	SortBy     string // "name", "size", "modified", "type"
	SortDesc   bool   // Sort descending
	FilterType string // "file", "folder", or "" for all
}

// ListResult contains paginated file listing results
type ListResult struct {
	Files      []FileInfo `json:"files"`
	Total      int        `json:"total"`
	Limit      int        `json:"limit"`
	Offset     int        `json:"offset"`
	HasMore    bool       `json:"has_more"`
}

// ========================================================================
// File Ownership (now uses cache)
// ========================================================================

// getFileOwnership retrieves owner and group information from file stat
// Now uses cached lookups - O(1) instead of syscall per file
func getFileOwnership(info os.FileInfo) (owner, group string, uid, gid uint32) {
	uid = 0
	gid = 0
	owner = "unknown"
	group = "unknown"

	if stat, ok := info.Sys().(*syscall.Stat_t); ok {
		uid = stat.Uid
		gid = stat.Gid
		owner = lookupUsername(uid)
		group = lookupGroupname(gid)
	}

	return owner, group, uid, gid
}

// ========================================================================
// MIME Type Detection
// ========================================================================

// Common MIME types - defined once at package level for efficiency
var commonMimeTypes = map[string]string{
	".txt":  "text/plain",
	".html": "text/html",
	".htm":  "text/html",
	".css":  "text/css",
	".js":   "application/javascript",
	".json": "application/json",
	".xml":  "application/xml",
	".pdf":  "application/pdf",
	".zip":  "application/zip",
	".gz":   "application/gzip",
	".tar":  "application/x-tar",
	".rar":  "application/vnd.rar",
	".7z":   "application/x-7z-compressed",
	".doc":  "application/msword",
	".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	".xls":  "application/vnd.ms-excel",
	".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	".ppt":  "application/vnd.ms-powerpoint",
	".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
	".jpg":  "image/jpeg",
	".jpeg": "image/jpeg",
	".png":  "image/png",
	".gif":  "image/gif",
	".svg":  "image/svg+xml",
	".webp": "image/webp",
	".ico":  "image/x-icon",
	".mp3":  "audio/mpeg",
	".wav":  "audio/wav",
	".ogg":  "audio/ogg",
	".mp4":  "video/mp4",
	".webm": "video/webm",
	".avi":  "video/x-msvideo",
	".mkv":  "video/x-matroska",
	".mov":  "video/quicktime",
	".go":   "text/x-go",
	".py":   "text/x-python",
	".rs":   "text/x-rust",
	".ts":   "text/typescript",
	".tsx":  "text/typescript-jsx",
	".jsx":  "text/javascript-jsx",
	".md":   "text/markdown",
	".yaml": "text/yaml",
	".yml":  "text/yaml",
	".sh":   "application/x-sh",
	".bash": "application/x-sh",
	".sql":  "application/sql",
	".csv":  "text/csv",
	".log":  "text/plain",
	".conf": "text/plain",
	".cfg":  "text/plain",
	".ini":  "text/plain",
	".env":  "text/plain",
}

// getMimeType returns the MIME type based on file extension
func getMimeType(filename string) string {
	ext := strings.ToLower(filepath.Ext(filename))
	if ext == "" {
		return "application/octet-stream"
	}

	if mimeType, ok := commonMimeTypes[ext]; ok {
		return mimeType
	}

	// Fall back to Go's mime package
	if mimeType := mime.TypeByExtension(ext); mimeType != "" {
		return mimeType
	}

	return "application/octet-stream"
}

// ========================================================================
// Path Validation
// ========================================================================

// ValidatePath ensures the path doesn't contain path traversal attacks
func ValidatePath(basePath, requestedPath string) (string, error) {
	// Clean the paths
	basePath = filepath.Clean(basePath)
	requestedPath = filepath.Clean(requestedPath)

	// Join paths
	fullPath := filepath.Join(basePath, requestedPath)

	// Ensure the full path is within the base path
	if !strings.HasPrefix(fullPath, basePath) {
		return "", errors.New("invalid path: path traversal detected")
	}

	return fullPath, nil
}

// ========================================================================
// Directory Listing (with pagination support)
// ========================================================================

// ListDirectory lists files and directories in a path (legacy, no pagination)
func ListDirectory(basePath, requestedPath string) ([]FileInfo, error) {
	result, err := ListDirectoryPaginated(basePath, requestedPath, ListOptions{})
	if err != nil {
		return nil, err
	}
	return result.Files, nil
}

// ListDirectoryPaginated lists files with pagination, sorting, and filtering
// basePath is the root directory, requestedPath is the relative path within it
func ListDirectoryPaginated(basePath, requestedPath string, opts ListOptions) (*ListResult, error) {
	fullPath, err := ValidatePath(basePath, requestedPath)
	if err != nil {
		return nil, err
	}
	return listDirectoryPaginatedInternal(fullPath, requestedPath, opts)
}

// ListDirectoryPaginatedDirect lists files when the full path is already resolved
// fullPath is the absolute path to list, relativePath is used for building paths in response
func ListDirectoryPaginatedDirect(fullPath, relativePath string, opts ListOptions) (*ListResult, error) {
	return listDirectoryPaginatedInternal(fullPath, relativePath, opts)
}

// listDirectoryPaginatedInternal is the internal implementation
func listDirectoryPaginatedInternal(fullPath, relativePath string, opts ListOptions) (*ListResult, error) {
	// Check if path exists
	stat, err := os.Stat(fullPath)
	if err != nil {
		return nil, err
	}

	if !stat.IsDir() {
		return nil, errors.New("path is not a directory")
	}

	entries, err := os.ReadDir(fullPath)
	if err != nil {
		return nil, err
	}

	// OPTIMIZATION: For name-sorted listings (the default), we can sort DirEntry
	// objects by name without calling stat(), then only stat the paginated slice.
	// This reduces stat() calls from O(n) to O(page_size) for large directories.
	sortByName := opts.SortBy == "" || opts.SortBy == "name"

	// Apply type filter first (doesn't need stat)
	if opts.FilterType != "" {
		filtered := make([]os.DirEntry, 0, len(entries))
		for _, entry := range entries {
			if opts.FilterType == "file" && entry.IsDir() {
				continue
			}
			if opts.FilterType == "folder" && !entry.IsDir() {
				continue
			}
			filtered = append(filtered, entry)
		}
		entries = filtered
	}

	total := len(entries)

	// Fast path: name sorting with pagination - only stat what we return
	if sortByName && opts.Limit > 0 {
		// Sort DirEntry by name (folders first, then alphabetical)
		sort.Slice(entries, func(i, j int) bool {
			if entries[i].IsDir() != entries[j].IsDir() {
				return entries[i].IsDir()
			}
			less := strings.ToLower(entries[i].Name()) < strings.ToLower(entries[j].Name())
			if opts.SortDesc {
				return !less
			}
			return less
		})

		// Apply pagination to entries BEFORE stat
		if opts.Offset > 0 {
			if opts.Offset >= len(entries) {
				entries = []os.DirEntry{}
			} else {
				entries = entries[opts.Offset:]
			}
		}
		if len(entries) > opts.Limit {
			entries = entries[:opts.Limit]
		}

		// Now only stat the paginated slice
		files := make([]FileInfo, 0, len(entries))
		for _, entry := range entries {
			info, err := entry.Info()
			if err != nil {
				continue
			}

			entryPath := filepath.Join(relativePath, entry.Name())
			owner, group, uid, gid := getFileOwnership(info)

			ext := ""
			mimeType := ""
			if !entry.IsDir() {
				ext = strings.TrimPrefix(strings.ToLower(filepath.Ext(entry.Name())), ".")
				mimeType = getMimeType(entry.Name())
			}

			files = append(files, FileInfo{
				Name:      entry.Name(),
				Path:      entryPath,
				Size:      info.Size(),
				IsDir:     entry.IsDir(),
				ModTime:   info.ModTime(),
				Mode:      info.Mode().String(),
				Owner:     owner,
				Group:     group,
				UID:       uid,
				GID:       gid,
				MimeType:  mimeType,
				Extension: ext,
			})
		}

		return &ListResult{
			Files:   files,
			Total:   total,
			Limit:   opts.Limit,
			Offset:  opts.Offset,
			HasMore: opts.Offset+len(files) < total,
		}, nil
	}

	// Slow path: need to stat all files for sorting by size/modified/type/owner
	// Build file info list
	files := make([]FileInfo, 0, len(entries))
	for _, entry := range entries {
		info, err := entry.Info()
		if err != nil {
			continue
		}

		entryPath := filepath.Join(relativePath, entry.Name())
		owner, group, uid, gid := getFileOwnership(info)

		ext := ""
		mimeType := ""
		if !entry.IsDir() {
			ext = strings.TrimPrefix(strings.ToLower(filepath.Ext(entry.Name())), ".")
			mimeType = getMimeType(entry.Name())
		}

		files = append(files, FileInfo{
			Name:      entry.Name(),
			Path:      entryPath,
			Size:      info.Size(),
			IsDir:     entry.IsDir(),
			ModTime:   info.ModTime(),
			Mode:      info.Mode().String(),
			Owner:     owner,
			Group:     group,
			UID:       uid,
			GID:       gid,
			MimeType:  mimeType,
			Extension: ext,
		})
	}

	// Sort files
	sortFiles(files, opts.SortBy, opts.SortDesc)

	// Apply pagination
	if opts.Offset > 0 {
		if opts.Offset >= len(files) {
			files = []FileInfo{}
		} else {
			files = files[opts.Offset:]
		}
	}

	if opts.Limit > 0 && len(files) > opts.Limit {
		files = files[:opts.Limit]
	}

	return &ListResult{
		Files:   files,
		Total:   total,
		Limit:   opts.Limit,
		Offset:  opts.Offset,
		HasMore: opts.Offset+len(files) < total,
	}, nil
}

// sortFiles sorts the file list based on the specified field
func sortFiles(files []FileInfo, sortBy string, desc bool) {
	// Default: folders first, then by name
	sort.Slice(files, func(i, j int) bool {
		// Folders always come first
		if files[i].IsDir != files[j].IsDir {
			return files[i].IsDir
		}

		var less bool
		switch sortBy {
		case "size":
			less = files[i].Size < files[j].Size
		case "modified":
			less = files[i].ModTime.Before(files[j].ModTime)
		case "type":
			less = files[i].Extension < files[j].Extension
		case "owner":
			less = files[i].Owner < files[j].Owner
		default: // "name" or empty
			less = strings.ToLower(files[i].Name) < strings.ToLower(files[j].Name)
		}

		if desc {
			return !less
		}
		return less
	})
}

// ========================================================================
// Directory Operations
// ========================================================================

// CreateDirectory creates a new directory
func CreateDirectory(basePath, requestedPath string) error {
	fullPath, err := ValidatePath(basePath, requestedPath)
	if err != nil {
		return err
	}

	return os.MkdirAll(fullPath, 0755)
}

// DeletePath removes a file or directory
func DeletePath(basePath, requestedPath string) error {
	fullPath, err := ValidatePath(basePath, requestedPath)
	if err != nil {
		return err
	}

	// Don't allow deleting the base directory itself
	if fullPath == basePath {
		return errors.New("cannot delete base directory")
	}

	return os.RemoveAll(fullPath)
}

// MovePath moves or renames a file or directory
func MovePath(basePath, oldPath, newPath string) error {
	fullOldPath, err := ValidatePath(basePath, oldPath)
	if err != nil {
		return err
	}

	fullNewPath, err := ValidatePath(basePath, newPath)
	if err != nil {
		return err
	}

	// Don't allow moving the base directory itself
	if fullOldPath == basePath {
		return errors.New("cannot move base directory")
	}

	// Ensure parent directory of new path exists
	newDir := filepath.Dir(fullNewPath)
	if err := os.MkdirAll(newDir, 0755); err != nil {
		return err
	}

	return os.Rename(fullOldPath, fullNewPath)
}

// ========================================================================
// File Operations
// ========================================================================

// SaveFile saves uploaded file data to disk
func SaveFile(basePath, requestedPath string, reader io.Reader) error {
	fullPath, err := ValidatePath(basePath, requestedPath)
	if err != nil {
		return err
	}

	// Ensure parent directory exists
	dir := filepath.Dir(fullPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	// Create the file
	file, err := os.Create(fullPath)
	if err != nil {
		return err
	}
	defer file.Close()

	// Copy data
	_, err = io.Copy(file, reader)
	return err
}

// OpenFile opens a file for reading
func OpenFile(basePath, requestedPath string) (*os.File, error) {
	fullPath, err := ValidatePath(basePath, requestedPath)
	if err != nil {
		return nil, err
	}

	return os.Open(fullPath)
}

// ========================================================================
// Raw Directory Listing (for zone files)
// ========================================================================

// ListDirectoryRaw lists files in an absolute path (no base path validation)
// Use this only after path has been validated elsewhere
func ListDirectoryRaw(fullPath string, relativePath ...string) ([]FileInfo, error) {
	result, err := ListDirectoryRawPaginated(fullPath, ListOptions{}, relativePath...)
	if err != nil {
		return nil, err
	}
	return result.Files, nil
}

// ListDirectoryRawPaginated lists files with pagination in an absolute path
func ListDirectoryRawPaginated(fullPath string, opts ListOptions, relativePath ...string) (*ListResult, error) {
	// Check if path exists
	stat, err := os.Stat(fullPath)
	if err != nil {
		return nil, err
	}

	if !stat.IsDir() {
		return nil, errors.New("path is not a directory")
	}

	entries, err := os.ReadDir(fullPath)
	if err != nil {
		return nil, err
	}

	// Determine path prefix
	prefix := ""
	if len(relativePath) > 0 && relativePath[0] != "" && relativePath[0] != "/" {
		prefix = strings.TrimPrefix(relativePath[0], "/")
		if prefix != "" && !strings.HasSuffix(prefix, "/") {
			prefix += "/"
		}
	}

	// OPTIMIZATION: Same as listDirectoryPaginatedInternal - defer stat() for name sorting
	sortByName := opts.SortBy == "" || opts.SortBy == "name"

	// Apply type filter first (doesn't need stat)
	if opts.FilterType != "" {
		filtered := make([]os.DirEntry, 0, len(entries))
		for _, entry := range entries {
			if opts.FilterType == "file" && entry.IsDir() {
				continue
			}
			if opts.FilterType == "folder" && !entry.IsDir() {
				continue
			}
			filtered = append(filtered, entry)
		}
		entries = filtered
	}

	total := len(entries)

	// Fast path: name sorting with pagination - only stat what we return
	if sortByName && opts.Limit > 0 {
		// Sort DirEntry by name (folders first, then alphabetical)
		sort.Slice(entries, func(i, j int) bool {
			if entries[i].IsDir() != entries[j].IsDir() {
				return entries[i].IsDir()
			}
			less := strings.ToLower(entries[i].Name()) < strings.ToLower(entries[j].Name())
			if opts.SortDesc {
				return !less
			}
			return less
		})

		// Apply pagination to entries BEFORE stat
		if opts.Offset > 0 {
			if opts.Offset >= len(entries) {
				entries = []os.DirEntry{}
			} else {
				entries = entries[opts.Offset:]
			}
		}
		if len(entries) > opts.Limit {
			entries = entries[:opts.Limit]
		}

		// Now only stat the paginated slice
		files := make([]FileInfo, 0, len(entries))
		for _, entry := range entries {
			info, err := entry.Info()
			if err != nil {
				continue
			}

			owner, group, uid, gid := getFileOwnership(info)

			ext := ""
			mimeType := ""
			if !entry.IsDir() {
				ext = strings.TrimPrefix(strings.ToLower(filepath.Ext(entry.Name())), ".")
				mimeType = getMimeType(entry.Name())
			}

			files = append(files, FileInfo{
				Name:      entry.Name(),
				Path:      prefix + entry.Name(),
				Size:      info.Size(),
				IsDir:     entry.IsDir(),
				ModTime:   info.ModTime(),
				Mode:      info.Mode().String(),
				Owner:     owner,
				Group:     group,
				UID:       uid,
				GID:       gid,
				MimeType:  mimeType,
				Extension: ext,
			})
		}

		return &ListResult{
			Files:   files,
			Total:   total,
			Limit:   opts.Limit,
			Offset:  opts.Offset,
			HasMore: opts.Offset+len(files) < total,
		}, nil
	}

	// Slow path: need to stat all files for sorting by size/modified/type/owner
	files := make([]FileInfo, 0, len(entries))
	for _, entry := range entries {
		info, err := entry.Info()
		if err != nil {
			continue
		}

		owner, group, uid, gid := getFileOwnership(info)

		ext := ""
		mimeType := ""
		if !entry.IsDir() {
			ext = strings.TrimPrefix(strings.ToLower(filepath.Ext(entry.Name())), ".")
			mimeType = getMimeType(entry.Name())
		}

		files = append(files, FileInfo{
			Name:      entry.Name(),
			Path:      prefix + entry.Name(),
			Size:      info.Size(),
			IsDir:     entry.IsDir(),
			ModTime:   info.ModTime(),
			Mode:      info.Mode().String(),
			Owner:     owner,
			Group:     group,
			UID:       uid,
			GID:       gid,
			MimeType:  mimeType,
			Extension: ext,
		})
	}

	// Sort files
	sortFiles(files, opts.SortBy, opts.SortDesc)

	// Apply pagination
	if opts.Offset > 0 {
		if opts.Offset >= len(files) {
			files = []FileInfo{}
		} else {
			files = files[opts.Offset:]
		}
	}

	if opts.Limit > 0 && len(files) > opts.Limit {
		files = files[:opts.Limit]
	}

	return &ListResult{
		Files:   files,
		Total:   total,
		Limit:   opts.Limit,
		Offset:  opts.Offset,
		HasMore: opts.Offset+len(files) < total,
	}, nil
}

// ========================================================================
// Single File Info
// ========================================================================

// GetFileInfo gets information about a file or directory
func GetFileInfo(basePath, requestedPath string) (*FileInfo, error) {
	fullPath, err := ValidatePath(basePath, requestedPath)
	if err != nil {
		return nil, err
	}

	stat, err := os.Stat(fullPath)
	if err != nil {
		return nil, err
	}

	owner, group, uid, gid := getFileOwnership(stat)

	ext := ""
	mimeType := ""
	if !stat.IsDir() {
		ext = strings.TrimPrefix(strings.ToLower(filepath.Ext(stat.Name())), ".")
		mimeType = getMimeType(stat.Name())
	}

	return &FileInfo{
		Name:      stat.Name(),
		Path:      requestedPath,
		Size:      stat.Size(),
		IsDir:     stat.IsDir(),
		ModTime:   stat.ModTime(),
		Mode:      stat.Mode().String(),
		Owner:     owner,
		Group:     group,
		UID:       uid,
		GID:       gid,
		MimeType:  mimeType,
		Extension: ext,
	}, nil
}
