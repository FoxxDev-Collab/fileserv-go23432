# Storage Pool & Unified Sharing System - Implementation Plan

## Overview

This plan implements a comprehensive storage management and sharing system that gives admins complete control over storage allocation while providing non-admin users with an easy, intuitive file sharing experience.

---

## Part 1: Storage Pool System (Admin Configuration)

### 1.1 New Models

**StoragePool** - Defines available storage locations
```go
type StoragePool struct {
    ID          string    // UUID
    Name        string    // "Primary Storage", "Archive Pool"
    Path        string    // /srv/data, /mnt/storage
    Description string
    Enabled     bool
    TotalSpace  int64     // Total bytes (from df)
    UsedSpace   int64     // Used bytes
    Reserved    int64     // Reserved for system

    // Constraints
    MaxFileSize    int64    // Per-file limit (0 = unlimited)
    AllowedTypes   []string // File extensions allowed (empty = all)
    DeniedTypes    []string // Blocked extensions

    // Quotas
    DefaultUserQuota  int64 // Default quota per user
    DefaultGroupQuota int64 // Default quota per group

    CreatedAt time.Time
    UpdatedAt time.Time
}
```

**ShareZone** - Maps directories where shares can exist
```go
type ShareZone struct {
    ID          string
    PoolID      string    // References StoragePool
    Name        string    // "User Homes", "Team Shares", "Public"
    Path        string    // Relative path within pool
    Description string
    ZoneType    string    // "personal" | "group" | "public"

    // Auto-provisioning
    AutoProvision     bool   // Auto-create user directories
    ProvisionTemplate string // Template name for new dirs

    // Access
    AllowedUsers  []string
    AllowedGroups []string

    // Sharing rules
    AllowNetworkShares bool // SMB/NFS
    AllowWebShares     bool // Public links
    AllowGuestAccess   bool

    CreatedAt time.Time
    UpdatedAt time.Time
}
```

### 1.2 Admin Storage Configuration Pages

**Storage Pools Page** (`/admin/storage/pools`)
- List all storage pools with usage stats
- Create/edit pool dialogs
- Set quotas, file restrictions
- Health monitoring
- Pool enable/disable

**Share Zones Page** (`/admin/storage/zones`)
- Configure share zones within pools
- Set zone types (personal/group/public)
- Configure auto-provisioning rules
- Map allowed users/groups

---

## Part 2: Unified Share Model

### 2.1 Extended Share Model

Update existing Share model to support both network and web sharing:

```go
type Share struct {
    // Existing fields...
    ID          string
    Name        string
    Path        string
    Description string
    Enabled     bool
    CreatedAt   time.Time
    UpdatedAt   time.Time

    // NEW: Pool/Zone mapping
    PoolID   string // Storage pool this share belongs to
    ZoneID   string // Share zone this share belongs to
    OwnerID  string // User who owns this share

    // NEW: Share visibility
    ShareType   string // "network" | "web" | "both"
    Visibility  string // "private" | "internal" | "public"

    // Existing network options
    Protocol    string // "smb" | "nfs" | "none"
    SMBOptions  *SMBOptions
    NFSOptions  *NFSOptions

    // NEW: Web sharing options
    WebOptions  *WebShareOptions

    // Access control (enhanced)
    AllowedUsers  []string
    AllowedGroups []string
    DenyUsers     []string
    DenyGroups    []string
    GuestAccess   bool
    ReadOnly      bool
    Browsable     bool
}
```

### 2.2 Web Share Options

```go
type WebShareOptions struct {
    // Public link sharing
    PublicEnabled   bool
    PublicToken     string    // UUID for public URL
    PublicPassword  string    // Optional password (bcrypt)

    // Expiration
    ExpiresAt       *time.Time
    MaxDownloads    int       // 0 = unlimited
    DownloadCount   int       // Current count

    // Permissions
    AllowDownload   bool
    AllowUpload     bool
    AllowPreview    bool
    AllowListing    bool      // Show directory contents

    // Branding
    CustomMessage   string
    ShowOwner       bool
}
```

