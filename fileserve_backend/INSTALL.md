# Installation Guide

## System Requirements

- Go 1.21 or later
- Linux system (for systemd service)
- Minimum 512MB RAM
- Minimum 100MB disk space (plus storage for user files)

## Quick Start

### 1. Install Go (if not already installed)

```bash
# Download Go (check for latest version at https://go.dev/dl/)
wget https://go.dev/dl/go1.21.5.linux-amd64.tar.gz

# Extract and install
sudo rm -rf /usr/local/go
sudo tar -C /usr/local -xzf go1.21.5.linux-amd64.tar.gz

# Add to PATH (add to ~/.bashrc or ~/.profile)
export PATH=$PATH:/usr/local/go/bin
```

### 2. Build the Application

```bash
cd fileserve_backend

# Install dependencies
go mod download
go mod tidy

# Vendor dependencies (optional, for offline builds)
go mod vendor

# Build the binary
go build -ldflags="-s -w" -o fileserv

# Or use Make
make vendor
make build
```

### 3. Development Run

```bash
# Set environment variables
export PORT=8080
export DATA_DIR=./data
export JWT_SECRET=your-secret-key-here

# Run the server
./fileserv

# Or use Make
make run
```

### 4. Production Installation (with systemd)

```bash
# Create system user
sudo useradd -r -s /bin/false fileserv

# Create directories
sudo mkdir -p /opt/fileserv
sudo mkdir -p /var/lib/fileserv/data

# Copy binary
sudo cp fileserv /opt/fileserv/

# Set permissions
sudo chown -R fileserv:fileserv /opt/fileserv
sudo chown -R fileserv:fileserv /var/lib/fileserv

# Edit service file with your configuration
sudo nano fileserv.service

# IMPORTANT: Change JWT_SECRET in the service file!

# Install systemd service
sudo cp fileserv.service /etc/systemd/system/
sudo systemctl daemon-reload

# Enable and start service
sudo systemctl enable fileserv
sudo systemctl start fileserv

# Check status
sudo systemctl status fileserv
```

### 5. Verify Installation

```bash
# Check if server is running
curl http://localhost:8080/api/auth/login

# Login with your system credentials
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"your-username","password":"your-password"}'
```

## Configuration

### Environment Variables

Create a `.env` file or set environment variables:

```bash
# Server port
PORT=8080

# Data storage directory
DATA_DIR=/var/lib/fileserv/data

# JWT secret (REQUIRED for production)
JWT_SECRET=your-very-long-random-secret-key

# Optional: Log level
LOG_LEVEL=info
```

### Important Security Notes

1. **Set a strong JWT_SECRET** in production (use `openssl rand -base64 32`)
2. **Use HTTPS** in production (put behind nginx/traefik/caddy)
3. **Restrict file permissions** on the data directory
4. **Enable firewall** rules to limit access
5. **Admin access** - Only root and wheel group users have admin access

## Using with Nginx (Reverse Proxy)

```nginx
server {
    listen 80;
    server_name files.example.com;

    client_max_body_size 100M;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Troubleshooting

### Service won't start

```bash
# Check logs
sudo journalctl -u fileserv -f

# Check service status
sudo systemctl status fileserv

# Verify binary permissions
ls -la /opt/fileserv/fileserv

# Verify data directory permissions
ls -la /var/lib/fileserv/
```

### Permission denied errors

```bash
# Fix ownership
sudo chown -R fileserv:fileserv /var/lib/fileserv

# Fix permissions
sudo chmod 755 /var/lib/fileserv
sudo chmod 755 /var/lib/fileserv/data
```

### Build errors

```bash
# Clean and rebuild
go clean
go mod download
go mod tidy
go build -v
```

## Uninstallation

```bash
# Stop and disable service
sudo systemctl stop fileserv
sudo systemctl disable fileserv

# Remove files
sudo rm /etc/systemd/system/fileserv.service
sudo rm -rf /opt/fileserv
sudo systemctl daemon-reload

# Optional: Remove data (WARNING: This deletes all user files!)
# sudo rm -rf /var/lib/fileserv

# Optional: Remove system user
# sudo userdel fileserv
```

## Upgrading

```bash
# Stop service
sudo systemctl stop fileserv

# Build new version
go build -ldflags="-s -w" -o fileserv

# Replace binary
sudo cp fileserv /opt/fileserv/

# Start service
sudo systemctl start fileserv

# Check status
sudo systemctl status fileserv
```

## Database Migration

This application uses JSON-based storage. The storage file is located at:
- Development: `./data/storage.json`
- Production: `/var/lib/fileserv/data/storage.json`

To backup:
```bash
sudo cp /var/lib/fileserv/data/storage.json /backup/storage.json.$(date +%Y%m%d)
```

To restore:
```bash
sudo systemctl stop fileserv
sudo cp /backup/storage.json.YYYYMMDD /var/lib/fileserv/data/storage.json
sudo chown fileserv:fileserv /var/lib/fileserv/data/storage.json
sudo systemctl start fileserv
```
