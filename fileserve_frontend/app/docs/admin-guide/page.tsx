"use client";

import { DocLayout } from "@/components/docs/doc-layout";

const content = `# FileServ Administrator Guide

A comprehensive, beginner-friendly guide for first-time system administrators managing FileServ.

---

## Welcome to FileServ Administration

Congratulations! You've been tasked with managing FileServ, a modern file sharing and storage management platform. This guide is designed specifically for first-time system administrators and will walk you through everything you need to know.

### What is FileServ?

FileServ is a web-based file server that allows users to:
- Store and organize files in designated storage areas
- Share files with other users or external parties via secure links
- Access files through both the web interface and traditional network protocols (SMB/NFS)

As an administrator, you'll be responsible for:
- Setting up where files are stored (storage pools and zones)
- Managing who can access what (users and permissions)
- Configuring network shares for desktop access
- Monitoring server health and storage usage

### Before You Begin

Make sure you have:
- ✅ Access to the FileServ web interface
- ✅ Administrator login credentials
- ✅ Basic understanding of file systems and directories
- ✅ (Optional) SSH access to the server for advanced tasks

---

## Understanding FileServ

Before diving into administration tasks, let's understand how FileServ organizes storage.

### The Storage Hierarchy

FileServ uses a three-level hierarchy:

\`\`\`
┌─────────────────────────────────────────────────────────┐
│                    STORAGE POOLS                         │
│  Physical storage locations on the server               │
│  Example: /srv/data, /mnt/storage                       │
├─────────────────────────────────────────────────────────┤
│                     SHARE ZONES                          │
│  Designated areas within pools for user access          │
│  Example: Personal Files, Team Projects, Public Docs    │
├─────────────────────────────────────────────────────────┤
│                    USER FILES                            │
│  Actual files and folders users work with               │
│  Organized within their accessible zones                │
└─────────────────────────────────────────────────────────┘
\`\`\`

### Why This Matters

- **Storage Pools** = Where files physically live on the disk
- **Share Zones** = Logical boundaries that control access
- **Files** = The actual content users create and manage

Think of it like an office building:
- **Storage Pool** = The building itself
- **Share Zone** = Different departments/floors
- **Files** = Documents in each department

---

## Getting Started: Your First Steps

### Step 1: Log In as Administrator

1. Open your web browser and navigate to your FileServ URL
2. Enter the admin credentials:
   - **Default Username**: \`admin\`
   - **Default Password**: \`admin\`
3. Click **Sign In**

⚠️ **CRITICAL FIRST ACTION**: Change the default password immediately!

### Step 2: Change Your Password

1. After logging in, click on your username in the sidebar
2. Navigate to **Settings**
3. Find the **Change Password** section
4. Enter a strong password (at least 12 characters, mix of letters, numbers, symbols)
5. Click **Update Password**

### Step 3: Verify Admin Access

You should see these admin-only sections in the sidebar:
- **Admin Dashboard** (or just "Admin")
- **Users**
- **Permissions**
- **Storage** (Pools, Zones, Disks)
- **System Users**

If you don't see these, you may not have admin privileges.

### Step 4: Plan Your Storage Structure

Before creating anything, plan how you want to organize storage:

**Example Organization:**

| Pool | Purpose | Path |
|------|---------|------|
| Primary Storage | Main user files | \`/srv/fileserv/data\` |
| Archive Storage | Long-term backups | \`/srv/fileserv/archive\` |

| Zone | Pool | Type | Who Uses It |
|------|------|------|-------------|
| Personal Files | Primary | Personal | All users (each gets own folder) |
| Engineering | Primary | Group | Engineering team |
| Company Docs | Primary | Public | All users |

---

## The Admin Dashboard

The Admin Dashboard is your command center. Here's what each section shows:

### Statistics Cards

| Card | What It Shows | Why It Matters |
|------|---------------|----------------|
| **Total Users** | Number of registered users | Track user growth |
| **Total Files** | Count of all files in the system | Monitor usage patterns |
| **Storage Used** | Total disk space consumed | Plan for capacity |
| **System Status** | Overall health indicator | Spot problems quickly |

### Quick Actions

The dashboard provides shortcuts to common tasks:
- **User Management** → Add or modify users
- **Permissions** → Control file access
- **Browse Files** → View all system files

---

## User Management

Users are the people who access FileServ. There are two types of users:

### Internal Users vs System Users

| Type | Description | Use Case |
|------|-------------|----------|
| **Internal Users** | Created in FileServ's database | Web interface access, share links |
| **System Users** | Linux users on the server | SMB/NFS network access |

Most of the time, you'll work with **Internal Users**.

### Creating a New User

1. Navigate to **Users** in the sidebar
2. Click the **Add User** button
3. Fill in the required fields:

| Field | Required | Description |
|-------|----------|-------------|
| **Username** | Yes | Login name (e.g., \`john.doe\`) |
| **Password** | Yes | Initial password (user should change it) |
| **Email** | No | Contact email |
| **Admin** | No | Check to give admin privileges |

4. Click **Create User**

### User Roles Explained

| Role | Capabilities |
|------|--------------|
| **Regular User** | Access assigned zones, manage own files, create share links |
| **Admin** | Everything above + full system access, user management, storage configuration |

### Editing a User

1. Find the user in the list
2. Click the **⋮** (more options) menu
3. Select the action:
   - **Make Admin** / **Remove Admin** - Toggle admin status
   - **Delete** - Remove the user (cannot be undone!)

### Best Practices for User Management

✅ **Do:**
- Use descriptive usernames (e.g., \`john.smith\` not \`user1\`)
- Require users to change their initial password
- Remove users promptly when they leave the organization
- Limit admin accounts to those who truly need them

❌ **Don't:**
- Share user accounts between people
- Use weak or obvious passwords
- Give admin rights unnecessarily
- Delete users without backing up their files first

---

## Storage Pools & Zones

This is the core of FileServ configuration. Understanding this well will make everything else easier.

### What is a Storage Pool?

A Storage Pool is a **physical location on the server** where files are stored. Think of it as a designated hard drive or folder that FileServ manages.

#### Creating a Storage Pool

1. Navigate to **Storage** → **Pools** (or find the Storage section)
2. Click **Create Pool**
3. Configure the pool:

| Setting | Description | Example |
|---------|-------------|---------|
| **Name** | Display name | "Primary Storage" |
| **Path** | Full server path | \`/srv/fileserv/data\` |
| **Description** | What it's for | "Main storage for user files" |
| **Enabled** | Active or disabled | ✓ Enabled |
| **Max File Size** | Largest allowed file (0=unlimited) | 5368709120 (5 GB) |
| **Allowed Types** | File extensions allowed (empty=all) | Leave empty |
| **Denied Types** | Blocked file extensions | \`exe,bat,sh\` |
| **Default Quota** | Storage limit per user | 10737418240 (10 GB) |

4. Click **Create**

⚠️ **Important**: The path must exist on the server and be writable by FileServ!

#### Storage Pool Settings Explained

**Max File Size:**
- Prevents users from uploading extremely large files
- Set to 0 for unlimited
- Value is in bytes (5 GB = 5,368,709,120 bytes)

**Allowed/Denied Types:**
- Controls what file types can be uploaded
- Leave "Allowed Types" empty to allow everything
- Common denied types: \`exe,bat,cmd,sh,ps1\` (executable files)

**Default Quota:**
- How much space each user gets by default
- Can be overridden per-user
- Value is in bytes

### What is a Share Zone?

A Share Zone is a **logical subdivision** within a Storage Pool that users can access. It defines:
- Which users/groups can access it
- What type of access they have
- How files are organized

#### Zone Types

| Type | Description | Best For |
|------|-------------|----------|
| **Personal** | Each user gets their own private folder | User home directories |
| **Group** | Shared folder for specific groups | Team collaboration |
| **Public** | Accessible to all authenticated users | Company-wide resources |

#### Creating a Share Zone

FileServ uses a comprehensive zone creation wizard that guides you through all configuration options.

1. Navigate to **Storage** → **Zones**
2. Click **Create Zone** (opens the zone creation wizard)
3. The wizard has 6 steps:

**Step 1: Basic Information**

| Setting | Description |
|---------|-------------|
| **Pool** | Which storage pool to use |
| **Name** | Display name users will see |
| **Path** | Folder within the pool (relative or browse) |
| **Zone Type** | Personal, Group, or Public |
| **Description** | Help text for users |

**Step 2: Access Control**

| Setting | Description |
|---------|-------------|
| **Allowed Users** | Usernames with access (* = all) |
| **Allowed Groups** | Groups with access |
| **Deny Users** | Users explicitly denied access |
| **Deny Groups** | Groups explicitly denied access |
| **Auto-Provision** | Create user folders automatically |
| **User Quota** | Storage limit per user in this zone |

**Step 3: SMB Configuration** (optional)

| Setting | Description |
|---------|-------------|
| **Enable SMB** | Share this zone via SMB/Samba |
| **Share Name** | Network name for the share (no spaces) |
| **Comment** | Description shown to clients |
| **Browsable** | Show in network browser |
| **Read Only** | Prevent modifications via SMB |
| **Guest Access** | Allow anonymous access (security risk!) |
| **Create/Directory Mask** | Default permissions for new files/folders |
| **Force User/Group** | Run all operations as specific user/group |
| **Veto Files** | File patterns to hide/block |

**Step 4: NFS Configuration** (optional)

| Setting | Description |
|---------|-------------|
| **Enable NFS** | Export this zone via NFS |
| **Export Path** | Custom export path (optional) |
| **Allowed Hosts** | Hosts/networks allowed (e.g., \`192.168.1.0/24\`) |
| **Root Squash** | Map root to nobody (recommended) |
| **All Squash** | Map all users to anonymous |
| **Anon UID/GID** | Anonymous user/group IDs |
| **Sync** | Write changes immediately |
| **Secure** | Require privileged ports |

**Step 5: Web Sharing** (optional)

| Setting | Description |
|---------|-------------|
| **Allow Web Shares** | Users can create share links |
| **Public Links** | Allow public (unauthenticated) links |
| **Max Link Expiry** | Maximum days a share link is valid |
| **Allow Download** | Users can download files |
| **Allow Upload** | Users can upload files |
| **Allow Preview** | Users can preview files in browser |
| **Allow Listing** | Users can see directory contents |
| **Require Auth** | Require authentication for access |

**Step 6: Review & Create**

Review all settings and click **Create Zone**.

4. After creation, you can edit any settings from the Zones list page

#### Example Zone Configurations

**Personal User Storage:**
\`\`\`
Name: My Files
Pool: Primary Storage
Path: users
Zone Type: Personal
Auto-Provision: ✓ Yes
Allowed Users: *
Allow Web Shares: ✓ Yes
\`\`\`
*Each user gets their own private folder within \`/srv/fileserv/data/users/\`*

**Engineering Team Folder:**
\`\`\`
Name: Engineering Projects
Pool: Primary Storage
Path: teams/engineering
Zone Type: Group
Allowed Groups: engineering, devops
Allow Web Shares: ✓ Yes
\`\`\`
*Only engineering and devops group members can access*

**Company-Wide Resources:**
\`\`\`
Name: Company Documents
Pool: Primary Storage
Path: public
Zone Type: Public
Allowed Users: *
Allow Web Shares: ✗ No
\`\`\`
*Everyone can access, but no external sharing allowed*

### Understanding Auto-Provisioning

When enabled for Personal zones:
1. User logs in for the first time
2. FileServ automatically creates a folder named after their username
3. User only sees and accesses their own folder
4. Other users' folders are completely invisible

**Example:**
- Zone path: \`/srv/fileserv/data/users\`
- User \`john\` logs in → \`/srv/fileserv/data/users/john/\` is created
- User \`jane\` logs in → \`/srv/fileserv/data/users/jane/\` is created
- John can only see his folder, Jane can only see hers

---

## Permissions Management

Permissions control who can do what with files. FileServ uses a simple but powerful permission system.

### Permission Levels

| Level | What It Allows |
|-------|----------------|
| **Read** | View and download files |
| **Write** | Upload, create folders, modify files |
| **Delete** | Remove files and folders (includes read & write) |

*Note: Higher levels include lower levels. Delete permission includes read and write.*

### How Permissions Work

Permissions are applied based on:
1. **Path** - The folder being accessed
2. **User or Group** - Who the permission applies to
3. **Type** - What they can do (read/write/delete)

**Example:**
\`\`\`
Path: /projects/website
User: john
Permission: write
\`\`\`
*John can read and write to the website project folder*

### Creating a Permission

1. Navigate to **Permissions**
2. Click **Add Permission**
3. Configure:

| Field | Description |
|-------|-------------|
| **Path** | The folder path (e.g., \`/projects/\`) |
| **Assign to** | User or Group |
| **User/Group** | Select from dropdown |
| **Permission Level** | Read Only, Read & Write, or Full Access |

4. Click **Add Permission**

### Permission Tips

✅ **Best Practices:**
- Use group permissions when possible (easier to manage)
- Start with read-only, grant write only when needed
- Document why permissions were granted
- Review permissions periodically

⚠️ **Important Notes:**
- Admins have full access to everything automatically
- Permissions are inherited (applies to subfolders too)
- More specific paths override general ones
- User permissions override group permissions

---

## Network Shares (SMB/NFS)

Network shares allow users to access FileServ files directly from their desktop, like a network drive. In FileServ, network sharing is **integrated into Share Zones**, giving you one central place to manage storage locations, access control, and network sharing.

### SMB vs NFS: Which to Use?

| Protocol | Best For | Typical Users |
|----------|----------|---------------|
| **SMB** (Samba) | Windows, macOS | Office workers, Windows environments |
| **NFS** | Linux, Unix | Developers, Linux workstations, servers |

*When in doubt, use SMB – it works on all platforms.*

### Enabling Network Shares on a Zone

Network sharing is configured as part of a Share Zone. To enable SMB or NFS:

1. Navigate to **Storage** → **Zones**
2. Either **Create Zone** (opens the wizard) or click **⋮** → **Edit** on an existing zone
3. Enable SMB and/or NFS in the respective tabs
4. Configure the protocol-specific options (see Zone creation steps above)

#### Example: Enabling SMB on an Existing Zone

1. Find the zone in the list (e.g., "Company Documents")
2. Click **⋮** → **Edit**
3. Switch to the **SMB** tab
4. Toggle **Enable SMB** on
5. Set the **Share Name** (e.g., \`company-docs\`)
6. Configure other options as needed
7. Click **Save Changes**

The zone is now accessible via SMB using the share name you specified.

### Viewing Network-Enabled Zones

On the Zones list page, you can quickly see which zones have network sharing enabled:
- **SMB** badge = Zone is shared via SMB/Samba
- **NFS** badge = Zone is exported via NFS
- **Web** badge = Zone allows web share links

### Connecting to SMB Shares

**From Windows:**
1. Open File Explorer
2. Type in address bar: \`\\\\server-address\\sharename\`
3. Enter username and password when prompted

**From macOS:**
1. Open Finder
2. Press \`Cmd + K\`
3. Type: \`smb://server-address/sharename\`
4. Enter credentials

**From Linux:**
1. Open file manager
2. Type: \`smb://server-address/sharename\`
3. Or mount from terminal:
   \`\`\`bash
   mount -t cifs //server-address/sharename /mnt/point -o username=youruser
   \`\`\`

### Connecting to NFS Exports

**From Linux:**
\`\`\`bash
# Mount NFS export
mount -t nfs server-address:/export/path /mnt/point

# Or add to /etc/fstab for automatic mounting
server-address:/export/path /mnt/point nfs defaults 0 0
\`\`\`

**From macOS:**
1. Open Finder
2. Press \`Cmd + K\`
3. Type: \`nfs://server-address/export/path\`

---

## System Users & Groups

System users are the Linux accounts on the server itself. They're important for:
- Network share authentication (SMB/NFS)
- File ownership and permissions
- Service accounts

### Viewing System Users

1. Navigate to **System Users**
2. View the list of local Linux users
3. Use **Show system accounts** to see service accounts

### Understanding the User List

| Column | Description |
|--------|-------------|
| **Username** | Linux login name |
| **Name** | Full name (from GECOS field) |
| **UID/GID** | User and Group IDs |
| **Groups** | Additional group memberships |
| **Home** | Home directory path |
| **Shell** | Login shell (e.g., /bin/bash) |

### Why System Users Matter

For SMB shares to work properly:
1. The user authenticating must exist as a system user
2. That system user needs file permissions on the shared directory
3. The user must have a Samba password set

If users can't access network shares, check:
- Does the system user exist?
- Is the user in the right groups?
- Has a Samba password been set? (\`smbpasswd -a username\`)

---

## Storage & Disk Management

The Storage section provides comprehensive disk and volume management.

### Storage Overview

The overview shows:
- **Total Capacity** - All available storage
- **Used Storage** - Currently consumed space
- **Free Space** - Available for use
- **Storage Features** - LVM, RAID, ZFS status

### Health Monitoring

Watch for these indicators:

| Status | Color | Action Required |
|--------|-------|-----------------|
| Healthy | Green | None |
| Warning | Yellow | Investigate soon |
| Critical | Red | Immediate attention |

### Understanding Mount Points

Mount points show where storage is attached:

| Mount Path | Typical Use |
|------------|-------------|
| \`/\` | System root |
| \`/home\` | User home directories |
| \`/srv\` | Service data (FileServ usually here) |
| \`/var\` | Variable data, logs |

Monitor usage on these paths to prevent full disk issues.

### Disk Alerts

FileServ monitors for:
- **High usage** - When partitions exceed 80-90%
- **Disk health issues** - SMART warnings
- **Temperature warnings** - Overheating disks

When you see alerts:
1. Identify the affected storage
2. Check what's consuming space
3. Clean up or expand storage
4. Address hardware issues promptly

---

## Security Best Practices

Security is everyone's responsibility. Follow these practices to keep FileServ safe.

### Essential Security Measures

#### 1. Use HTTPS (TLS/SSL)

Never run FileServ in production without HTTPS!

\`\`\`bash
# Set environment variables for TLS
export TLS_CERT=/path/to/certificate.pem
export TLS_KEY=/path/to/private-key.pem
\`\`\`

Or use a reverse proxy (nginx, Caddy) for TLS termination.

#### 2. Strong Passwords

Enforce these rules:
- Minimum 12 characters
- Mix of uppercase, lowercase, numbers, symbols
- No dictionary words
- Different for each service

#### 3. Limit Admin Accounts

- Only give admin rights when absolutely necessary
- Use regular accounts for daily work
- Document who has admin access and why

#### 4. Regular Updates

Keep the server updated:
\`\`\`bash
# For Ubuntu/Debian
sudo apt update && sudo apt upgrade

# For RHEL/Rocky/Alma
sudo dnf update
\`\`\`

#### 5. Firewall Configuration

Only allow necessary ports:

| Port | Service | Should Be Open? |
|------|---------|-----------------|
| 443 | HTTPS | Yes (web access) |
| 80 | HTTP | Only for redirect |
| 445 | SMB | If using network shares |
| 2049 | NFS | If using NFS |
| 22 | SSH | Admin only, restricted IPs |

### Access Control Checklist

- [ ] Changed default admin password
- [ ] Using HTTPS
- [ ] Firewall configured
- [ ] Regular backups running
- [ ] Logs being monitored
- [ ] Unused accounts removed
- [ ] Permissions reviewed monthly

---

## Backup & Recovery

Backups are your safety net. Set them up before you need them!

### What to Backup

| Component | Location | Priority |
|-----------|----------|----------|
| **Configuration** | \`storage.json\` | Critical |
| **User Files** | Storage pool paths | Critical |
| **TLS Certificates** | Usually \`/etc/ssl/\` | Important |
| **Custom Configs** | Service files | Important |

### Backup Strategy

Follow the **3-2-1 Rule**:
- **3** copies of your data
- **2** different storage media
- **1** copy offsite

### Automated Backup Script

Save this as \`/opt/fileserv/backup.sh\`:

\`\`\`bash
#!/bin/bash
# FileServ Backup Script

BACKUP_DIR="/backup/fileserv/$(date +%Y%m%d)"
DATA_PATH="/srv/fileserv"
CONFIG_PATH="/var/lib/fileserv/storage.json"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup configuration
echo "Backing up configuration..."
cp "$CONFIG_PATH" "$BACKUP_DIR/"

# Backup data
echo "Backing up data..."
rsync -av --delete "$DATA_PATH/" "$BACKUP_DIR/data/"

# Compress
echo "Compressing..."
tar -czf "$BACKUP_DIR.tar.gz" -C /backup/fileserv "$(date +%Y%m%d)"
rm -rf "$BACKUP_DIR"

# Clean old backups (keep 30 days)
find /backup/fileserv -name "*.tar.gz" -mtime +30 -delete

echo "Backup completed: $BACKUP_DIR.tar.gz"
\`\`\`

Schedule with cron:
\`\`\`bash
# Daily backup at 2 AM
0 2 * * * /opt/fileserv/backup.sh
\`\`\`

### Recovery Procedure

If you need to restore:

1. **Stop FileServ**
   \`\`\`bash
   sudo systemctl stop fileserv
   \`\`\`

2. **Restore Configuration**
   \`\`\`bash
   cp /backup/fileserv/YYYYMMDD/storage.json /var/lib/fileserv/
   \`\`\`

3. **Restore Data**
   \`\`\`bash
   rsync -av /backup/fileserv/YYYYMMDD/data/ /srv/fileserv/
   \`\`\`

4. **Start FileServ**
   \`\`\`bash
   sudo systemctl start fileserv
   \`\`\`

5. **Verify**
   - Log in and check files
   - Verify user accounts
   - Test file access

---

## Troubleshooting Guide

### Common Problems and Solutions

#### Users Can't Log In

**Symptoms:** "Invalid credentials" error

**Check:**
1. Is the username spelled correctly?
2. Is the account enabled?
3. Has the password expired?

**Solutions:**
- Reset the user's password
- Create a new account if needed
- Check for typos in username

---

#### "No Storage Zones Available"

**Symptoms:** Users see no zones in the file browser

**Check:**
1. Are zones configured?
2. Is the user in allowed users/groups?
3. Is the zone enabled?

**Solutions:**
- Add user to zone's allowed users
- Add user to a group that has access
- Create a zone for the user

---

#### File Upload Fails

**Symptoms:** Upload error or timeout

**Check:**
1. File size vs. pool limit
2. File type vs. allowed/denied types
3. Available disk space
4. User quota

**Solutions:**
- Increase pool max file size
- Allow the file type
- Free up disk space
- Increase user quota

---

#### Network Share Not Accessible

**Symptoms:** Can't connect via SMB/NFS

**Check:**
1. Is SMB/NFS enabled on the zone? (check zone settings)
2. Does the user have access to the zone?
3. Is the Samba/NFS service running?
4. Firewall blocking ports?

**Solutions:**
- Edit the zone and enable SMB or NFS
- Add user to zone's allowed users or groups
- Start Samba: \`sudo systemctl start smb\`
- Start NFS: \`sudo systemctl start nfs-server\`
- Open firewall ports (445 for SMB, 2049 for NFS)

---

#### Slow Performance

**Symptoms:** Pages load slowly, uploads/downloads are slow

**Check:**
1. Server CPU/memory usage
2. Disk I/O (is disk busy?)
3. Network bandwidth
4. Number of concurrent users

**Solutions:**
- Upgrade server resources
- Move to faster storage
- Optimize network
- Add caching

---

#### Disk Full Errors

**Symptoms:** "No space left on device" errors

**Check:**
1. Which partition is full?
2. What's consuming space?

Find large files:
\`\`\`bash
du -h /srv/fileserv | sort -rh | head -20
\`\`\`

**Solutions:**
- Clean up old/unnecessary files
- Move data to larger storage
- Expand the partition
- Set up log rotation

---

### Getting Help

If you're stuck:

1. **Check the logs** - Most answers are there
2. **Review this guide** - Common issues are covered
3. **Check permissions** - Many issues are permission-related
4. **Restart the service** - Sometimes it just helps
5. **Ask for help** - Document what you've tried

When asking for help, provide:
- What you were trying to do
- What happened instead
- Any error messages
- Relevant log entries
- What you've already tried

---

## Glossary

| Term | Definition |
|------|------------|
| **Admin** | User with full system access |
| **Auto-Provision** | Automatically create user folders |
| **Firewall** | Network security filter |
| **Group** | Collection of users for permission management |
| **LVM** | Logical Volume Manager (flexible disk management) |
| **Mount Point** | Where a disk is attached in the file system |
| **NFS** | Network File System (Unix file sharing) |
| **Partition** | Division of a physical disk |
| **Pool** | Physical storage location |
| **Quota** | Storage limit for a user/group |
| **RAID** | Redundant Array of Independent Disks |
| **SMB** | Server Message Block (Windows file sharing, Samba) |
| **TLS/SSL** | Encryption for network traffic (HTTPS) |
| **Zone** | Logical storage area with access controls |
| **ZFS** | Advanced file system with built-in features |

---

## Quick Reference Card

### Daily Checklist
- [ ] Check admin dashboard for alerts
- [ ] Review storage usage
- [ ] Check for failed logins

### New User Setup
1. Create internal user account
2. Assign to appropriate groups
3. Verify zone access
4. (Optional) Create system user for SMB access
5. Communicate credentials securely

### New Storage Area
1. Ensure path exists on server
2. Create storage pool (if needed)
3. Create share zone with the wizard:
   - Set basic info and zone type
   - Configure access (users/groups)
   - Enable SMB/NFS if network sharing needed
   - Configure web sharing options
4. Test access (web, SMB, NFS as applicable)

---

*FileServ Administrator Guide - Version 2.1*
*Last Updated: December 2024*
*Zone-based network sharing architecture*
`;

export default function AdminGuidePage() {
  return (
    <DocLayout
      title="Administrator Guide"
      content={content}
      prevDoc={{ title: "User Guide", href: "/docs/user-guide" }}
      requireAdmin={true}
    />
  );
}
