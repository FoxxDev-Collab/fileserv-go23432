# FileServ

![Go](https://img.shields.io/badge/Go-1.25+-00ADD8?style=flat&logo=go&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-15-000000?style=flat&logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=flat&logo=tailwind-css&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat&logo=sqlite&logoColor=white)
![License](https://img.shields.io/badge/license-AGPLv3-blue.svg)
![Rocky Linux](https://img.shields.io/badge/Rocky_Linux-10CE59?style=flat&logo=rockylinux&logoColor=white)
![RHEL](https://img.shields.io/badge/RHEL-EE0000?style=flat&logo=redhat&logoColor=white)

**A self-hosted file sharing and storage platform for Enterprise Linux — think TrueNAS for Rocky/RHEL.**

There's plenty of NAS solutions out there for Debian-based systems, but not much love for Enterprise Linux. FileServ fills that gap. Take a lightweight Rocky or RHEL server and turn it into a full-featured NAS with a modern web interface.

Built for teams and individuals who want powerful file sharing without giving up privacy or control. Whether you're managing personal files, working with a team, or serving content publicly, FileServ has the tools you need.

**Tested on:**
- Rocky Linux 10 Minimal
- Rocky Linux 9.6 Minimal
- RHEL 10
- RHEL 9.6

<!-- Screenshots coming soon -->

---

## Developer Background

**Role:** Security Professional with development fundamentals

I'm not a full-time developer, but I know enough to architect solutions, read code, and spot security issues. This background shapes my workflow—I leverage AI for implementation while keeping strict security oversight.

I'm a full time Information System Security Officer (ISSO level 3) with extensive background in state government and federal government IT and GRC/RMF. Currently working for military installations as a contractor. I love my job and love creating tools, finding solutions to problems.

## Why FileServ?

Simple, I fell in love with the simplicity of Rocky Linux and felt that it deserves better tooling. My understanding of Enterprise Linux came from using Rocky for the past few years. After using True NAS Scale at home, I wanted something better and was oriented in the direction my home lab was going, Enterprise Linux. 

I used cockpit for a few months, with its simple interface I was able to create my NAS with much more ease. And then I thought about making a much more powerful version of Cockpit using Claude Code. 

This project was made for fun and quickly became something so much more than simply managing a file server. 

**Key Capabilities:**

### Intuitive File Management
Upload, organize, and manage your files through a responsive web interface. Drag and drop files, create folders, search across your storage, and preview common file types—no extra software needed.

### Flexible Storage Zones
Define storage zones that match how you actually work. Create personal spaces for individual users, shared zones for team collaboration, and public areas for broader access. Each zone can have its own permissions, quotas, and access rules.

### Smart Web Sharing
Share files and folders with anyone using secure, customizable links. Set passwords, expiration dates, and download limits. Track who's viewing and downloading your content, and even allow uploads to shared folders for easy collaboration.

### Network Share Integration
Manage SMB and NFS shares directly from the interface. FileServ integrates with your existing network infrastructure, making it easy to provide both web and traditional file access.

### Comprehensive Administration
Monitor disk usage, manage users and groups, configure quotas, and keep tabs on system resources—all from a unified dashboard. FileServ supports LVM for flexible storage management and gives you detailed visibility into your system's health.

---

## Getting Started

The fastest way to get FileServ running is to build both components and start the server. You'll need Go 1.21+ and Node.js 18+ installed.

```bash
# Build the backend
cd fileserve_backend
go build -o fileserv .

# Build the frontend
cd ../fileserve_frontend
npm install
npm run build

# Deploy frontend assets to the backend
cp -r out/* ../fileserve_backend/static/

# Start the server
cd ../fileserve_backend
./fileserv
```

Once running, open your browser to `http://localhost:8080`. You can log in using your system credentials—users in the root or wheel group automatically get admin access.

---

## Learn More

I've put together some guides to help you get the most out of FileServ:

| Guide | What You'll Learn |
|-------|-------------------|
| [Quick Start](docs/QUICK_START.md) | Get up and running in under 5 minutes |
| [User Guide](docs/USER_GUIDE.md) | How to use FileServ's features effectively |
| [Admin Guide](docs/ADMIN_GUIDE.md) | Deployment, configuration, and system management |
| [Security Report](docs/SECURITY_REPORT.md) | Security audit findings and remediation status |
| [Dev Sec Ops](docs/ADMIN_GUIDE.md) | Development with focused Security in mind |

---

## Configuration

FileServ uses environment variables for configuration, so it's easy to customize without editing code:

| Variable | Default | Purpose |
|----------|---------|---------|
| `FILESERV_PORT` | `8080` | The port the HTTP server listens on |
| `FILESERV_DATA_DIR` | `./data` | Where to store uploaded files |
| `FILESERV_STORAGE_FILE` | `./storage.json` | Path to the metadata database |
| `FILESERV_JWT_SECRET` | (generated) | Secret key for signing authentication tokens |
| `FILESERV_TLS_CERT` | - | Path to TLS certificate for HTTPS |
| `FILESERV_TLS_KEY` | - | Path to TLS private key for HTTPS |

You can set these in your shell, systemd service file, or container environment depending on how you're deploying.

---

## How It's Built

FileServ combines a high-performance Go backend with a modern React frontend to deliver a fast, responsive experience.

**Backend (Go):**
- **Go** - Efficient, concurrent file operations and HTTP handling
- **Chi Router** - Lightweight, composable HTTP routing
- **JWT Authentication** - Secure, stateless session management
- **bcrypt** - Industry-standard password hashing

**Frontend (Next.js):**
- **Next.js 15** - Modern React framework with server-side rendering
- **TypeScript** - Type safety and better developer experience
- **Tailwind CSS** - Utility-first styling for rapid UI development
- **shadcn/ui** - Beautifully designed, accessible components
- **Lucide Icons** - Clean, consistent iconography

**Architecture:**
```
fileserv-go/
├── fileserve_backend/      # Go HTTP server and API
│   ├── config/             # Configuration management
│   ├── handlers/           # HTTP request handlers
│   ├── internal/fileops/   # File operation logic
│   ├── middleware/         # Auth, CORS, logging, security
│   ├── models/             # Data structures
│   ├── storage/            # SQLite-based persistence
│   └── static/             # Compiled frontend assets
│
├── fileserve_frontend/     # Next.js web application
│   ├── app/                # Application pages (App Router)
│   ├── components/         # Reusable React components
│   └── lib/                # API client and utilities
│
└── docs/                   # User and admin documentation
```

---

## API Reference

FileServ exposes a RESTful API for programmatic access. Here are some key endpoints to get you started:

**Authentication:**
- `POST /api/auth/login` - Authenticate and receive a JWT token
- `POST /api/auth/logout` - Invalidate current session
- `GET /api/auth/me` - Get current user information

**File Operations:**
- `GET /api/zones/accessible` - List storage zones you have access to
- `GET /api/zones/{id}/files` - List files in a zone
- `POST /api/zones/{id}/files/{path}` - Upload a file
- `DELETE /api/zones/{id}/files/{path}` - Delete a file

**Share Management:**
- `GET /api/links` - List your shared links
- `POST /api/links` - Create a new share link
- `DELETE /api/links/{id}` - Remove a share link

**Public Sharing:**
- `GET /s/{token}` - View a shared file or folder
- `GET /s/{token}/download` - Download shared content

For the complete API documentation with request/response examples, see the [Admin Guide](docs/ADMIN_GUIDE.md#api-reference).

---

## Security Best Practices

Security is something I take seriously. I recently completed a comprehensive security audit that identified and fixed 27 vulnerabilities, including 6 critical and 12 high-severity issues. You can review the complete findings and remediation details in the [Security Report](docs/SECURITY_REPORT.md).

When deploying FileServ, follow these essential security practices:

- **Use HTTPS in production** - Always encrypt traffic with TLS certificates
- **Secure your JWT secret** - Use a strong, randomly generated secret and keep it private
- **Configure your firewall** - Only expose necessary ports to the internet
- **Regular backups** - Back up your `storage.json` database and data directory regularly
- **Access control** - Review who has admin access (root and wheel group members by default)
- **Keep dependencies updated** - Stay current with security patches for Go and Node.js

FileServ authenticates against your system's user database, so your existing user security policies apply automatically.

---

## License

FileServ is free software licensed under the **GNU Affero General Public License v3.0 (AGPLv3)**.

This means you're free to use, modify, and distribute FileServ, but if you run a modified version on a server and let others interact with it, you need to share your changes. This ensures that improvements to FileServ benefit everyone.

See the [LICENSE](LICENSE.md) file for the complete terms.

---

## Contributing

Contributions are welcome! Whether you're fixing a bug, adding a feature, or improving documentation, your help makes FileServ better for everyone.

**How to contribute:**

1. **Fork the repository** and create a new branch for your work
2. **Make your changes** with clear, descriptive commits
3. **Test thoroughly** to make sure nothing breaks
4. **Submit a pull request** with a description of what you've changed and why

Before starting major work, consider opening an issue to discuss your plans. This helps avoid duplicate effort and makes sure your contribution fits with where the project is headed.

---

*Built with care for people who value privacy and control over their data.*