### 2.3 Share Links (Individual Files/Folders)

```go
type ShareLink struct {
    ID            string
    ShareID       string    // Parent share (optional)
    OwnerID       string    // User who created link

    // Target
    TargetPath    string    // Full path to file/folder
    TargetType    string    // "file" | "folder"

    // Access
    Token         string    // URL-safe token
    Password      string    // Optional (bcrypt)

    // Limits
    ExpiresAt     *time.Time
    MaxDownloads  int
    DownloadCount int
    MaxViews      int
    ViewCount     int

    // Permissions
    AllowDownload bool
    AllowPreview  bool

    // Metadata
    Name          string    // Display name
    Description   string

    CreatedAt     time.Time
    LastAccessed  *time.Time
}
```

---

## Part 3: User Experience (Non-Admin)

### 3.1 Simplified Dashboard

**User Home** (`/dashboard`)
- Quick stats: storage used, files count, active shares
- Recent files section
- Quick upload dropzone
- Active share links with copy buttons

### 3.2 Enhanced Files Page

**My Files** (`/files`)
- Clean file browser with drag-drop upload
- Right-click context menu:
  - Share → Create Link
  - Share → Network Share (if permitted)
  - Download
  - Rename
  - Move
  - Delete
- Bulk operations (select multiple)
- Search with filters

### 3.3 Share Creation Flow (Simplified)

**Quick Share Button** - One-click sharing
1. User clicks "Share" on any file/folder
2. Modal appears with options:
   - **Quick Link** - Instant shareable URL (7-day expiry default)
   - **Protected Link** - Password + custom expiry
   - **Team Share** - Share with specific users/groups
   - **Network Share** - SMB/NFS (if zone allows)
3. Link copied to clipboard automatically
4. Share management in "My Shares" page

### 3.4 My Shares Page (`/shares`)

- List all user's shares and links
- Status indicators (active, expired, near limit)
- Quick actions: copy link, edit, disable, delete
- Share statistics (views, downloads)
- Bulk management

---

## Part 4: Public Access System

### 4.1 Public Share Routes (No Auth Required)

```
GET  /s/{token}           - View shared content
GET  /s/{token}/download  - Download file/folder (zip)
POST /s/{token}/verify    - Verify password
GET  /s/{token}/preview   - Preview file (images, PDF, text)
POST /s/{token}/upload    - Upload to shared folder (if allowed)
```

### 4.2 Public Share Page

**Share Landing Page** (`/s/{token}`)
- Clean, branded page
- Password prompt if protected
- File preview (images, PDFs, text, video)
- Download button
- Folder listing (if directory)
- Upload dropzone (if allowed)
- Owner info (if shown)
- Custom message display

---

## Part 5: Backend Implementation

### 5.1 New Handlers

**Pool Handlers** (`handlers/pools.go`)
- GetStoragePools, GetStoragePool
- CreateStoragePool, UpdateStoragePool, DeleteStoragePool
- GetPoolUsage, GetPoolHealth

**Zone Handlers** (`handlers/zones.go`)
- GetShareZones, GetShareZone
- CreateShareZone, UpdateShareZone, DeleteShareZone
- GetZoneUsage

**Share Link Handlers** (`handlers/sharelinks.go`)
- CreateShareLink, GetShareLinks, GetShareLink
- UpdateShareLink, DeleteShareLink
- ValidateShareLink (password check)
- IncrementLinkCounter

**Public Access Handlers** (`handlers/public.go`)
- GetPublicShare (landing page data)
- VerifySharePassword
- DownloadPublicShare
- UploadToPublicShare
- PreviewPublicFile

### 5.2 New API Routes

