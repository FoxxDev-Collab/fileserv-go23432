package fileops

import (
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// TransferOptions configures file transfer behavior
type TransferOptions struct {
	// Download options
	ForceDownload bool   // Set Content-Disposition: attachment
	Filename      string // Override filename in Content-Disposition
	ContentType   string // Override auto-detected content type

	// Upload validation
	MaxFileSize   int64    // Maximum allowed file size (0 = unlimited)
	AllowedTypes  []string // Allowed MIME types (empty = all allowed)
	DeniedTypes   []string // Denied MIME types
	AllowedExts   []string // Allowed extensions (empty = all allowed)
	DeniedExts    []string // Denied extensions
}

// ServeFileWithRange serves a file with HTTP Range support for resumable downloads
// and media seeking. Supports single and multiple range requests.
func ServeFileWithRange(w http.ResponseWriter, r *http.Request, filePath string, opts *TransferOptions) error {
	file, err := os.Open(filePath)
	if err != nil {
		return err
	}
	defer file.Close()

	stat, err := file.Stat()
	if err != nil {
		return err
	}

	if stat.IsDir() {
		return fmt.Errorf("cannot serve directory")
	}

	// Determine content type
	contentType := ""
	if opts != nil && opts.ContentType != "" {
		contentType = opts.ContentType
	} else {
		contentType = detectContentType(filePath)
	}

	// Determine filename
	filename := filepath.Base(filePath)
	if opts != nil && opts.Filename != "" {
		filename = opts.Filename
	}

	// Set common headers
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("Last-Modified", stat.ModTime().UTC().Format(http.TimeFormat))
	w.Header().Set("ETag", generateETag(stat))

	// Set Content-Disposition
	disposition := "inline"
	if opts != nil && opts.ForceDownload {
		disposition = "attachment"
	}
	w.Header().Set("Content-Disposition", fmt.Sprintf(`%s; filename="%s"`, disposition, filename))

	// Check for conditional requests (If-Modified-Since, If-None-Match)
	if checkNotModified(r, stat) {
		w.WriteHeader(http.StatusNotModified)
		return nil
	}

	// Parse Range header
	rangeHeader := r.Header.Get("Range")
	if rangeHeader == "" {
		// No range requested - serve entire file
		w.Header().Set("Content-Length", strconv.FormatInt(stat.Size(), 10))
		w.WriteHeader(http.StatusOK)
		_, err = io.Copy(w, file)
		return err
	}

	// Parse range request
	ranges, err := parseRangeHeader(rangeHeader, stat.Size())
	if err != nil {
		// Invalid range - return entire file
		w.Header().Set("Content-Length", strconv.FormatInt(stat.Size(), 10))
		w.WriteHeader(http.StatusOK)
		_, err = io.Copy(w, file)
		return err
	}

	if len(ranges) == 0 {
		// Range not satisfiable
		w.Header().Set("Content-Range", fmt.Sprintf("bytes */%d", stat.Size()))
		http.Error(w, "Range Not Satisfiable", http.StatusRequestedRangeNotSatisfiable)
		return nil
	}

	if len(ranges) == 1 {
		// Single range - simple partial content response
		rng := ranges[0]
		length := rng.end - rng.start + 1

		w.Header().Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", rng.start, rng.end, stat.Size()))
		w.Header().Set("Content-Length", strconv.FormatInt(length, 10))
		w.WriteHeader(http.StatusPartialContent)

		file.Seek(rng.start, io.SeekStart)
		_, err = io.CopyN(w, file, length)
		return err
	}

	// Multiple ranges - multipart response
	boundary := generateBoundary()
	w.Header().Set("Content-Type", fmt.Sprintf("multipart/byteranges; boundary=%s", boundary))
	w.WriteHeader(http.StatusPartialContent)

	for _, rng := range ranges {
		length := rng.end - rng.start + 1

		fmt.Fprintf(w, "\r\n--%s\r\n", boundary)
		fmt.Fprintf(w, "Content-Type: %s\r\n", contentType)
		fmt.Fprintf(w, "Content-Range: bytes %d-%d/%d\r\n\r\n", rng.start, rng.end, stat.Size())

		file.Seek(rng.start, io.SeekStart)
		io.CopyN(w, file, length)
	}

	fmt.Fprintf(w, "\r\n--%s--\r\n", boundary)
	return nil
}

// byteRange represents a range of bytes
type byteRange struct {
	start int64
	end   int64
}

// parseRangeHeader parses the Range header and returns valid byte ranges
func parseRangeHeader(header string, size int64) ([]byteRange, error) {
	if !strings.HasPrefix(header, "bytes=") {
		return nil, fmt.Errorf("invalid range header")
	}

	rangeSpec := strings.TrimPrefix(header, "bytes=")
	parts := strings.Split(rangeSpec, ",")

	var ranges []byteRange
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}

		dashIdx := strings.Index(part, "-")
		if dashIdx < 0 {
			continue
		}

		startStr := part[:dashIdx]
		endStr := part[dashIdx+1:]

		var start, end int64

		if startStr == "" {
			// Suffix range: -500 means last 500 bytes
			suffix, err := strconv.ParseInt(endStr, 10, 64)
			if err != nil || suffix <= 0 {
				continue
			}
			start = size - suffix
			if start < 0 {
				start = 0
			}
			end = size - 1
		} else {
			var err error
			start, err = strconv.ParseInt(startStr, 10, 64)
			if err != nil || start < 0 {
				continue
			}

			if endStr == "" {
				// Open-ended range: 500- means from byte 500 to end
				end = size - 1
			} else {
				end, err = strconv.ParseInt(endStr, 10, 64)
				if err != nil {
					continue
				}
			}
		}

		// Validate range
		if start > end || start >= size {
			continue
		}

		// Clamp end to file size
		if end >= size {
			end = size - 1
		}

		ranges = append(ranges, byteRange{start: start, end: end})
	}

	return ranges, nil
}

