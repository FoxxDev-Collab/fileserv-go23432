# FileServ Architecture

## Overview

FileServ is a single-binary file server with authentication, user management, and permissions built in Go. It uses embedded static files and JSON-based storage for simplicity and portability.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         Client                              │
│            (Browser / cURL / Mobile App)                    │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ HTTP/HTTPS
                         │
┌────────────────────────▼────────────────────────────────────┐
│                    main.go (Entry Point)                    │
│  • Graceful shutdown (SIGTERM/SIGINT)                      │
│  • Server initialization                                    │
│  • Route configuration                                      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │
        ┌────────────────┴────────────────┐
        │                                 │
┌───────▼────────┐               ┌────────▼────────┐
│   Middleware   │               │   Embedded FS   │
│                │               │                 │
│ • CORS         │               │ static/*        │
│ • Logging      │               │ (Frontend)      │
│ • Auth (JWT)   │               │                 │
│ • Admin Check  │               └─────────────────┘
└───────┬────────┘
        │
        │
┌───────▼──────────────────────────────────────────────────┐
│                      Handlers                            │
│                                                          │
│  ┌──────────┐  ┌─────────┐  ┌──────────┐  ┌──────────┐ │
│  │   Auth   │  │  Users  │  │  Files   │  │  Admin   │ │
│  │          │  │         │  │          │  │          │ │
│  │ • Login  │  │ • CRUD  │  │ • List   │  │ • Stats  │ │
│  │ • Logout │  │         │  │ • Upload │  │          │ │
│  │ • Refresh│  │         │  │ • Delete │  │          │ │
│  └────┬─────┘  └────┬────┘  └────┬─────┘  └────┬─────┘ │
└───────┼─────────────┼────────────┼─────────────┼────────┘
        │             │            │             │
        └──────┬──────┴────────────┴─────────────┘
               │
┌──────────────▼────────────────────────────────────────────┐
│                    Business Logic                         │
│                                                           │
│  ┌──────────────┐        ┌──────────────┐               │
│  │  Models      │        │  Internal    │               │
│  │              │        │              │               │
│  │ • User       │        │ • auth/jwt   │               │
│  │ • Permission │        │ • fileops    │               │
│  │ • Session    │        │              │               │
│  └──────┬───────┘        └──────┬───────┘               │
│         │                       │                        │
│         └───────────┬───────────┘                        │
└─────────────────────┼────────────────────────────────────┘
                      │
┌─────────────────────▼────────────────────────────────────┐
│                  Storage Layer                           │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │              JSON Storage (store.go)             │   │
│  │                                                  │   │
│  │  • Users map                                     │   │
│  │  • Permissions list                              │   │
│  │  • Sessions map                                  │   │
│  │  • Thread-safe with sync.RWMutex                │   │
│  └────────────────────────┬─────────────────────────┘   │
└───────────────────────────┼──────────────────────────────┘
                            │
                            │ Read/Write
                            │
                   ┌────────▼─────────┐
                   │  storage.json    │
                   │  (DATA_DIR)      │
                   └──────────────────┘
```

## Component Details

### 1. Entry Point (main.go)

**Responsibilities:**
- Load configuration from environment variables
- Initialize storage layer
- Create default admin user if needed
- Setup HTTP router with chi
- Configure middleware stack
- Implement graceful shutdown

**Key Features:**
- Listens for SIGTERM/SIGINT for graceful shutdown
- 30-second timeout for shutdown
- Embedded static files for single-binary deployment

### 2. Configuration (config/)

**Responsibilities:**
- Load environment variables
- Provide default values
- Ensure data directory exists

**Environment Variables:**
- `PORT` - Server port (default: 8080)
- `DATA_DIR` - Data storage directory (default: ./data)
- `JWT_SECRET` - Secret for JWT signing (default: change-me-in-production)

### 3. Middleware (middleware/)

**Components:**

**a. CORS (cors.go)**
- Handles Cross-Origin Resource Sharing
- Allows all origins (configurable)
- Handles OPTIONS preflight requests

**b. Logging (logging.go)**
- Logs all HTTP requests
- Captures method, path, status code, and duration
- Custom response writer to capture status

**c. Auth (auth.go)**
- JWT token validation
- Extracts user context from token
- Adds user info to request context

**d. Admin Check**
- Verifies user has admin role
- Used for protected admin endpoints

### 4. Handlers (handlers/)

**a. Authentication (auth.go)**
- Login with username/password
- Logout (invalidate session)
- Refresh JWT token
- Get current user info

**b. Users (users.go)**
- List users (admin only)
- Create user (admin only)
- Update user (admin only)
- Delete user (admin only)

**c. Files (files.go)**
- List directory contents
- Download files
- Upload files (multipart/form-data)
- Delete files/directories
- Rename/move files
- Create directories

**d. Admin (admin.go)**
- Server statistics
- Permission management

**e. Static (static.go)**
- Serve embedded frontend files
- SPA routing support (fallback to index.html)

### 5. Models (models/)

**a. User (user.go)**
- User data structure
- Password hashing with bcrypt
- Password verification
- Safe user serialization (no password hash)

**Fields:**
- ID (UUID)
- Username
- PasswordHash
- Email
- IsAdmin (boolean)
- Groups (string array)
- MustChangePassword (boolean)
- CreatedAt, UpdatedAt (timestamps)

**b. Permission (permission.go)**
- File/directory permission system
- Path-based access control
- User and group permissions

**Permission Types:**
- Read
- Write
- Delete

**Fields:**
- ID (UUID)
- Path (file/directory path)
- Type (read/write/delete)
- Username (optional)
- Group (optional)
- CreatedAt, UpdatedAt (timestamps)

**c. Session (session.go)**
- JWT token tracking
- Session expiration

### 6. Storage (storage/)

**Design:**
- JSON file-based storage
- Thread-safe with sync.RWMutex
- Auto-save on every mutation
- In-memory caching for fast reads

**Features:**
- User CRUD operations
- Permission CRUD operations
- Session management
- Expired session cleanup
- Default admin creation

**Storage Structure:**
```json
{
  "users": {
    "uuid": { "id": "uuid", "username": "...", ... }
  },
  "permissions": [
    { "id": "uuid", "path": "/", "type": "read", ... }
  ],
  "sessions": {
    "token": { "token": "...", "user_id": "...", ... }
  }
}
```

### 7. Internal Packages (internal/)

**a. JWT (internal/auth/jwt.go)**
- JWT token generation
- JWT token validation
- Claims structure

**Claims:**
- UserID
- Username
- IsAdmin
- Standard JWT claims (exp, iat)

**b. File Operations (internal/fileops/fileops.go)**
- Safe file operations
- Path traversal prevention
- Directory listing
- File upload/download
- File/directory deletion
- File/directory renaming

**Security:**
- All paths validated against base directory
- Prevents "../" attacks
- Ensures operations stay within DATA_DIR

## Security Model

### 1. Authentication Flow

```
1. User submits credentials
   ↓
2. Server validates username/password
   ↓
3. Server generates JWT token
   ↓
4. Client stores token
   ↓
5. Client sends token with each request
   ↓
6. Middleware validates token
   ↓
7. Request processed with user context
```

### 2. Authorization Flow

```
1. Request reaches handler
   ↓
2. Handler extracts user context
   ↓
3. Handler retrieves user from storage
   ↓
4. Handler checks permissions for path
   ↓
5. If authorized, process request
   ↓
6. If not authorized, return 403
```

### 3. Permission Model

**Admins:**
- Have all permissions automatically
- Can access all files and directories

**Regular Users:**
- Permissions checked per path
- Can have user-specific permissions
- Can have group-based permissions
- Permissions are hierarchical (parent paths apply to children)

**Permission Precedence:**
1. Admin status (highest)
2. User-specific permissions
3. Group permissions
4. Default deny (lowest)

## Data Flow

### Upload File

```
Client
  ↓ POST /api/files/path/to/file
Middleware (CORS, Logging, Auth)
  ↓ Validate JWT
Handler (files.go)
  ↓ Check write permission
Internal (fileops.go)
  ↓ Validate path, save file
Storage (filesystem)
  ↓ Write to DATA_DIR/path/to/file
Response
  ↓ 201 Created
Client
```

### Create User

```
Client
  ↓ POST /api/users
Middleware (CORS, Logging, Auth, Admin)
  ↓ Validate JWT, check admin
Handler (users.go)
  ↓ Parse request
Storage (store.go)
  ↓ Create user, hash password
Storage (filesystem)
  ↓ Save storage.json
Response
  ↓ 201 Created with user data
Client
```

## Deployment

### Development
```bash
PORT=8080 DATA_DIR=./data go run main.go
```

### Production (Systemd)
```
1. Build: go build -o fileserv
2. Install: sudo cp fileserv /opt/fileserv/
3. Configure: Edit fileserv.service
4. Enable: sudo systemctl enable fileserv
5. Start: sudo systemctl start fileserv
```

### Docker (Future)
```dockerfile
FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY . .
RUN go build -o fileserv

FROM alpine:latest
COPY --from=builder /app/fileserv /usr/local/bin/
EXPOSE 8080
CMD ["fileserv"]
```

## Scalability Considerations

### Current Limitations
- JSON storage is not suitable for high-concurrency
- File operations are synchronous
- No distributed session management

### Future Improvements
1. Replace JSON storage with SQLite/PostgreSQL
2. Add Redis for session management
3. Implement file operation queuing
4. Add horizontal scaling support
5. Implement file chunking for large uploads
6. Add WebSocket support for real-time updates

## Testing Strategy

1. **Unit Tests**
   - Models: User password hashing, permission checking
   - Storage: CRUD operations
   - Internal: JWT generation/validation, path validation

2. **Integration Tests**
   - API endpoints with real storage
   - Authentication flow
   - File operations

3. **Security Tests**
   - Path traversal attempts
   - JWT tampering
   - Permission bypass attempts

## Performance Characteristics

- **Startup time:** < 100ms
- **Memory usage:** ~20MB base + storage data
- **Binary size:** ~7-10MB (embedded frontend)
- **Concurrent connections:** Limited by OS and Go runtime
- **Request latency:**
  - Auth: < 10ms
  - File list: < 50ms
  - File upload: Network bound
  - File download: Network bound

## Monitoring

### Logs
- All requests logged with duration
- Startup configuration logged
- Shutdown events logged

### Future Metrics
- Prometheus endpoint
- Request rate
- Error rate
- Storage size
- Active sessions