```go
// Admin - Storage Pools
r.Route("/api/admin/pools", func(r chi.Router) {
    r.Get("/", GetStoragePools)
    r.Post("/", CreateStoragePool)
    r.Get("/{id}", GetStoragePool)
    r.Put("/{id}", UpdateStoragePool)
    r.Delete("/{id}", DeleteStoragePool)
    r.Get("/{id}/usage", GetPoolUsage)
})

// Admin - Share Zones
r.Route("/api/admin/zones", func(r chi.Router) {
    r.Get("/", GetShareZones)
    r.Post("/", CreateShareZone)
    r.Get("/{id}", GetShareZone)
    r.Put("/{id}", UpdateShareZone)
    r.Delete("/{id}", DeleteShareZone)
})

// User - Share Links
r.Route("/api/links", func(r chi.Router) {
    r.Get("/", GetMyShareLinks)
    r.Post("/", CreateShareLink)
    r.Get("/{id}", GetShareLink)
    r.Put("/{id}", UpdateShareLink)
    r.Delete("/{id}", DeleteShareLink)
})

// Public Access (NO AUTH)
r.Route("/s/{token}", func(r chi.Router) {
    r.Get("/", GetPublicShare)
    r.Post("/verify", VerifySharePassword)
    r.Get("/download", DownloadPublicShare)
    r.Get("/preview", PreviewPublicFile)
    r.Post("/upload", UploadToPublicShare)
})
```

### 5.3 Storage Layer Updates

Update `storage/store.go` to include:
- `StoragePools map[string]*models.StoragePool`
- `ShareZones map[string]*models.ShareZone`
- `ShareLinks map[string]*models.ShareLink`

Add CRUD operations for each.

---

## Part 6: Frontend Implementation

### 6.1 New Admin Pages

| Page | Path | Purpose |
|------|------|---------|
| Storage Pools | `/admin/storage/pools` | Manage storage pools |
| Share Zones | `/admin/storage/zones` | Configure share zones |
| All Share Links | `/admin/links` | Admin view of all links |

### 6.2 New User Pages

| Page | Path | Purpose |
|------|------|---------|
| My Shares | `/shares` | User's shares and links |
| Share Detail | `/shares/{id}` | Individual share management |

### 6.3 New Public Pages

| Page | Path | Purpose |
|------|------|---------|
| Public Share | `/s/{token}` | Public share landing |

### 6.4 Component Updates

**Files Page Enhancements:**
- Add share context menu
- Add share dialog component
- Add bulk share option
- Add drag-drop upload

**New Components:**
- `ShareDialog` - Quick share creation
- `ShareLinkCard` - Display share link with stats
- `PublicShareView` - Public share landing page
- `PasswordPrompt` - Password verification modal
- `FilePreview` - Image/PDF/video preview component

---

## Part 7: Implementation Order

### Phase 1: Storage Pools & Zones (Backend)
1. Create StoragePool model
2. Create ShareZone model
3. Add to storage layer
4. Implement pool handlers
5. Implement zone handlers
6. Add API routes

### Phase 2: Storage Pools & Zones (Frontend)
7. Create pools management page
8. Create zones management page
9. Update sidebar navigation

### Phase 3: Share Links (Backend)
10. Create ShareLink model
11. Update Share model with WebOptions
12. Add to storage layer
13. Implement share link handlers
14. Implement public access handlers
15. Add API routes

### Phase 4: Share Links (Frontend)
16. Create ShareDialog component
17. Update files page with share functionality
18. Create My Shares page
19. Create public share page

### Phase 5: Integration & Polish
20. Connect shares to pools/zones
21. Enforce zone rules in share creation
22. Add quota enforcement
23. Add share analytics
24. Polish UI/UX

---

## Summary

This implementation provides:

**For Admins:**
- Complete control over storage allocation via pools
- Flexible share zone configuration
- Quota management per pool/user/group
- Visibility into all shares and usage

**For Users:**
- One-click file/folder sharing
- Multiple share types (quick, protected, team, network)
- Easy share management
- Clear storage usage visibility

**For Public Access:**
- Clean share landing pages
- Password protection option
- Expiration and download limits
- File preview capabilities
- Upload to shared folders (optional)
