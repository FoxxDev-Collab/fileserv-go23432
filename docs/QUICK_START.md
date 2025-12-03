# FileServ Quick Start Guide

Get FileServ up and running in 5 minutes.

---

## 1. Build & Run

```bash
# Build backend
cd fileserve_backend
go build -o fileserv .

# Build frontend
cd ../fileserve_frontend
npm install
npm run build

# Copy frontend to backend
cp -r out/* ../fileserve_backend/static/

# Run
cd ../fileserve_backend
./fileserv
```

Server starts at `http://localhost:8080`

---

## 2. First Login

1. Open `http://localhost:8080` in your browser
2. Login with your system credentials (root or wheel group members have admin access)

---

## 3. Create Storage Pool

1. Go to **Storage > Pools**
2. Click **Create Pool**
3. Enter:
   - Name: `Primary Storage`
   - Path: `/srv/data` (must exist on server)
4. Click **Create**

---

## 4. Create Share Zone

1. Go to **Storage > Zones**
2. Click **Create Zone**
3. Enter:
   - Name: `User Files`
   - Pool: Select "Primary Storage"
   - Path: `users`
   - Type: `Personal`
   - Enable **Auto-Provision**
   - Allowed Users: `*` (all users)
4. Click **Create**

---

## 5. Test File Upload

1. Go to **Files**
2. Select "User Files" zone
3. Click **Upload Files**
4. Select a file from your computer
5. File appears in the list!

---

## 6. Create a Share Link

1. In Files, click the share icon on any file
2. Configure options (or use defaults)
3. Click **Create Share Link**
4. Copy the URL and share it!

---

## Next Steps

- Read the [User Guide](USER_GUIDE.md) for full feature documentation
- Read the [Admin Guide](ADMIN_GUIDE.md) for deployment best practices
- Configure HTTPS for production use
- Create additional users and zones

---

## Quick Reference

### Environment Variables

```bash
export FILESERV_PORT=8080
export FILESERV_DATA_DIR=/srv/data
export FILESERV_STORAGE_FILE=/var/lib/fileserv/storage.json
export FILESERV_JWT_SECRET=your-secret-key
export FILESERV_TLS_CERT=/path/to/cert.pem
export FILESERV_TLS_KEY=/path/to/key.pem
```

### Default Ports

| Service | Port |
|---------|------|
| HTTP | 8080 |
| HTTPS | 8080 (with TLS configured) |

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /api/auth/login` | Login |
| `GET /api/zones/accessible` | List your zones |
| `GET /api/zones/{id}/files` | List files |
| `POST /api/links` | Create share link |
| `GET /s/{token}` | Access shared content |

---

*Happy file sharing!*