// detectContentType detects the MIME type of a file
func detectContentType(filePath string) string {
	ext := strings.ToLower(filepath.Ext(filePath))

	// Common types with better defaults than Go's mime package
	commonTypes := map[string]string{
		".txt":  "text/plain; charset=utf-8",
		".html": "text/html; charset=utf-8",
		".htm":  "text/html; charset=utf-8",
		".css":  "text/css; charset=utf-8",
		".js":   "application/javascript; charset=utf-8",
		".json": "application/json; charset=utf-8",
		".xml":  "application/xml; charset=utf-8",
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
		".bmp":  "image/bmp",
		".tiff": "image/tiff",
		".tif":  "image/tiff",
		".mp3":  "audio/mpeg",
		".wav":  "audio/wav",
		".ogg":  "audio/ogg",
		".flac": "audio/flac",
		".aac":  "audio/aac",
		".m4a":  "audio/mp4",
		".mp4":  "video/mp4",
		".webm": "video/webm",
		".avi":  "video/x-msvideo",
		".mkv":  "video/x-matroska",
		".mov":  "video/quicktime",
		".wmv":  "video/x-ms-wmv",
		".flv":  "video/x-flv",
		".m4v":  "video/mp4",
		".md":   "text/markdown; charset=utf-8",
		".yaml": "text/yaml; charset=utf-8",
		".yml":  "text/yaml; charset=utf-8",
		".csv":  "text/csv; charset=utf-8",
		".log":  "text/plain; charset=utf-8",
		".sh":   "application/x-sh",
		".sql":  "application/sql",
		".woff": "font/woff",
		".woff2": "font/woff2",
		".ttf":  "font/ttf",
		".otf":  "font/otf",
		".eot":  "application/vnd.ms-fontobject",
	}

	if mimeType, ok := commonTypes[ext]; ok {
		return mimeType
	}

	// Fall back to Go's mime package
	if mimeType := mime.TypeByExtension(ext); mimeType != "" {
		return mimeType
	}

	return "application/octet-stream"
}

// generateETag generates an ETag based on file modification time and size
func generateETag(stat os.FileInfo) string {
	return fmt.Sprintf(`"%x-%x"`, stat.ModTime().Unix(), stat.Size())
}

