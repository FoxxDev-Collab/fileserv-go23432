# FileServ

A modern, self-hosted file sharing and storage management platform built with Go and Next.js.

![License](https://img.shields.io/badge/license-MIT-blue.svg)

---

## Features

### File Management
- Upload, download, and organize files via web interface
- Drag-and-drop file uploads
- Search and filter files
- Create and manage folders

### Storage Zones
- Admin-defined storage pools and zones
- Personal, group, and public zone types
- Auto-provisioning for user directories
- Per-zone access control

### Web Sharing
- Create shareable links for files and folders
- Password protection with optional expiration
- Download limits and view tracking
- Preview support for images, PDFs, and more
- Allow uploads to shared folders

### Network Shares
- SMB (Samba) share management
- NFS export management
- Integrated access control

### Administration
- User and group management
- Disk and volume monitoring
- LVM management
- Quota configuration
- System resource monitoring
- Service management

---

## Quick Start

```bash
# Build backend
cd fileserve_backend
go build -o fileserv .

# Build frontend
cd ../fileserve_frontend
npm install
npm run build

# Copy frontend to backend static folder
cp -r out/* ../fileserve_backend/static/

# Run
cd ../fileserve_backend
./fileserv
```

Open `http://localhost:8080` and login with your system credentials (root or wheel group members have admin access).

---

## Documentation

| Document | Description |
|----------|-------------|
| [Quick Start](docs/QUICK_START.md) | Get running in 5 minutes |
| [User Guide](docs/USER_GUIDE.md) | Complete user documentation |
| [Admin Guide](docs/ADMIN_GUIDE.md) | Deployment and administration |

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FILESERV_PORT` | `8080` | HTTP server port |
| `FILESERV_DATA_DIR` | `./data` | Default data directory |
| `FILESERV_STORAGE_FILE` | `./storage.json` | Storage database path |
| `FILESERV_JWT_SECRET` | (auto) | JWT signing secret |
| `FILESERV_TLS_CERT` | - | TLS certificate path |
| `FILESERV_TLS_KEY` | - | TLS private key path |

---

## Project Structure

```
fileserv-go/
├── fileserve_backend/      # Go backend
│   ├── config/             # Configuration
│   ├── handlers/           # HTTP handlers
│   ├── internal/fileops/   # File operations
│   ├── middleware/         # Auth, CORS, logging
│   ├── models/             # Data models
│   ├── storage/            # Data persistence
│   └── static/             # Frontend build output
│
├── fileserve_frontend/     # Next.js frontend
│   ├── app/                # Pages (App Router)
│   ├── components/         # React components
│   └── lib/                # Utilities and API client
│
└── docs/                   # Documentation
```

---

## API Overview

### Authentication
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Current user

### Zone Files
- `GET /api/zones/accessible` - List accessible zones
- `GET /api/zones/{id}/files` - List files
- `POST /api/zones/{id}/files/{path}` - Upload file
- `DELETE /api/zones/{id}/files/{path}` - Delete file

### Share Links
- `GET /api/links` - List my shares
- `POST /api/links` - Create share
- `DELETE /api/links/{id}` - Delete share

### Public Access
- `GET /s/{token}` - View share
- `GET /s/{token}/download` - Download

See [API Reference](docs/ADMIN_GUIDE.md#api-reference) for complete documentation.

---

## Tech Stack

### Backend
- **Go** - High-performance backend
- **Chi** - Lightweight HTTP router
- **JWT** - Stateless authentication
- **bcrypt** - Password hashing

### Frontend
- **Next.js 15** - React framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **shadcn/ui** - UI components
- **Lucide** - Icons

---

## Security Considerations

- Always use HTTPS in production
- Use strong JWT secrets
- Implement proper firewall rules
- Regular backups of storage.json and data
- Only root and wheel group users have admin access

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests
5. Submit a pull request

---

*FileServ - Modern File Sharing Made Simple*
