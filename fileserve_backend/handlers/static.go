package handlers

import (
	"io"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

func ServeStatic(staticFS fs.FS) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Clean the path
		urlPath := strings.TrimPrefix(r.URL.Path, "/")
		urlPath = strings.TrimSuffix(urlPath, "/")

		// Handle root path
		if urlPath == "" {
			serveFile(w, r, staticFS, "index.html")
			return
		}

		// Check if this is a static asset (has file extension)
		ext := path.Ext(urlPath)
		if ext != "" && ext != ".html" {
			// Try serving the static asset directly
			if _, err := fs.Stat(staticFS, urlPath); err == nil {
				serveFile(w, r, staticFS, urlPath)
				return
			}
			http.Error(w, "File not found", http.StatusNotFound)
			return
		}

		// For route requests (no extension or .html), try route-specific index.html first
		// Next.js static export creates separate index.html for each route
		routeIndexPath := path.Join(urlPath, "index.html")
		if _, err := fs.Stat(staticFS, routeIndexPath); err == nil {
			serveFile(w, r, staticFS, routeIndexPath)
			return
		}

		// Fall back to root index.html for client-side routing
		serveFile(w, r, staticFS, "index.html")
	}
}

func serveFile(w http.ResponseWriter, r *http.Request, staticFS fs.FS, filePath string) {
	file, err := staticFS.Open(filePath)
	if err != nil {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}
	defer file.Close()

	// Get file info for content type detection
	stat, err := file.Stat()
	if err != nil {
		http.Error(w, "Error reading file", http.StatusInternalServerError)
		return
	}

	// Set content type based on extension
	contentType := getContentType(filePath)
	if contentType != "" {
		w.Header().Set("Content-Type", contentType)
	}

	// Serve the file
	http.ServeContent(w, r, stat.Name(), stat.ModTime(), file.(io.ReadSeeker))
}

func getContentType(filePath string) string {
	ext := strings.ToLower(path.Ext(filePath))
	switch ext {
	case ".html":
		return "text/html; charset=utf-8"
	case ".css":
		return "text/css; charset=utf-8"
	case ".js":
		return "application/javascript"
	case ".json":
		return "application/json"
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".gif":
		return "image/gif"
	case ".svg":
		return "image/svg+xml"
	case ".ico":
		return "image/x-icon"
	case ".woff":
		return "font/woff"
	case ".woff2":
		return "font/woff2"
	case ".ttf":
		return "font/ttf"
	case ".txt":
		return "text/plain; charset=utf-8"
	default:
		return ""
	}
}
