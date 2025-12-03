# FileServ User Guide

A comprehensive guide for using FileServ - a modern file sharing and storage management platform.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [User Interface Overview](#user-interface-overview)
3. [File Management](#file-management)
4. [Sharing Files](#sharing-files)
5. [Storage Zones](#storage-zones)
6. [Administration](#administration)
7. [Storage Pools & Zones (Admin)](#storage-pools--zones-admin)
8. [Network Shares (Admin)](#network-shares-admin)
9. [System Management (Admin)](#system-management-admin)
10. [Troubleshooting](#troubleshooting)

---

## Getting Started

### First Login

1. Navigate to your FileServ instance URL (e.g., `https://your-server.com`)
2. Enter your system username and password
3. Click **Sign In**

> **Note**: Root and wheel group members have administrator access.

### Understanding the Interface

After logging in, you'll see the main dashboard with:

- **Sidebar Navigation** - Access different sections of the application
- **Header** - Shows current section and user menu
- **Main Content Area** - Displays files, settings, or admin panels

---

## User Interface Overview

### Sidebar Navigation

| Section | Description | Access |
|---------|-------------|--------|
| Dashboard | Overview of your storage usage and recent activity | All users |
| Files | Browse and manage your files | All users |
| My Shares | Manage your shared links | All users |
| Admin Panel | System administration | Admins only |
| Users | Manage internal users | Admins only |
| Network Shares | SMB/NFS share management | Admins only |
| Permissions | File access permissions | Admins only |
| Storage | Disk and volume management | Admins only |
| Settings | Personal preferences | All users |

### User Menu

Click your username in the bottom-left corner to access:
- View your profile
- Log out

---

## File Management

### Navigating Files

The Files page shows your accessible storage zones. Each zone represents a designated storage area configured by your administrator.

#### Zone Types

| Icon | Type | Description |
|------|------|-------------|
| Hard Drive | Personal | Your private storage space |
| Users | Group | Shared with specific groups |
| Globe | Public | Accessible to all users |

#### Selecting a Zone

1. Use the **Storage Zone** dropdown at the top of the Files page
2. Select the zone you want to browse
3. The file list will update to show contents of that zone

### Browsing Files

- **Click a folder** to navigate into it
- **Use breadcrumbs** at the top to navigate back
- **Search** using the search box to filter files by name

### Uploading Files

1. Navigate to the folder where you want to upload
2. Click the **Upload Files** button
3. Select one or more files from your computer
4. Wait for the upload to complete

> **Note**: Upload is only available if the zone allows uploads and you have write permission.

### Creating Folders

1. Navigate to the location for the new folder
2. Click **New Folder**
3. Enter a name for the folder
4. Click **Create**

### File Actions

Right-click a file or use the action buttons to:

| Action | Description |
|--------|-------------|
| Download | Download the file to your computer |
| Rename | Change the file or folder name |
| Delete | Permanently remove the file or folder |
| Share | Create a shareable link (if permitted) |

### Deleting Files

1. Click the trash icon next to the file/folder
2. Confirm the deletion in the dialog
3. **Warning**: Deleted files cannot be recovered!

---

## Sharing Files

FileServ allows you to create shareable links that can be accessed by anyone with the link, even without an account.

### Creating a Share Link

1. Navigate to the file or folder you want to share
2. Click the **Share** icon (or right-click and select Share)
3. Configure your share options:

#### Share Options

| Option | Description |
|--------|-------------|
| **Name** | Display name for the share (shown to recipients) |
| **Description** | Optional description |
| **Password** | Optionally protect with a password |
| **Expiration** | Set when the link expires (7 days default) |
| **Max Downloads** | Limit number of downloads (0 = unlimited) |
| **Allow Download** | Recipients can download files |
| **Allow Preview** | Recipients can preview files in browser |
| **Allow Upload** | Recipients can upload files (folders only) |
| **Show Directory Listing** | Show folder contents (folders only) |
| **Show Owner** | Display your name on the share page |
| **Custom Message** | Message displayed to recipients |

4. Click **Create Share Link**
5. Copy the generated link to share with others

### Managing Your Shares

Go to **My Shares** in the sidebar to:

- View all your active share links
- See download/view statistics
- Edit share settings
- Delete shares
- Copy share URLs

### Share Link Statuses

| Status | Meaning |
|--------|---------|
| Active | Link is accessible |
| Expired | Link has passed its expiration date |
| Limit Reached | Download limit has been reached |
| Disabled | Manually disabled by you |

### Accessing a Shared Link

When someone receives your share link:

1. They click the link or paste it in their browser
2. If password-protected, they enter the password
3. They can view, download, or upload (based on permissions)

---

## Storage Zones

Storage zones are designated areas where you can store files. They are configured by administrators and provide organized, permission-controlled storage.

### Zone Types Explained

#### Personal Zones
- Your private storage area
- Automatically creates a folder for you on first access
- Only you can see your files
- Ideal for personal documents and files

#### Group Zones
- Shared with specific user groups
- All group members can access files
- Great for team collaboration

#### Public Zones
- Accessible to all authenticated users
- Useful for company-wide resources

### Zone Permissions

Depending on the zone configuration, you may be able to:

| Permission | Description |
|------------|-------------|
| View | Browse and read files |
| Upload | Add new files and folders |
| Delete | Remove files and folders |
| Share | Create share links for files |

---

## Administration

> **Note**: This section is only visible to administrators.

### Admin Dashboard

The Admin Panel provides an overview of:

- Total users
- Total files and folders
- Storage usage
- Active shares

---

## Storage Pools & Zones (Admin)

Administrators can define where users store their files using Storage Pools and Share Zones.

### Storage Pools

A Storage Pool represents a physical storage location on the server.

#### Creating a Storage Pool

1. Go to **Storage > Pools**
2. Click **Create Pool**
3. Configure:

| Field | Description |
|-------|-------------|
| Name | Display name (e.g., "Primary Storage") |
| Path | Absolute path on server (e.g., `/srv/data`) |
| Description | Optional description |
| Enabled | Whether the pool is active |
| Max File Size | Limit individual file sizes (0 = unlimited) |
| Allowed Types | File extensions allowed (empty = all) |
| Denied Types | File extensions blocked |
| Default User Quota | Default storage limit per user |

4. Click **Create**

#### Pool Usage

View pool usage statistics:
- Total capacity
- Used space
- Number of zones
- Number of shares

### Share Zones

A Share Zone is a directory within a Pool where users can store files.

#### Creating a Share Zone

1. Go to **Storage > Zones**
2. Click **Create Zone**
3. Configure:

| Field | Description |
|-------|-------------|
| Name | Display name (e.g., "User Homes") |
| Pool | Select the parent storage pool |
| Path | Relative path within the pool |
| Zone Type | Personal, Group, or Public |
| Description | Optional description |
| Auto-Provision | Auto-create user directories (personal zones) |
| Allowed Users | Users who can access (* = all) |
| Allowed Groups | Groups who can access (* = all) |
| Allow Web Shares | Users can create share links |
| Allow Network Shares | Zone can be shared via SMB/NFS |

4. Click **Create**

#### Zone Types

| Type | Behavior |
|------|----------|
| Personal | Creates user subdirectory, files isolated per user |
| Group | Shared folder for specified groups |
| Public | Single shared folder for all users |

#### Auto-Provisioning

For personal zones with auto-provisioning enabled:
- A subdirectory is created for each user on first access
- Named after the username (e.g., `/users/john/`)
- User only sees their own directory

---

## Network Shares (Admin)

FileServ can manage SMB (Windows/Samba) and NFS (Unix) network shares.

### Creating an SMB Share

1. Go to **Network Shares**
2. Click **Create Share**
3. Select Protocol: **SMB**
4. Configure:

| Field | Description |
|-------|-------------|
| Name | Share name (appears in network) |
| Path | Directory to share |
| Description | Comment shown to users |
| Enabled | Whether share is active |
| Browsable | Show in network browser |
| Read Only | Prevent modifications |
| Guest Access | Allow anonymous access |
| Allowed Users | Users with access |
| Allowed Groups | Groups with access |

#### SMB Advanced Options

| Option | Description |
|--------|-------------|
| Valid Users | Users allowed to connect |
| Write List | Users with write access |
| Create Mask | Default file permissions |
| Directory Mask | Default folder permissions |
| Force User | Run as specific user |
| Force Group | Run as specific group |

### Creating an NFS Share

1. Go to **Network Shares**
2. Click **Create Share**
3. Select Protocol: **NFS**
4. Configure basic options (similar to SMB)

#### NFS Advanced Options

| Option | Description |
|--------|-------------|
| Allowed Hosts | IP addresses/networks allowed |
| Root Squash | Map root to nobody |
| All Squash | Map all users to nobody |
| Sync | Synchronous writes |
| No Subtree Check | Skip subtree checking |

### Managing Shares

- **Enable/Disable** - Toggle share availability
- **Edit** - Modify share settings
- **Delete** - Remove the share

---

## System Management (Admin)

### User Management

#### Internal Users

FileServ has its own user database separate from system users.

**Creating a User:**
1. Go to **Users**
2. Click **Create User**
3. Enter username, password, email
4. Set admin status and groups
5. Click **Create**

**Editing a User:**
1. Click the edit icon next to the user
2. Modify settings
3. Click **Save**

#### System Users

For root/wheel administrators, you can view system (Linux) users:
1. Go to **Administration > Users**
2. View system users and their groups
3. These are read-only from the web interface

### Storage Management

#### Overview

The Storage Overview shows:
- Total capacity across all disks
- Used and free space
- Mount points
- Disk health status

#### Disks & Partitions

View all attached disks and their partitions:
- Disk model, size, type (SSD/HDD)
- Partition table
- Mount status

> **Warning**: Partition operations can cause data loss!

#### Volumes (LVM)

Manage Logical Volume Manager:
- View volume groups
- View logical volumes
- Create/resize/delete volumes

#### Quotas

Set storage limits per user or group:
1. Go to **Storage > Quotas**
2. Select filesystem
3. Set soft and hard limits
4. Apply to user or group

### Server Management

#### System Resources

Monitor server health:
- CPU usage and load
- Memory usage
- Uptime
- Kernel version

#### Services

Manage system services:
- View service status
- Start/Stop/Restart services
- Enable/Disable on boot

#### Processes

View running processes:
- Sort by CPU or memory usage
- Kill misbehaving processes

#### Network

View network interfaces:
- IP addresses
- Traffic statistics
- Interface status

#### Logs

View system logs:
- Journald logs
- dmesg (kernel) logs
- Filter by service or priority

---

## Permissions (Admin)

### Understanding Permissions

FileServ uses a path-based permission system:

| Permission | Allows |
|------------|--------|
| Read | View and download files |
| Write | Upload and modify files |
| Delete | Remove files and folders |

### Creating Permissions

1. Go to **Permissions**
2. Click **Create Permission**
3. Configure:

| Field | Description |
|-------|-------------|
| Path | Directory path (e.g., `/projects/`) |
| Type | User or Group |
| Target | Username or group name |
| Permissions | Read, Write, Delete checkboxes |

4. Click **Create**

### Permission Inheritance

- Permissions apply to the path and all subdirectories
- More specific paths override general ones
- User permissions override group permissions

---

## Troubleshooting

### Common Issues

#### "No Storage Zones Available"

**Cause**: No zones are configured or you don't have access to any.

**Solution**:
- Contact your administrator to grant zone access
- Admins: Create zones in Storage > Zones and add allowed users/groups

#### "Failed to load files"

**Cause**: Various - network issues, permission problems, or zone misconfiguration.

**Solution**:
- Check your network connection
- Refresh the page
- Contact administrator if issue persists

#### "Upload failed"

**Cause**: File too large, type blocked, quota exceeded, or no write permission.

**Solution**:
- Check if file type is allowed in the zone
- Check if you're within your quota
- Try a smaller file
- Verify you have upload permission

#### "Share link expired"

**Cause**: The share link has passed its expiration date.

**Solution**:
- Create a new share link with a longer expiration
- Set expiration to "Never" for permanent links

#### "Password incorrect" (share link)

**Cause**: Wrong password entered for password-protected share.

**Solution**:
- Verify the password with the person who shared the link
- Create a new share without password if possible

### Getting Help

If you encounter issues not covered here:

1. Check the server logs (Admin: Server > Logs)
2. Contact your system administrator
3. Report bugs at the project repository

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `/` | Focus search box |
| `Escape` | Close dialogs |
| `Enter` | Confirm dialogs |

---

## Glossary

| Term | Definition |
|------|------------|
| **Storage Pool** | A physical storage location on the server |
| **Share Zone** | A designated directory within a pool for user access |
| **Share Link** | A URL that provides access to files without authentication |
| **SMB** | Server Message Block - Windows file sharing protocol |
| **NFS** | Network File System - Unix file sharing protocol |
| **LVM** | Logical Volume Manager - flexible disk management |
| **Quota** | Storage limit for a user or group |

---

## Quick Reference

### File Size Limits

Configured per Storage Pool by administrators.

### Supported File Types

All file types are supported unless specifically blocked by the pool configuration.

### Browser Compatibility

FileServ works best with modern browsers:
- Chrome 90+
- Firefox 90+
- Safari 14+
- Edge 90+

---

*FileServ - Modern File Sharing Made Simple*
