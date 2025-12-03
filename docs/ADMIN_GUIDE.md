# FileServ Administrator Guide

Technical documentation for system administrators deploying and managing FileServ.

---

## Table of Contents

1. [Installation](#installation)
2. [Configuration](#configuration)
3. [Architecture](#architecture)
4. [Security](#security)
5. [Storage Configuration](#storage-configuration)
6. [User Management](#user-management)
7. [Network Shares](#network-shares)
8. [Backup & Recovery](#backup--recovery)
9. [Monitoring](#monitoring)
10. [API Reference](#api-reference)

---

## Installation

### Prerequisites

- Linux server (RHEL/Rocky/Alma 8+, Ubuntu 20.04+, Debian 11+)
- Go 1.21+ (for building)
- Node.js 18+ (for frontend build)
- Root or sudo access (for SMB/NFS/LVM management)

### Building from Source

```bash
# Clone the repository
git clone https://github.com/your-org/fileserv-go.git
cd fileserv-go

# Build backend
cd fileserve_backend
go build -o fileserv .

# Build frontend
cd ../fileserve_frontend
npm install
npm run build

# Copy frontend to backend static folder
cp -r out/* ../fileserve_backend/static/
```

### Running the Server

```bash
# Set environment variables (see Configuration section)
export FILESERV_PORT=8080
export FILESERV_DATA_DIR=/srv/data
export FILESERV_STORAGE_FILE=/var/lib/fileserv/storage.json
export FILESERV_JWT_SECRET=$(openssl rand -base64 32)

# Run the server
./fileserv
```

### Systemd Service

Create `/etc/systemd/system/fileserv.service`:

```ini
[Unit]
Description=FileServ File Sharing Server
After=network.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=/opt/fileserv
ExecStart=/opt/fileserv/fileserv
Restart=always
RestartSec=5
Environment=FILESERV_PORT=8080
Environment=FILESERV_DATA_DIR=/srv/data
Environment=FILESERV_STORAGE_FILE=/var/lib/fileserv/storage.json
Environment=FILESERV_JWT_SECRET=your-secret-key

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable fileserv
sudo systemctl start fileserv
```

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FILESERV_PORT` | `8080` | HTTP server port |
| `FILESERV_DATA_DIR` | `./data` | Default data directory (legacy) |
| `FILESERV_STORAGE_FILE` | `./storage.json` | Path to storage database file |
| `FILESERV_JWT_SECRET` | (generated) | Secret for JWT token signing |
| `FILESERV_TLS_CERT` | (none) | Path to TLS certificate |
| `FILESERV_TLS_KEY` | (none) | Path to TLS private key |

### TLS/HTTPS Configuration

For production, always use HTTPS:

```bash
export FILESERV_TLS_CERT=/etc/ssl/certs/fileserv.crt
export FILESERV_TLS_KEY=/etc/ssl/private/fileserv.key
```

Or use a reverse proxy (nginx, Caddy) for TLS termination.

### Reverse Proxy with Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name files.example.com;

    ssl_certificate /etc/ssl/certs/files.example.com.crt;
    ssl_certificate_key /etc/ssl/private/files.example.com.key;

    client_max_body_size 10G;  # Allow large uploads

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support (if needed)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Timeouts for large uploads
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

---

## Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────┐
│                    FileServ Server                       │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │   Router    │  │  Handlers   │  │   Middleware    │  │
│  │   (chi)     │──│  (API)      │──│  (Auth, CORS)   │  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
│         │                │                   │          │
│  ┌──────┴────────────────┴───────────────────┴───────┐  │
│  │                    Storage Layer                   │  │
│  │  - Users, Permissions, Shares                      │  │
│  │  - Storage Pools, Share Zones                      │  │
│  │  - Share Links                                     │  │
│  └────────────────────────────────────────────────────┘  │
│         │                                               │
│  ┌──────┴────────────────────────────────────────────┐  │
│  │              File Operations (fileops)             │  │
│  │  - Path validation & traversal prevention          │  │
│  │  - File CRUD operations                            │  │
│  └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Request** → Router → Middleware (Auth) → Handler
2. **Handler** → Storage Layer (permissions check) → FileOps
3. **FileOps** → Filesystem → Response

### Storage File Format

The `storage.json` file contains all application data:

```json
{
  "users": {...},
  "permissions": {...},
  "shares": {...},
  "storage_pools": {...},
  "share_zones": {...},
  "share_links": {...}
}
```

---

## Security

### Authentication

- JWT-based authentication
- Tokens expire after 24 hours by default
- Passwords hashed with bcrypt

### Authorization Levels

| Role | Capabilities |
|------|--------------|
| User | Access zones, manage own files, create share links |
| Admin | Full system access, user management, storage config |

### Path Traversal Prevention

All file operations validate paths to prevent directory traversal attacks:

```go
// Paths are resolved and checked against base path
fullPath, err := fileops.ValidatePath(basePath, userPath)
```

### Security Headers

The API sets appropriate security headers:
- CORS configured for same-origin by default
- Content-Type enforced

### Recommendations

1. **Use HTTPS** - Never run in production without TLS
2. **Restrict network access** - Use firewall to limit access
3. **Regular backups** - Backup storage.json and data directories
4. **Update regularly** - Keep the software updated
5. **Admin access** - Only root and wheel group users have admin access

---

## Storage Configuration

### Storage Pool Best Practices

#### Directory Structure

Recommended structure:

```
/srv/fileserv/
├── pools/
│   ├── primary/           # Main storage pool
│   │   ├── users/         # Personal zone
│   │   ├── teams/         # Group zones
│   │   └── public/        # Public zone
│   └── archive/           # Archive pool
│       └── backups/
└── data/
    └── storage.json       # Application database
```

#### Creating the Structure

```bash
# Create directories
sudo mkdir -p /srv/fileserv/pools/{primary/{users,teams,public},archive/backups}
sudo mkdir -p /srv/fileserv/data

# Set ownership (adjust user as needed)
sudo chown -R root:root /srv/fileserv
sudo chmod -R 755 /srv/fileserv
```

### Pool Configuration Examples

#### Primary Storage Pool

```json
{
  "name": "Primary Storage",
  "path": "/srv/fileserv/pools/primary",
  "description": "Main storage for user files",
  "enabled": true,
  "max_file_size": 5368709120,  // 5 GB
  "allowed_types": [],          // All allowed
  "denied_types": ["exe", "bat", "cmd", "sh"],
  "default_user_quota": 10737418240  // 10 GB
}
```

#### Archive Pool

```json
{
  "name": "Archive Storage",
  "path": "/srv/fileserv/pools/archive",
  "description": "Long-term storage",
  "enabled": true,
  "max_file_size": 0,  // Unlimited
  "allowed_types": ["zip", "tar", "gz", "7z", "pdf"],
  "denied_types": [],
  "default_user_quota": 53687091200  // 50 GB
}
```

### Zone Configuration Examples

#### Personal Zone (User Homes)

```json
{
  "name": "My Files",
  "pool_id": "primary-pool-id",
  "path": "users",
  "zone_type": "personal",
  "description": "Your personal storage space",
  "auto_provision": true,
  "allowed_users": ["*"],
  "allowed_groups": [],
  "allow_web_shares": true,
  "allow_network_shares": false
}
```

#### Team Zone

```json
{
  "name": "Engineering Team",
  "pool_id": "primary-pool-id",
  "path": "teams/engineering",
  "zone_type": "group",
  "description": "Shared files for engineering team",
  "auto_provision": false,
  "allowed_users": [],
  "allowed_groups": ["engineering", "devops"],
  "allow_web_shares": true,
  "allow_network_shares": true
}
```

#### Public Zone

```json
{
  "name": "Company Resources",
  "pool_id": "primary-pool-id",
  "path": "public",
  "zone_type": "public",
  "description": "Company-wide shared resources",
  "auto_provision": false,
  "allowed_users": ["*"],
  "allowed_groups": [],
  "allow_web_shares": false,
  "allow_network_shares": false
}
```

---

## User Management

### Internal vs System Users

FileServ maintains its own user database, separate from system users:

| Type | Description | Use Case |
|------|-------------|----------|
| Internal | Stored in storage.json | Web UI access, file sharing |
| System | Linux /etc/passwd users | SMB/NFS authentication |

### Creating Users via API

```bash
curl -X POST https://files.example.com/api/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "jdoe",
    "password": "secure-password",
    "email": "jdoe@example.com",
    "is_admin": false,
    "groups": ["engineering", "project-x"]
  }'
```

### User Groups

Groups are simple string arrays. Use them for:
- Zone access control
- Share permissions
- Organizing users

```json
{
  "groups": ["engineering", "managers", "project-alpha"]
}
```

---

## Network Shares

### SMB/Samba Configuration

FileServ can manage Samba shares. Ensure Samba is installed:

```bash
# RHEL/Rocky/Alma
sudo dnf install samba

# Ubuntu/Debian
sudo apt install samba
```

The server generates entries for `/etc/samba/smb.conf`.

### NFS Configuration

For NFS exports, ensure NFS server is installed:

```bash
# RHEL/Rocky/Alma
sudo dnf install nfs-utils

# Ubuntu/Debian
sudo apt install nfs-kernel-server
```

The server manages `/etc/exports`.

### Permissions for Network Shares

FileServ needs root access to manage SMB/NFS configurations:

```bash
# Run as root or with sudo capabilities
sudo ./fileserv
```

---

## Backup & Recovery

### What to Backup

1. **storage.json** - Contains all configuration, users, shares
2. **Data directories** - All storage pool paths
3. **TLS certificates** - If using built-in TLS

### Backup Script Example

```bash
#!/bin/bash
BACKUP_DIR="/backup/fileserv/$(date +%Y%m%d)"
mkdir -p "$BACKUP_DIR"

# Backup configuration
cp /srv/fileserv/data/storage.json "$BACKUP_DIR/"

# Backup data (use rsync for efficiency)
rsync -av --delete /srv/fileserv/pools/ "$BACKUP_DIR/pools/"

# Compress
tar -czf "$BACKUP_DIR.tar.gz" -C /backup/fileserv "$(date +%Y%m%d)"
rm -rf "$BACKUP_DIR"

# Keep only last 30 days
find /backup/fileserv -name "*.tar.gz" -mtime +30 -delete
```

### Recovery

1. Stop the service: `sudo systemctl stop fileserv`
2. Restore storage.json
3. Restore data directories
4. Start the service: `sudo systemctl start fileserv`

---

## Monitoring

### Health Checks

The server logs startup and health information:

```bash
# View logs
sudo journalctl -u fileserv -f
```

### Key Metrics to Monitor

| Metric | Method | Threshold |
|--------|--------|-----------|
| Disk Usage | `df -h` | < 80% |
| Memory | `free -m` | < 80% |
| Open Files | `lsof \| wc -l` | < ulimit |
| Response Time | External monitoring | < 200ms |

### Log Rotation

Logs are managed by systemd journal. Configure retention:

```bash
# /etc/systemd/journald.conf
[Journal]
MaxRetentionSec=30d
MaxFileSec=7d
```

---

## API Reference

### Authentication

#### Login

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "jdoe",
  "password": "password"
}
```

Response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expires_at": 1699999999,
  "user": {
    "id": "uuid",
    "username": "jdoe",
    "is_admin": false,
    "groups": ["engineering"]
  }
}
```

#### Authenticated Requests

Include the token in the Authorization header:

```http
GET /api/zones/accessible
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

### Zone Files API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/zones/accessible` | List user's accessible zones |
| GET | `/api/zones/{id}/files?path=` | List files in zone |
| GET | `/api/zones/{id}/files/{path}` | Download file |
| POST | `/api/zones/{id}/files/{path}` | Upload file |
| PUT | `/api/zones/{id}/files/{path}` | Rename file |
| DELETE | `/api/zones/{id}/files/{path}` | Delete file |
| POST | `/api/zones/{id}/folders/{path}` | Create folder |

### Share Links API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/links` | List my share links |
| POST | `/api/links` | Create share link |
| GET | `/api/links/{id}` | Get share link |
| PUT | `/api/links/{id}` | Update share link |
| DELETE | `/api/links/{id}` | Delete share link |

### Public Share API (No Auth)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/s/{token}` | Get share info |
| POST | `/s/{token}/verify` | Verify password |
| GET | `/s/{token}/list` | List folder contents |
| GET | `/s/{token}/download` | Download file |
| GET | `/s/{token}/preview` | Preview file |
| POST | `/s/{token}/upload` | Upload to share |

### Admin API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/stats` | System statistics |
| GET | `/api/pools` | List storage pools |
| POST | `/api/pools` | Create storage pool |
| GET | `/api/zones` | List share zones |
| POST | `/api/zones` | Create share zone |
| GET | `/api/users` | List users |
| POST | `/api/users` | Create user |

---

## Troubleshooting

### Common Issues

#### Permission Denied on Startup

```
Failed to initialize storage: permission denied
```

**Solution**: Ensure the data directory is writable:
```bash
sudo chown -R root:root /srv/fileserv
sudo chmod -R 755 /srv/fileserv
```

#### Port Already in Use

```
listen tcp :8080: bind: address already in use
```

**Solution**: Change port or stop conflicting service:
```bash
export FILESERV_PORT=8081
# or
sudo lsof -i :8080
sudo kill <PID>
```

#### SMB/NFS Commands Fail

**Solution**: Ensure running as root and services are installed:
```bash
which smbcontrol  # Should return path
which exportfs    # Should return path
```

#### Out of Memory

**Solution**: Increase server memory or optimize usage:
- Reduce concurrent connections
- Enable swap
- Use smaller file chunks for uploads

---

*FileServ Administrator Guide - Version 1.0*
