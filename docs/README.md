# FileServ Documentation

Welcome to the FileServ documentation. This folder contains comprehensive guides for users and administrators.

---

## Documentation Index

### Getting Started

| Document | Description |
|----------|-------------|
| [Quick Start](QUICK_START.md) | Get FileServ running in 5 minutes |
| [User Guide](USER_GUIDE.md) | Complete user documentation |
| [Admin Guide](ADMIN_GUIDE.md) | Deployment and administration |

---

## Quick Links

### For Users

- [File Management](USER_GUIDE.md#file-management)
- [Sharing Files](USER_GUIDE.md#sharing-files)
- [Storage Zones](USER_GUIDE.md#storage-zones)
- [Troubleshooting](USER_GUIDE.md#troubleshooting)

### For Administrators

- [Installation](ADMIN_GUIDE.md#installation)
- [Configuration](ADMIN_GUIDE.md#configuration)
- [Security](ADMIN_GUIDE.md#security)
- [Storage Pools & Zones](ADMIN_GUIDE.md#storage-configuration)
- [Network Shares](ADMIN_GUIDE.md#network-shares)
- [API Reference](ADMIN_GUIDE.md#api-reference)

---

## Feature Overview

### Core Features

| Feature | Description |
|---------|-------------|
| **File Management** | Upload, download, organize files and folders |
| **Storage Zones** | Admin-defined storage areas with access control |
| **Web Sharing** | Create shareable links with passwords & expiration |
| **Network Shares** | SMB (Windows) and NFS (Linux) shares |

### Administrative Features

| Feature | Description |
|---------|-------------|
| **Storage Pools** | Define physical storage locations |
| **Share Zones** | Configure user access to storage |
| **User Management** | Create and manage users and groups |
| **Quota Management** | Set storage limits per user/group |
| **System Monitoring** | View server resources and logs |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         FileServ                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐    ┌──────────────────────────────┐   │
│  │   Next.js UI     │    │      Go Backend              │   │
│  │  (Static Export) │───▶│  - REST API                  │   │
│  └──────────────────┘    │  - File Operations           │   │
│                          │  - Auth (JWT)                │   │
│                          │  - Storage Management        │   │
│                          └──────────────────────────────┘   │
│                                      │                       │
│                          ┌───────────┴───────────┐          │
│                          ▼                       ▼          │
│                   ┌─────────────┐         ┌───────────┐     │
│                   │ Filesystem  │         │  SMB/NFS  │     │
│                   │  Storage    │         │  Services │     │
│                   └─────────────┘         └───────────┘     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2024 | Initial release with pools, zones, sharing |

---

## Support

For issues and feature requests, please use the project's issue tracker.

---

*FileServ - Modern File Sharing Made Simple*
