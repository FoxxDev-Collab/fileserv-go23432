# FileServ Backend

A Go-based file server with authentication, user management, and file permissions.

## Features

- Single binary with embedded static files
- JWT-based authentication
- User management (admin only)
- File permissions system (per-user or per-group)
- Graceful shutdown support for systemd
- JSON-based storage (no database required)

## Prerequisites

- Go 1.21 or later

## Installation

1. Install dependencies:
```bash
go mod tidy
```

2. Vendor dependencies:
```bash
go mod vendor
```

3. Build the binary:
```bash
go build -o fileserv
```

## Configuration

Configure using environment variables:

- `PORT` - Server port (default: 8080)
- `DATA_DIR` - Directory for file storage (default: ./data)
- `JWT_SECRET` - Secret key for JWT tokens (default: change-me-in-production)

## Running

```bash
# Development
PORT=8080 DATA_DIR=/var/fileserv/data JWT_SECRET=your-secret ./fileserv

# Production with systemd
sudo systemctl start fileserv
```

## Authentication

FileServ uses PAM authentication with system users. Members of sudo (Ubuntu/Debian), wheel (RHEL/CentOS), admin, or root groups have admin access.

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login with username/password
- `POST /api/auth/logout` - Logout (invalidate token)
- `POST /api/auth/refresh` - Refresh JWT token
- `GET /api/auth/me` - Get current user info

### User Management (Admin Only)
- `GET /api/users` - List all users
- `POST /api/users` - Create new user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

### File Operations
- `GET /api/files?path=/` - List files in directory
- `GET /api/files/*path` - Download file or list directory
- `POST /api/files/*path` - Upload file
- `DELETE /api/files/*path` - Delete file/folder
- `PUT /api/files/*path` - Rename/move file
- `POST /api/folders/*path` - Create directory

### Permissions (Admin Only)
- `GET /api/permissions` - List all permissions
- `POST /api/permissions` - Create permission
- `DELETE /api/permissions/:id` - Delete permission

### Admin Dashboard
- `GET /api/admin/stats` - Get server statistics

## Systemd Service

See `fileserv.service` for systemd service configuration.

Install:
```bash
sudo cp fileserv.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable fileserv
sudo systemctl start fileserv
```

## Project Structure

```
fileserve_backend/
├── main.go                 # Entry point, server setup
├── go.mod                  # Go module definition
├── config/
│   └── config.go          # Configuration from env vars
├── handlers/
│   ├── auth.go            # Authentication handlers
│   ├── users.go           # User management handlers
│   ├── files.go           # File operation handlers
│   ├── admin.go           # Admin dashboard handlers
│   └── static.go          # Static file serving
├── middleware/
│   ├── auth.go            # JWT validation middleware
│   ├── logging.go         # Request logging
│   └── cors.go            # CORS handling
├── models/
│   ├── user.go            # User model
│   ├── permission.go      # Permission model
│   └── session.go         # Session/token model
├── storage/
│   └── store.go           # JSON-based storage
├── internal/
│   ├── auth/
│   │   └── jwt.go         # JWT token handling
│   └── fileops/
│       └── fileops.go     # Safe file operations
└── static/                 # Frontend files (embedded)
    └── .gitkeep
```

## Security Features

- Password hashing with bcrypt
- JWT-based authentication
- Path traversal attack prevention
- Role-based access control (admin/user)
- Per-file/folder permission system
- Session management

## Development

To run in development mode:

```bash
# Install dependencies
go mod download

# Run with auto-reload (using air or similar)
PORT=8080 DATA_DIR=./data go run main.go
```

## Building for Production

```bash
# Build optimized binary
go build -ldflags="-s -w" -o fileserv

# Build with embedded frontend
# (Frontend build output should be in static/ directory)
go build -ldflags="-s -w" -o fileserv
```

## License

MIT