// generateBoundary generates a multipart boundary string
func generateBoundary() string {
	return fmt.Sprintf("%016x", time.Now().UnixNano())
}

// checkNotModified checks If-Modified-Since and If-None-Match headers
func checkNotModified(r *http.Request, stat os.FileInfo) bool {
	// Check If-None-Match (ETag)
	ifNoneMatch := r.Header.Get("If-None-Match")
	if ifNoneMatch != "" {
		etag := generateETag(stat)
		if ifNoneMatch == etag || ifNoneMatch == "*" {
			return true
		}
	}

	// Check If-Modified-Since
	ifModifiedSince := r.Header.Get("If-Modified-Since")
	if ifModifiedSince != "" {
		t, err := http.ParseTime(ifModifiedSince)
		if err == nil && !stat.ModTime().After(t) {
			return true
		}
	}

	return false
}

// ValidateUpload validates an upload against size and type restrictions
func ValidateUpload(filename string, size int64, opts *TransferOptions) error {
	if opts == nil {
		return nil
	}

	// Check file size
	if opts.MaxFileSize > 0 && size > opts.MaxFileSize {
		return fmt.Errorf("file size %d exceeds maximum allowed size %d", size, opts.MaxFileSize)
	}

	ext := strings.ToLower(filepath.Ext(filename))

	// Check denied extensions
	for _, denied := range opts.DeniedExts {
		if ext == strings.ToLower(denied) || ext == "."+strings.ToLower(strings.TrimPrefix(denied, ".")) {
			return fmt.Errorf("file extension %s is not allowed", ext)
		}
	}

	// Check allowed extensions (if specified)
	if len(opts.AllowedExts) > 0 {
		allowed := false
		for _, allowedExt := range opts.AllowedExts {
			if ext == strings.ToLower(allowedExt) || ext == "."+strings.ToLower(strings.TrimPrefix(allowedExt, ".")) {
				allowed = true
				break
			}
		}
		if !allowed {
			return fmt.Errorf("file extension %s is not in the allowed list", ext)
		}
	}

	// Check content type restrictions
	contentType := detectContentType(filename)
	baseMimeType := strings.Split(contentType, ";")[0]

	// Check denied types
	for _, denied := range opts.DeniedTypes {
		if matchMimeType(baseMimeType, denied) {
			return fmt.Errorf("file type %s is not allowed", baseMimeType)
		}
	}

	// Check allowed types (if specified)
	if len(opts.AllowedTypes) > 0 {
		allowed := false
		for _, allowedType := range opts.AllowedTypes {
			if matchMimeType(baseMimeType, allowedType) {
				allowed = true
				break
			}
		}
		if !allowed {
			return fmt.Errorf("file type %s is not in the allowed list", baseMimeType)
		}
	}

	return nil
}

// matchMimeType checks if a MIME type matches a pattern (supports wildcards like "image/*")
func matchMimeType(mimeType, pattern string) bool {
	if pattern == "*" || pattern == "*/*" {
		return true
	}

	mimeType = strings.ToLower(mimeType)
	pattern = strings.ToLower(pattern)

	if mimeType == pattern {
		return true
	}

	// Check wildcard patterns like "image/*"
	if strings.HasSuffix(pattern, "/*") {
		prefix := strings.TrimSuffix(pattern, "/*")
		return strings.HasPrefix(mimeType, prefix+"/")
	}

	return false
}

// GetFileSizeFromRequest attempts to get the file size from Content-Length header
func GetFileSizeFromRequest(r *http.Request) int64 {
	if cl := r.Header.Get("Content-Length"); cl != "" {
		if size, err := strconv.ParseInt(cl, 10, 64); err == nil {
			return size
		}
	}
	return -1
}

// IsStreamableMedia returns true if the content type supports streaming/seeking
func IsStreamableMedia(contentType string) bool {
	streamable := []string{
		"video/",
		"audio/",
		"application/ogg",
	}

	ct := strings.ToLower(contentType)
	for _, prefix := range streamable {
		if strings.HasPrefix(ct, prefix) {
			return true
		}
	}
	return false
}
