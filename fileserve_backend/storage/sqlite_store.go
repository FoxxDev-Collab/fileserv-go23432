package storage

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"fileserv/models"

	"github.com/google/uuid"
	_ "modernc.org/sqlite"
)

// SQLiteStore implements the Store interface using SQLite for persistent storage
type SQLiteStore struct {
	db *sql.DB
}

// NewSQLiteStore creates a new SQLite-backed store
func NewSQLiteStore(dbPath string) (*SQLiteStore, error) {
	db, err := sql.Open("sqlite", dbPath+"?_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)&_pragma=busy_timeout(5000)&_pragma=cache_size(-64000)")
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Set connection pool settings
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(10)
	db.SetConnMaxLifetime(5 * time.Minute)

	store := &SQLiteStore{db: db}

	if err := store.initSchema(); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to initialize schema: %w", err)
	}

	return store, nil
}

// Close closes the database connection
func (s *SQLiteStore) Close() error {
	return s.db.Close()
}

// initSchema creates all tables and indexes
func (s *SQLiteStore) initSchema() error {
	schema := `
	-- Users table
	CREATE TABLE IF NOT EXISTS users (
		id TEXT PRIMARY KEY,
		username TEXT UNIQUE NOT NULL,
		password_hash TEXT NOT NULL,
		email TEXT,
		is_admin INTEGER NOT NULL DEFAULT 0,
		groups TEXT DEFAULT '[]',
		must_change_password INTEGER NOT NULL DEFAULT 0,
		created_at DATETIME NOT NULL,
		updated_at DATETIME NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

	-- Sessions table
	CREATE TABLE IF NOT EXISTS sessions (
		token TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		expires_at DATETIME NOT NULL,
		created_at DATETIME NOT NULL,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
	);
	CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
	CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

	-- Permissions table
	CREATE TABLE IF NOT EXISTS permissions (
		id TEXT PRIMARY KEY,
		path TEXT NOT NULL,
		type TEXT NOT NULL,
		username TEXT,
		group_name TEXT,
		created_at DATETIME NOT NULL,
		updated_at DATETIME NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_permissions_path ON permissions(path);
	CREATE INDEX IF NOT EXISTS idx_permissions_username ON permissions(username);
	CREATE INDEX IF NOT EXISTS idx_permissions_group ON permissions(group_name);

	-- Shares table (SMB/NFS)
	CREATE TABLE IF NOT EXISTS shares (
		id TEXT PRIMARY KEY,
		name TEXT UNIQUE NOT NULL,
		path TEXT NOT NULL,
		protocol TEXT NOT NULL,
		description TEXT,
		enabled INTEGER NOT NULL DEFAULT 1,
		zone_id TEXT,
		owner_id TEXT,
		allowed_users TEXT DEFAULT '[]',
		allowed_groups TEXT DEFAULT '[]',
		deny_users TEXT DEFAULT '[]',
		deny_groups TEXT DEFAULT '[]',
		guest_access INTEGER NOT NULL DEFAULT 0,
		read_only INTEGER NOT NULL DEFAULT 0,
		browsable INTEGER NOT NULL DEFAULT 1,
		smb_options TEXT,
		nfs_options TEXT,
		created_at DATETIME NOT NULL,
		updated_at DATETIME NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_shares_name ON shares(name);
	CREATE INDEX IF NOT EXISTS idx_shares_protocol ON shares(protocol);

	-- Storage pools table
	CREATE TABLE IF NOT EXISTS storage_pools (
		id TEXT PRIMARY KEY,
		name TEXT UNIQUE NOT NULL,
		path TEXT NOT NULL,
		description TEXT,
		enabled INTEGER NOT NULL DEFAULT 1,
		total_space INTEGER NOT NULL DEFAULT 0,
		used_space INTEGER NOT NULL DEFAULT 0,
		free_space INTEGER NOT NULL DEFAULT 0,
		reserved INTEGER NOT NULL DEFAULT 0,
		max_file_size INTEGER NOT NULL DEFAULT 0,
		allowed_types TEXT DEFAULT '[]',
		denied_types TEXT DEFAULT '[]',
		default_user_quota INTEGER NOT NULL DEFAULT 0,
		default_group_quota INTEGER NOT NULL DEFAULT 0,
		created_at DATETIME NOT NULL,
		updated_at DATETIME NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_storage_pools_name ON storage_pools(name);

	-- Share zones table
	CREATE TABLE IF NOT EXISTS share_zones (
		id TEXT PRIMARY KEY,
		pool_id TEXT NOT NULL,
		name TEXT UNIQUE NOT NULL,
		path TEXT NOT NULL,
		description TEXT,
		zone_type TEXT NOT NULL DEFAULT 'group',
		enabled INTEGER NOT NULL DEFAULT 1,
		auto_provision INTEGER NOT NULL DEFAULT 0,
		provision_template TEXT,
		allowed_users TEXT DEFAULT '[]',
		allowed_groups TEXT DEFAULT '[]',
		deny_users TEXT DEFAULT '[]',
		deny_groups TEXT DEFAULT '[]',
		allow_network_shares INTEGER NOT NULL DEFAULT 1,
		allow_web_shares INTEGER NOT NULL DEFAULT 1,
		allow_guest_access INTEGER NOT NULL DEFAULT 0,
		smb_enabled INTEGER NOT NULL DEFAULT 0,
		nfs_enabled INTEGER NOT NULL DEFAULT 0,
		smb_options TEXT,
		nfs_options TEXT,
		web_options TEXT,
		max_quota_per_user INTEGER NOT NULL DEFAULT 0,
		read_only INTEGER NOT NULL DEFAULT 0,
		browsable INTEGER NOT NULL DEFAULT 1,
		created_at DATETIME NOT NULL,
		updated_at DATETIME NOT NULL,
		FOREIGN KEY (pool_id) REFERENCES storage_pools(id)
	);
	CREATE INDEX IF NOT EXISTS idx_share_zones_name ON share_zones(name);
	CREATE INDEX IF NOT EXISTS idx_share_zones_pool_id ON share_zones(pool_id);
	CREATE INDEX IF NOT EXISTS idx_share_zones_zone_type ON share_zones(zone_type);

	-- Settings table (key-value configuration)
	CREATE TABLE IF NOT EXISTS settings (
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL,
		type TEXT NOT NULL DEFAULT 'string',
		category TEXT NOT NULL DEFAULT 'general',
		updated_at DATETIME NOT NULL
	);

	-- Share links table (web sharing)
	CREATE TABLE IF NOT EXISTS share_links (
		id TEXT PRIMARY KEY,
		share_id TEXT,
		owner_id TEXT NOT NULL,
		target_path TEXT NOT NULL,
		target_type TEXT NOT NULL,
		target_name TEXT NOT NULL,
		token TEXT UNIQUE NOT NULL,
		password_hash TEXT,
		expires_at DATETIME,
		max_downloads INTEGER NOT NULL DEFAULT 0,
		download_count INTEGER NOT NULL DEFAULT 0,
		max_views INTEGER NOT NULL DEFAULT 0,
		view_count INTEGER NOT NULL DEFAULT 0,
		allow_download INTEGER NOT NULL DEFAULT 1,
		allow_preview INTEGER NOT NULL DEFAULT 1,
		allow_upload INTEGER NOT NULL DEFAULT 0,
		allow_listing INTEGER NOT NULL DEFAULT 0,
		name TEXT,
		description TEXT,
		custom_message TEXT,
		show_owner INTEGER NOT NULL DEFAULT 0,
		enabled INTEGER NOT NULL DEFAULT 1,
		created_at DATETIME NOT NULL,
		updated_at DATETIME NOT NULL,
		last_accessed DATETIME
	);
	CREATE INDEX IF NOT EXISTS idx_share_links_token ON share_links(token);
	CREATE INDEX IF NOT EXISTS idx_share_links_owner_id ON share_links(owner_id);
	CREATE INDEX IF NOT EXISTS idx_share_links_expires_at ON share_links(expires_at);

	-- Snapshot policies table (automated ZFS snapshots)
	CREATE TABLE IF NOT EXISTS snapshot_policies (
		id TEXT PRIMARY KEY,
		name TEXT UNIQUE NOT NULL,
		dataset TEXT NOT NULL,
		enabled INTEGER NOT NULL DEFAULT 1,
		schedule TEXT NOT NULL,
		retention INTEGER NOT NULL DEFAULT 7,
		prefix TEXT NOT NULL DEFAULT 'auto',
		recursive INTEGER NOT NULL DEFAULT 0,
		last_run DATETIME,
		next_run DATETIME,
		last_error TEXT,
		snapshot_count INTEGER NOT NULL DEFAULT 0,
		created_at DATETIME NOT NULL,
		updated_at DATETIME NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_snapshot_policies_dataset ON snapshot_policies(dataset);
	CREATE INDEX IF NOT EXISTS idx_snapshot_policies_enabled ON snapshot_policies(enabled);
	CREATE INDEX IF NOT EXISTS idx_snapshot_policies_next_run ON snapshot_policies(next_run);
	`

	_, err := s.db.Exec(schema)
	return err
}

// ============================================================================
// User Operations
// ============================================================================

func (s *SQLiteStore) GetUserByUsername(username string) (*models.User, error) {
	row := s.db.QueryRow(`
		SELECT id, username, password_hash, email, is_admin, groups, must_change_password, created_at, updated_at
		FROM users WHERE username = ?`, username)
	return s.scanUser(row)
}

func (s *SQLiteStore) GetUserByID(id string) (*models.User, error) {
	row := s.db.QueryRow(`
		SELECT id, username, password_hash, email, is_admin, groups, must_change_password, created_at, updated_at
		FROM users WHERE id = ?`, id)
	return s.scanUser(row)
}

func (s *SQLiteStore) scanUser(row *sql.Row) (*models.User, error) {
	var user models.User
	var groupsJSON string
	var isAdmin, mustChange int

	err := row.Scan(&user.ID, &user.Username, &user.PasswordHash, &user.Email,
		&isAdmin, &groupsJSON, &mustChange, &user.CreatedAt, &user.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, errors.New("user not found")
	}
	if err != nil {
		return nil, err
	}

	user.IsAdmin = isAdmin == 1
	user.MustChangePassword = mustChange == 1
	json.Unmarshal([]byte(groupsJSON), &user.Groups)

	return &user, nil
}

func (s *SQLiteStore) CreateUser(username, password, email string, isAdmin bool, groups []string) (*models.User, error) {
	user := &models.User{
		ID:                 uuid.New().String(),
		Username:           username,
		Email:              email,
		IsAdmin:            isAdmin,
		Groups:             groups,
		MustChangePassword: false,
		CreatedAt:          time.Now(),
		UpdatedAt:          time.Now(),
	}

	if err := user.SetPassword(password); err != nil {
		return nil, err
	}

	groupsJSON, _ := json.Marshal(groups)
	isAdminInt := 0
	if isAdmin {
		isAdminInt = 1
	}

	_, err := s.db.Exec(`
		INSERT INTO users (id, username, password_hash, email, is_admin, groups, must_change_password, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
		user.ID, user.Username, user.PasswordHash, user.Email, isAdminInt, string(groupsJSON), user.CreatedAt, user.UpdatedAt)

	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			return nil, errors.New("username already exists")
		}
		return nil, err
	}

	return user, nil
}

func (s *SQLiteStore) UpdateUser(id string, updates map[string]interface{}) (*models.User, error) {
	user, err := s.GetUserByID(id)
	if err != nil {
		return nil, err
	}

	if username, ok := updates["username"].(string); ok {
		user.Username = username
	}
	if email, ok := updates["email"].(string); ok {
		user.Email = email
	}
	if isAdmin, ok := updates["is_admin"].(bool); ok {
		user.IsAdmin = isAdmin
	}
	if groups, ok := updates["groups"].([]interface{}); ok {
		user.Groups = make([]string, len(groups))
		for i, g := range groups {
			user.Groups[i] = fmt.Sprint(g)
		}
	}
	if password, ok := updates["password"].(string); ok && password != "" {
		if err := user.SetPassword(password); err != nil {
			return nil, err
		}
		user.MustChangePassword = false
	}
	if mustChange, ok := updates["must_change_password"].(bool); ok {
		user.MustChangePassword = mustChange
	}

	user.UpdatedAt = time.Now()
	groupsJSON, _ := json.Marshal(user.Groups)
	isAdminInt := 0
	if user.IsAdmin {
		isAdminInt = 1
	}
	mustChangeInt := 0
	if user.MustChangePassword {
		mustChangeInt = 1
	}

	_, err = s.db.Exec(`
		UPDATE users SET username=?, password_hash=?, email=?, is_admin=?, groups=?, must_change_password=?, updated_at=?
		WHERE id=?`,
		user.Username, user.PasswordHash, user.Email, isAdminInt, string(groupsJSON), mustChangeInt, user.UpdatedAt, id)

	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			return nil, errors.New("username already exists")
		}
		return nil, err
	}

	return user, nil
}

func (s *SQLiteStore) DeleteUser(id string) error {
	result, err := s.db.Exec("DELETE FROM users WHERE id = ?", id)
	if err != nil {
		return err
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return errors.New("user not found")
	}
	return nil
}

func (s *SQLiteStore) ListUsers() []*models.User {
	rows, err := s.db.Query(`
		SELECT id, username, password_hash, email, is_admin, groups, must_change_password, created_at, updated_at
		FROM users ORDER BY username`)
	if err != nil {
		return []*models.User{}
	}
	defer rows.Close()

	var users []*models.User
	for rows.Next() {
		var user models.User
		var groupsJSON string
		var isAdmin, mustChange int

		if err := rows.Scan(&user.ID, &user.Username, &user.PasswordHash, &user.Email,
			&isAdmin, &groupsJSON, &mustChange, &user.CreatedAt, &user.UpdatedAt); err != nil {
			continue
		}

		user.IsAdmin = isAdmin == 1
		user.MustChangePassword = mustChange == 1
		json.Unmarshal([]byte(groupsJSON), &user.Groups)
		users = append(users, &user)
	}

	return users
}

// ============================================================================
// Session Operations
// ============================================================================

func (s *SQLiteStore) CreateSession(userID string, token string, expiresAt time.Time) error {
	_, err := s.db.Exec(`
		INSERT INTO sessions (token, user_id, expires_at, created_at)
		VALUES (?, ?, ?, ?)`,
		token, userID, expiresAt, time.Now())
	return err
}

func (s *SQLiteStore) GetSession(token string) (*models.Session, error) {
	var session models.Session
	err := s.db.QueryRow(`
		SELECT token, user_id, expires_at, created_at FROM sessions WHERE token = ?`, token).
		Scan(&session.Token, &session.UserID, &session.ExpiresAt, &session.CreatedAt)

	if err == sql.ErrNoRows {
		return nil, errors.New("session not found")
	}
	if err != nil {
		return nil, err
	}

	if session.IsExpired() {
		return nil, errors.New("session expired")
	}

	return &session, nil
}

func (s *SQLiteStore) DeleteSession(token string) error {
	_, err := s.db.Exec("DELETE FROM sessions WHERE token = ?", token)
	return err
}

func (s *SQLiteStore) CleanExpiredSessions() error {
	_, err := s.db.Exec("DELETE FROM sessions WHERE expires_at < ?", time.Now())
	return err
}

// ============================================================================
// Permission Operations
// ============================================================================

func (s *SQLiteStore) CreatePermission(path string, permType models.PermissionType, username, group string) (*models.Permission, error) {
	perm := models.Permission{
		ID:        uuid.New().String(),
		Path:      path,
		Type:      permType,
		Username:  username,
		Group:     group,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	_, err := s.db.Exec(`
		INSERT INTO permissions (id, path, type, username, group_name, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)`,
		perm.ID, perm.Path, perm.Type, perm.Username, perm.Group, perm.CreatedAt, perm.UpdatedAt)

	if err != nil {
		return nil, err
	}

	return &perm, nil
}

func (s *SQLiteStore) DeletePermission(id string) error {
	result, err := s.db.Exec("DELETE FROM permissions WHERE id = ?", id)
	if err != nil {
		return err
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return errors.New("permission not found")
	}
	return nil
}

func (s *SQLiteStore) UpdatePermission(id string, path string, permType models.PermissionType, username, group string) (*models.Permission, error) {
	now := time.Now()

	// Build dynamic update
	updates := []string{"updated_at = ?"}
	args := []interface{}{now}

	if path != "" {
		updates = append(updates, "path = ?")
		args = append(args, path)
	}
	if permType != "" {
		updates = append(updates, "type = ?")
		args = append(args, permType)
	}
	if username != "" {
		updates = append(updates, "username = ?", "group_name = ''")
		args = append(args, username)
	}
	if group != "" {
		updates = append(updates, "group_name = ?", "username = ''")
		args = append(args, group)
	}

	args = append(args, id)
	query := fmt.Sprintf("UPDATE permissions SET %s WHERE id = ?", strings.Join(updates, ", "))

	result, err := s.db.Exec(query, args...)
	if err != nil {
		return nil, err
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return nil, errors.New("permission not found")
	}

	// Fetch and return updated permission
	var perm models.Permission
	err = s.db.QueryRow(`
		SELECT id, path, type, username, group_name, created_at, updated_at
		FROM permissions WHERE id = ?`, id).
		Scan(&perm.ID, &perm.Path, &perm.Type, &perm.Username, &perm.Group, &perm.CreatedAt, &perm.UpdatedAt)

	return &perm, err
}

func (s *SQLiteStore) ListPermissions() []models.Permission {
	return s.GetPermissions()
}

func (s *SQLiteStore) GetPermissions() []models.Permission {
	rows, err := s.db.Query(`
		SELECT id, path, type, username, group_name, created_at, updated_at
		FROM permissions ORDER BY path`)
	if err != nil {
		return []models.Permission{}
	}
	defer rows.Close()

	var perms []models.Permission
	for rows.Next() {
		var perm models.Permission
		if err := rows.Scan(&perm.ID, &perm.Path, &perm.Type, &perm.Username, &perm.Group, &perm.CreatedAt, &perm.UpdatedAt); err != nil {
			continue
		}
		perms = append(perms, perm)
	}

	return perms
}

// ============================================================================
// Share Operations
// ============================================================================

func (s *SQLiteStore) CreateShare(share *models.Share) (*models.Share, error) {
	share.ID = uuid.New().String()
	now := time.Now()
	share.CreatedAt = now
	share.UpdatedAt = now

	allowedUsersJSON, _ := json.Marshal(share.AllowedUsers)
	allowedGroupsJSON, _ := json.Marshal(share.AllowedGroups)
	denyUsersJSON, _ := json.Marshal(share.DenyUsers)
	denyGroupsJSON, _ := json.Marshal(share.DenyGroups)
	smbOptionsJSON, _ := json.Marshal(share.SMBOptions)
	nfsOptionsJSON, _ := json.Marshal(share.NFSOptions)

	_, err := s.db.Exec(`
		INSERT INTO shares (id, name, path, protocol, description, enabled, zone_id, owner_id,
			allowed_users, allowed_groups, deny_users, deny_groups, guest_access, read_only, browsable,
			smb_options, nfs_options, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		share.ID, share.Name, share.Path, share.Protocol, share.Description,
		boolToInt(share.Enabled), share.ZoneID, share.OwnerID,
		string(allowedUsersJSON), string(allowedGroupsJSON), string(denyUsersJSON), string(denyGroupsJSON),
		boolToInt(share.GuestAccess), boolToInt(share.ReadOnly), boolToInt(share.Browsable),
		string(smbOptionsJSON), string(nfsOptionsJSON), share.CreatedAt, share.UpdatedAt)

	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			return nil, errors.New("share name already exists")
		}
		return nil, err
	}

	return share, nil
}

func (s *SQLiteStore) GetShare(id string) (*models.Share, error) {
	return s.scanShare(s.db.QueryRow(`
		SELECT id, name, path, protocol, description, enabled, zone_id, owner_id,
			allowed_users, allowed_groups, deny_users, deny_groups, guest_access, read_only, browsable,
			smb_options, nfs_options, created_at, updated_at
		FROM shares WHERE id = ?`, id))
}

func (s *SQLiteStore) GetShareByName(name string) (*models.Share, error) {
	return s.scanShare(s.db.QueryRow(`
		SELECT id, name, path, protocol, description, enabled, zone_id, owner_id,
			allowed_users, allowed_groups, deny_users, deny_groups, guest_access, read_only, browsable,
			smb_options, nfs_options, created_at, updated_at
		FROM shares WHERE name = ?`, name))
}

func (s *SQLiteStore) scanShare(row *sql.Row) (*models.Share, error) {
	var share models.Share
	var enabled, guestAccess, readOnly, browsable int
	var zoneID, ownerID sql.NullString
	var allowedUsersJSON, allowedGroupsJSON, denyUsersJSON, denyGroupsJSON string
	var smbOptionsJSON, nfsOptionsJSON sql.NullString

	err := row.Scan(&share.ID, &share.Name, &share.Path, &share.Protocol, &share.Description,
		&enabled, &zoneID, &ownerID,
		&allowedUsersJSON, &allowedGroupsJSON, &denyUsersJSON, &denyGroupsJSON,
		&guestAccess, &readOnly, &browsable,
		&smbOptionsJSON, &nfsOptionsJSON, &share.CreatedAt, &share.UpdatedAt)

	if err == sql.ErrNoRows {
		return nil, errors.New("share not found")
	}
	if err != nil {
		return nil, err
	}

	share.Enabled = enabled == 1
	share.GuestAccess = guestAccess == 1
	share.ReadOnly = readOnly == 1
	share.Browsable = browsable == 1
	share.ZoneID = zoneID.String
	share.OwnerID = ownerID.String

	json.Unmarshal([]byte(allowedUsersJSON), &share.AllowedUsers)
	json.Unmarshal([]byte(allowedGroupsJSON), &share.AllowedGroups)
	json.Unmarshal([]byte(denyUsersJSON), &share.DenyUsers)
	json.Unmarshal([]byte(denyGroupsJSON), &share.DenyGroups)

	if smbOptionsJSON.Valid {
		json.Unmarshal([]byte(smbOptionsJSON.String), &share.SMBOptions)
	}
	if nfsOptionsJSON.Valid {
		json.Unmarshal([]byte(nfsOptionsJSON.String), &share.NFSOptions)
	}

	return &share, nil
}

func (s *SQLiteStore) UpdateShare(id string, updates map[string]interface{}) (*models.Share, error) {
	share, err := s.GetShare(id)
	if err != nil {
		return nil, err
	}

	if name, ok := updates["name"].(string); ok {
		share.Name = name
	}
	if path, ok := updates["path"].(string); ok {
		share.Path = path
	}
	if description, ok := updates["description"].(string); ok {
		share.Description = description
	}
	if enabled, ok := updates["enabled"].(bool); ok {
		share.Enabled = enabled
	}
	if readOnly, ok := updates["read_only"].(bool); ok {
		share.ReadOnly = readOnly
	}
	if browsable, ok := updates["browsable"].(bool); ok {
		share.Browsable = browsable
	}
	if guestAccess, ok := updates["guest_access"].(bool); ok {
		share.GuestAccess = guestAccess
	}
	if allowedUsers, ok := updates["allowed_users"].([]interface{}); ok {
		share.AllowedUsers = interfaceSliceToStrings(allowedUsers)
	}
	if allowedGroups, ok := updates["allowed_groups"].([]interface{}); ok {
		share.AllowedGroups = interfaceSliceToStrings(allowedGroups)
	}
	if denyUsers, ok := updates["deny_users"].([]interface{}); ok {
		share.DenyUsers = interfaceSliceToStrings(denyUsers)
	}
	if denyGroups, ok := updates["deny_groups"].([]interface{}); ok {
		share.DenyGroups = interfaceSliceToStrings(denyGroups)
	}

	share.UpdatedAt = time.Now()

	allowedUsersJSON, _ := json.Marshal(share.AllowedUsers)
	allowedGroupsJSON, _ := json.Marshal(share.AllowedGroups)
	denyUsersJSON, _ := json.Marshal(share.DenyUsers)
	denyGroupsJSON, _ := json.Marshal(share.DenyGroups)

	_, err = s.db.Exec(`
		UPDATE shares SET name=?, path=?, description=?, enabled=?,
			allowed_users=?, allowed_groups=?, deny_users=?, deny_groups=?,
			guest_access=?, read_only=?, browsable=?, updated_at=?
		WHERE id=?`,
		share.Name, share.Path, share.Description, boolToInt(share.Enabled),
		string(allowedUsersJSON), string(allowedGroupsJSON), string(denyUsersJSON), string(denyGroupsJSON),
		boolToInt(share.GuestAccess), boolToInt(share.ReadOnly), boolToInt(share.Browsable),
		share.UpdatedAt, id)

	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			return nil, errors.New("share name already exists")
		}
		return nil, err
	}

	return share, nil
}

func (s *SQLiteStore) DeleteShare(id string) error {
	result, err := s.db.Exec("DELETE FROM shares WHERE id = ?", id)
	if err != nil {
		return err
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return errors.New("share not found")
	}
	return nil
}

func (s *SQLiteStore) ListShares() []*models.Share {
	rows, err := s.db.Query(`
		SELECT id, name, path, protocol, description, enabled, zone_id, owner_id,
			allowed_users, allowed_groups, deny_users, deny_groups, guest_access, read_only, browsable,
			smb_options, nfs_options, created_at, updated_at
		FROM shares ORDER BY name`)
	if err != nil {
		return []*models.Share{}
	}
	defer rows.Close()

	return s.scanShares(rows)
}

func (s *SQLiteStore) ListSharesByProtocol(protocol models.ShareProtocol) []*models.Share {
	rows, err := s.db.Query(`
		SELECT id, name, path, protocol, description, enabled, zone_id, owner_id,
			allowed_users, allowed_groups, deny_users, deny_groups, guest_access, read_only, browsable,
			smb_options, nfs_options, created_at, updated_at
		FROM shares WHERE protocol = ? ORDER BY name`, protocol)
	if err != nil {
		return []*models.Share{}
	}
	defer rows.Close()

	return s.scanShares(rows)
}

func (s *SQLiteStore) scanShares(rows *sql.Rows) []*models.Share {
	var shares []*models.Share
	for rows.Next() {
		var share models.Share
		var enabled, guestAccess, readOnly, browsable int
		var zoneID, ownerID sql.NullString
		var allowedUsersJSON, allowedGroupsJSON, denyUsersJSON, denyGroupsJSON string
		var smbOptionsJSON, nfsOptionsJSON sql.NullString

		if err := rows.Scan(&share.ID, &share.Name, &share.Path, &share.Protocol, &share.Description,
			&enabled, &zoneID, &ownerID,
			&allowedUsersJSON, &allowedGroupsJSON, &denyUsersJSON, &denyGroupsJSON,
			&guestAccess, &readOnly, &browsable,
			&smbOptionsJSON, &nfsOptionsJSON, &share.CreatedAt, &share.UpdatedAt); err != nil {
			continue
		}

		share.Enabled = enabled == 1
		share.GuestAccess = guestAccess == 1
		share.ReadOnly = readOnly == 1
		share.Browsable = browsable == 1
		share.ZoneID = zoneID.String
		share.OwnerID = ownerID.String

		json.Unmarshal([]byte(allowedUsersJSON), &share.AllowedUsers)
		json.Unmarshal([]byte(allowedGroupsJSON), &share.AllowedGroups)
		json.Unmarshal([]byte(denyUsersJSON), &share.DenyUsers)
		json.Unmarshal([]byte(denyGroupsJSON), &share.DenyGroups)

		shares = append(shares, &share)
	}

	return shares
}

// ============================================================================
// Storage Pool Operations
// ============================================================================

func (s *SQLiteStore) CreateStoragePool(pool *models.StoragePool) (*models.StoragePool, error) {
	pool.ID = uuid.New().String()
	now := time.Now()
	pool.CreatedAt = now
	pool.UpdatedAt = now

	allowedTypesJSON, _ := json.Marshal(pool.AllowedTypes)
	deniedTypesJSON, _ := json.Marshal(pool.DeniedTypes)

	_, err := s.db.Exec(`
		INSERT INTO storage_pools (id, name, path, description, enabled, total_space, used_space, free_space,
			reserved, max_file_size, allowed_types, denied_types, default_user_quota, default_group_quota,
			created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		pool.ID, pool.Name, pool.Path, pool.Description, boolToInt(pool.Enabled),
		pool.TotalSpace, pool.UsedSpace, pool.FreeSpace, pool.Reserved, pool.MaxFileSize,
		string(allowedTypesJSON), string(deniedTypesJSON),
		pool.DefaultUserQuota, pool.DefaultGroupQuota, pool.CreatedAt, pool.UpdatedAt)

	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			return nil, errors.New("storage pool name already exists")
		}
		return nil, err
	}

	return pool, nil
}

func (s *SQLiteStore) GetStoragePool(id string) (*models.StoragePool, error) {
	return s.scanStoragePool(s.db.QueryRow(`
		SELECT id, name, path, description, enabled, total_space, used_space, free_space,
			reserved, max_file_size, allowed_types, denied_types, default_user_quota, default_group_quota,
			created_at, updated_at
		FROM storage_pools WHERE id = ?`, id))
}

func (s *SQLiteStore) GetStoragePoolByName(name string) (*models.StoragePool, error) {
	return s.scanStoragePool(s.db.QueryRow(`
		SELECT id, name, path, description, enabled, total_space, used_space, free_space,
			reserved, max_file_size, allowed_types, denied_types, default_user_quota, default_group_quota,
			created_at, updated_at
		FROM storage_pools WHERE name = ?`, name))
}

func (s *SQLiteStore) scanStoragePool(row *sql.Row) (*models.StoragePool, error) {
	var pool models.StoragePool
	var enabled int
	var allowedTypesJSON, deniedTypesJSON string

	err := row.Scan(&pool.ID, &pool.Name, &pool.Path, &pool.Description, &enabled,
		&pool.TotalSpace, &pool.UsedSpace, &pool.FreeSpace, &pool.Reserved, &pool.MaxFileSize,
		&allowedTypesJSON, &deniedTypesJSON, &pool.DefaultUserQuota, &pool.DefaultGroupQuota,
		&pool.CreatedAt, &pool.UpdatedAt)

	if err == sql.ErrNoRows {
		return nil, errors.New("storage pool not found")
	}
	if err != nil {
		return nil, err
	}

	pool.Enabled = enabled == 1
	json.Unmarshal([]byte(allowedTypesJSON), &pool.AllowedTypes)
	json.Unmarshal([]byte(deniedTypesJSON), &pool.DeniedTypes)

	return &pool, nil
}

func (s *SQLiteStore) UpdateStoragePool(id string, updates map[string]interface{}) (*models.StoragePool, error) {
	pool, err := s.GetStoragePool(id)
	if err != nil {
		return nil, err
	}

	if name, ok := updates["name"].(string); ok {
		pool.Name = name
	}
	if path, ok := updates["path"].(string); ok {
		pool.Path = path
	}
	if description, ok := updates["description"].(string); ok {
		pool.Description = description
	}
	if enabled, ok := updates["enabled"].(bool); ok {
		pool.Enabled = enabled
	}
	if reserved, ok := updates["reserved"].(float64); ok {
		pool.Reserved = int64(reserved)
	}
	if maxFileSize, ok := updates["max_file_size"].(float64); ok {
		pool.MaxFileSize = int64(maxFileSize)
	}
	if allowedTypes, ok := updates["allowed_types"].([]interface{}); ok {
		pool.AllowedTypes = interfaceSliceToStrings(allowedTypes)
	}
	if deniedTypes, ok := updates["denied_types"].([]interface{}); ok {
		pool.DeniedTypes = interfaceSliceToStrings(deniedTypes)
	}
	if defaultUserQuota, ok := updates["default_user_quota"].(float64); ok {
		pool.DefaultUserQuota = int64(defaultUserQuota)
	}
	if defaultGroupQuota, ok := updates["default_group_quota"].(float64); ok {
		pool.DefaultGroupQuota = int64(defaultGroupQuota)
	}

	pool.UpdatedAt = time.Now()

	allowedTypesJSON, _ := json.Marshal(pool.AllowedTypes)
	deniedTypesJSON, _ := json.Marshal(pool.DeniedTypes)

	_, err = s.db.Exec(`
		UPDATE storage_pools SET name=?, path=?, description=?, enabled=?, reserved=?, max_file_size=?,
			allowed_types=?, denied_types=?, default_user_quota=?, default_group_quota=?, updated_at=?
		WHERE id=?`,
		pool.Name, pool.Path, pool.Description, boolToInt(pool.Enabled), pool.Reserved, pool.MaxFileSize,
		string(allowedTypesJSON), string(deniedTypesJSON), pool.DefaultUserQuota, pool.DefaultGroupQuota,
		pool.UpdatedAt, id)

	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			return nil, errors.New("storage pool name already exists")
		}
		return nil, err
	}

	return pool, nil
}

func (s *SQLiteStore) DeleteStoragePool(id string) error {
	// Check for dependent zones first
	var count int
	s.db.QueryRow("SELECT COUNT(*) FROM share_zones WHERE pool_id = ?", id).Scan(&count)
	if count > 0 {
		return errors.New("cannot delete pool: zones still reference this pool")
	}

	result, err := s.db.Exec("DELETE FROM storage_pools WHERE id = ?", id)
	if err != nil {
		return err
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return errors.New("storage pool not found")
	}
	return nil
}

func (s *SQLiteStore) ListStoragePools() []*models.StoragePool {
	rows, err := s.db.Query(`
		SELECT id, name, path, description, enabled, total_space, used_space, free_space,
			reserved, max_file_size, allowed_types, denied_types, default_user_quota, default_group_quota,
			created_at, updated_at
		FROM storage_pools ORDER BY name`)
	if err != nil {
		return []*models.StoragePool{}
	}
	defer rows.Close()

	var pools []*models.StoragePool
	for rows.Next() {
		var pool models.StoragePool
		var enabled int
		var allowedTypesJSON, deniedTypesJSON string

		if err := rows.Scan(&pool.ID, &pool.Name, &pool.Path, &pool.Description, &enabled,
			&pool.TotalSpace, &pool.UsedSpace, &pool.FreeSpace, &pool.Reserved, &pool.MaxFileSize,
			&allowedTypesJSON, &deniedTypesJSON, &pool.DefaultUserQuota, &pool.DefaultGroupQuota,
			&pool.CreatedAt, &pool.UpdatedAt); err != nil {
			continue
		}

		pool.Enabled = enabled == 1
		json.Unmarshal([]byte(allowedTypesJSON), &pool.AllowedTypes)
		json.Unmarshal([]byte(deniedTypesJSON), &pool.DeniedTypes)
		pools = append(pools, &pool)
	}

	return pools
}

// ============================================================================
// Share Zone Operations
// ============================================================================

func (s *SQLiteStore) CreateShareZone(zone *models.ShareZone) (*models.ShareZone, error) {
	// Verify pool exists
	_, err := s.GetStoragePool(zone.PoolID)
	if err != nil {
		return nil, errors.New("storage pool not found")
	}

	zone.ID = uuid.New().String()
	now := time.Now()
	zone.CreatedAt = now
	zone.UpdatedAt = now

	allowedUsersJSON, _ := json.Marshal(zone.AllowedUsers)
	allowedGroupsJSON, _ := json.Marshal(zone.AllowedGroups)
	denyUsersJSON, _ := json.Marshal(zone.DenyUsers)
	denyGroupsJSON, _ := json.Marshal(zone.DenyGroups)
	smbOptionsJSON, _ := json.Marshal(zone.SMBOptions)
	nfsOptionsJSON, _ := json.Marshal(zone.NFSOptions)
	webOptionsJSON, _ := json.Marshal(zone.WebOptions)

	_, err = s.db.Exec(`
		INSERT INTO share_zones (id, pool_id, name, path, description, zone_type, enabled, auto_provision,
			provision_template, allowed_users, allowed_groups, deny_users, deny_groups,
			allow_network_shares, allow_web_shares, allow_guest_access, smb_enabled, nfs_enabled,
			smb_options, nfs_options, web_options, max_quota_per_user, read_only, browsable, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		zone.ID, zone.PoolID, zone.Name, zone.Path, zone.Description, zone.ZoneType,
		boolToInt(zone.Enabled), boolToInt(zone.AutoProvision), zone.ProvisionTemplate,
		string(allowedUsersJSON), string(allowedGroupsJSON), string(denyUsersJSON), string(denyGroupsJSON),
		boolToInt(zone.AllowNetworkShares), boolToInt(zone.AllowWebShares), boolToInt(zone.AllowGuestAccess),
		boolToInt(zone.SMBEnabled), boolToInt(zone.NFSEnabled),
		string(smbOptionsJSON), string(nfsOptionsJSON), string(webOptionsJSON),
		zone.MaxQuotaPerUser, boolToInt(zone.ReadOnly), boolToInt(zone.Browsable), zone.CreatedAt, zone.UpdatedAt)

	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			return nil, errors.New("share zone name already exists")
		}
		return nil, err
	}

	return zone, nil
}

func (s *SQLiteStore) GetShareZone(id string) (*models.ShareZone, error) {
	return s.scanShareZone(s.db.QueryRow(`
		SELECT id, pool_id, name, path, description, zone_type, enabled, auto_provision,
			provision_template, allowed_users, allowed_groups, deny_users, deny_groups,
			allow_network_shares, allow_web_shares, allow_guest_access, smb_enabled, nfs_enabled,
			smb_options, nfs_options, web_options, max_quota_per_user, read_only, browsable, created_at, updated_at
		FROM share_zones WHERE id = ?`, id))
}

func (s *SQLiteStore) GetShareZoneByName(name string) (*models.ShareZone, error) {
	return s.scanShareZone(s.db.QueryRow(`
		SELECT id, pool_id, name, path, description, zone_type, enabled, auto_provision,
			provision_template, allowed_users, allowed_groups, deny_users, deny_groups,
			allow_network_shares, allow_web_shares, allow_guest_access, smb_enabled, nfs_enabled,
			smb_options, nfs_options, web_options, max_quota_per_user, read_only, browsable, created_at, updated_at
		FROM share_zones WHERE name = ?`, name))
}

func (s *SQLiteStore) scanShareZone(row *sql.Row) (*models.ShareZone, error) {
	var zone models.ShareZone
	var enabled, autoProvision, allowNetworkShares, allowWebShares, allowGuestAccess int
	var smbEnabled, nfsEnabled, readOnly, browsable int
	var allowedUsersJSON, allowedGroupsJSON, denyUsersJSON, denyGroupsJSON string
	var smbOptionsJSON, nfsOptionsJSON, webOptionsJSON sql.NullString

	err := row.Scan(&zone.ID, &zone.PoolID, &zone.Name, &zone.Path, &zone.Description, &zone.ZoneType,
		&enabled, &autoProvision, &zone.ProvisionTemplate,
		&allowedUsersJSON, &allowedGroupsJSON, &denyUsersJSON, &denyGroupsJSON,
		&allowNetworkShares, &allowWebShares, &allowGuestAccess, &smbEnabled, &nfsEnabled,
		&smbOptionsJSON, &nfsOptionsJSON, &webOptionsJSON,
		&zone.MaxQuotaPerUser, &readOnly, &browsable, &zone.CreatedAt, &zone.UpdatedAt)

	if err == sql.ErrNoRows {
		return nil, errors.New("share zone not found")
	}
	if err != nil {
		return nil, err
	}

	zone.Enabled = enabled == 1
	zone.AutoProvision = autoProvision == 1
	zone.AllowNetworkShares = allowNetworkShares == 1
	zone.AllowWebShares = allowWebShares == 1
	zone.AllowGuestAccess = allowGuestAccess == 1
	zone.SMBEnabled = smbEnabled == 1
	zone.NFSEnabled = nfsEnabled == 1
	zone.ReadOnly = readOnly == 1
	zone.Browsable = browsable == 1

	json.Unmarshal([]byte(allowedUsersJSON), &zone.AllowedUsers)
	json.Unmarshal([]byte(allowedGroupsJSON), &zone.AllowedGroups)
	json.Unmarshal([]byte(denyUsersJSON), &zone.DenyUsers)
	json.Unmarshal([]byte(denyGroupsJSON), &zone.DenyGroups)

	if smbOptionsJSON.Valid {
		json.Unmarshal([]byte(smbOptionsJSON.String), &zone.SMBOptions)
	}
	if nfsOptionsJSON.Valid {
		json.Unmarshal([]byte(nfsOptionsJSON.String), &zone.NFSOptions)
	}
	if webOptionsJSON.Valid {
		json.Unmarshal([]byte(webOptionsJSON.String), &zone.WebOptions)
	}

	return &zone, nil
}

func (s *SQLiteStore) UpdateShareZone(id string, updates map[string]interface{}) (*models.ShareZone, error) {
	zone, err := s.GetShareZone(id)
	if err != nil {
		return nil, err
	}

	if name, ok := updates["name"].(string); ok {
		zone.Name = name
	}
	if poolID, ok := updates["pool_id"].(string); ok {
		if _, err := s.GetStoragePool(poolID); err != nil {
			return nil, errors.New("storage pool not found")
		}
		zone.PoolID = poolID
	}
	if path, ok := updates["path"].(string); ok {
		zone.Path = path
	}
	if description, ok := updates["description"].(string); ok {
		zone.Description = description
	}
	if zoneType, ok := updates["zone_type"].(string); ok {
		zone.ZoneType = models.ShareZoneType(zoneType)
	}
	if enabled, ok := updates["enabled"].(bool); ok {
		zone.Enabled = enabled
	}
	if autoProvision, ok := updates["auto_provision"].(bool); ok {
		zone.AutoProvision = autoProvision
	}
	if provisionTemplate, ok := updates["provision_template"].(string); ok {
		zone.ProvisionTemplate = provisionTemplate
	}
	if allowedUsers, ok := updates["allowed_users"].([]interface{}); ok {
		zone.AllowedUsers = interfaceSliceToStrings(allowedUsers)
	}
	if allowedGroups, ok := updates["allowed_groups"].([]interface{}); ok {
		zone.AllowedGroups = interfaceSliceToStrings(allowedGroups)
	}
	if allowNetworkShares, ok := updates["allow_network_shares"].(bool); ok {
		zone.AllowNetworkShares = allowNetworkShares
	}
	if allowWebShares, ok := updates["allow_web_shares"].(bool); ok {
		zone.AllowWebShares = allowWebShares
	}
	if allowGuestAccess, ok := updates["allow_guest_access"].(bool); ok {
		zone.AllowGuestAccess = allowGuestAccess
	}
	if maxQuotaPerUser, ok := updates["max_quota_per_user"].(float64); ok {
		zone.MaxQuotaPerUser = int64(maxQuotaPerUser)
	}

	zone.UpdatedAt = time.Now()

	allowedUsersJSON, _ := json.Marshal(zone.AllowedUsers)
	allowedGroupsJSON, _ := json.Marshal(zone.AllowedGroups)
	denyUsersJSON, _ := json.Marshal(zone.DenyUsers)
	denyGroupsJSON, _ := json.Marshal(zone.DenyGroups)

	_, err = s.db.Exec(`
		UPDATE share_zones SET pool_id=?, name=?, path=?, description=?, zone_type=?, enabled=?,
			auto_provision=?, provision_template=?, allowed_users=?, allowed_groups=?, deny_users=?, deny_groups=?,
			allow_network_shares=?, allow_web_shares=?, allow_guest_access=?, max_quota_per_user=?, updated_at=?
		WHERE id=?`,
		zone.PoolID, zone.Name, zone.Path, zone.Description, zone.ZoneType, boolToInt(zone.Enabled),
		boolToInt(zone.AutoProvision), zone.ProvisionTemplate,
		string(allowedUsersJSON), string(allowedGroupsJSON), string(denyUsersJSON), string(denyGroupsJSON),
		boolToInt(zone.AllowNetworkShares), boolToInt(zone.AllowWebShares), boolToInt(zone.AllowGuestAccess),
		zone.MaxQuotaPerUser, zone.UpdatedAt, id)

	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			return nil, errors.New("share zone name already exists")
		}
		return nil, err
	}

	return zone, nil
}

func (s *SQLiteStore) DeleteShareZone(id string) error {
	// Check for dependent shares first
	var count int
	s.db.QueryRow("SELECT COUNT(*) FROM shares WHERE zone_id = ?", id).Scan(&count)
	if count > 0 {
		return errors.New("cannot delete zone: shares still reference this zone")
	}

	result, err := s.db.Exec("DELETE FROM share_zones WHERE id = ?", id)
	if err != nil {
		return err
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return errors.New("share zone not found")
	}
	return nil
}

func (s *SQLiteStore) ListShareZones() []*models.ShareZone {
	rows, err := s.db.Query(`
		SELECT id, pool_id, name, path, description, zone_type, enabled, auto_provision,
			provision_template, allowed_users, allowed_groups, deny_users, deny_groups,
			allow_network_shares, allow_web_shares, allow_guest_access, smb_enabled, nfs_enabled,
			smb_options, nfs_options, web_options, max_quota_per_user, read_only, browsable, created_at, updated_at
		FROM share_zones ORDER BY name`)
	if err != nil {
		return []*models.ShareZone{}
	}
	defer rows.Close()

	return s.scanShareZones(rows)
}

func (s *SQLiteStore) ListShareZonesByPool(poolID string) []*models.ShareZone {
	rows, err := s.db.Query(`
		SELECT id, pool_id, name, path, description, zone_type, enabled, auto_provision,
			provision_template, allowed_users, allowed_groups, deny_users, deny_groups,
			allow_network_shares, allow_web_shares, allow_guest_access, smb_enabled, nfs_enabled,
			smb_options, nfs_options, web_options, max_quota_per_user, read_only, browsable, created_at, updated_at
		FROM share_zones WHERE pool_id = ? ORDER BY name`, poolID)
	if err != nil {
		return []*models.ShareZone{}
	}
	defer rows.Close()

	return s.scanShareZones(rows)
}

func (s *SQLiteStore) scanShareZones(rows *sql.Rows) []*models.ShareZone {
	var zones []*models.ShareZone
	for rows.Next() {
		var zone models.ShareZone
		var enabled, autoProvision, allowNetworkShares, allowWebShares, allowGuestAccess int
		var smbEnabled, nfsEnabled, readOnly, browsable int
		var allowedUsersJSON, allowedGroupsJSON, denyUsersJSON, denyGroupsJSON string
		var smbOptionsJSON, nfsOptionsJSON, webOptionsJSON sql.NullString

		if err := rows.Scan(&zone.ID, &zone.PoolID, &zone.Name, &zone.Path, &zone.Description, &zone.ZoneType,
			&enabled, &autoProvision, &zone.ProvisionTemplate,
			&allowedUsersJSON, &allowedGroupsJSON, &denyUsersJSON, &denyGroupsJSON,
			&allowNetworkShares, &allowWebShares, &allowGuestAccess, &smbEnabled, &nfsEnabled,
			&smbOptionsJSON, &nfsOptionsJSON, &webOptionsJSON,
			&zone.MaxQuotaPerUser, &readOnly, &browsable, &zone.CreatedAt, &zone.UpdatedAt); err != nil {
			continue
		}

		zone.Enabled = enabled == 1
		zone.AutoProvision = autoProvision == 1
		zone.AllowNetworkShares = allowNetworkShares == 1
		zone.AllowWebShares = allowWebShares == 1
		zone.AllowGuestAccess = allowGuestAccess == 1
		zone.SMBEnabled = smbEnabled == 1
		zone.NFSEnabled = nfsEnabled == 1
		zone.ReadOnly = readOnly == 1
		zone.Browsable = browsable == 1

		json.Unmarshal([]byte(allowedUsersJSON), &zone.AllowedUsers)
		json.Unmarshal([]byte(allowedGroupsJSON), &zone.AllowedGroups)
		json.Unmarshal([]byte(denyUsersJSON), &zone.DenyUsers)
		json.Unmarshal([]byte(denyGroupsJSON), &zone.DenyGroups)

		zones = append(zones, &zone)
	}

	return zones
}

// ============================================================================
// Share Link Operations
// ============================================================================

func (s *SQLiteStore) CreateShareLink(link *models.ShareLink) (*models.ShareLink, error) {
	link.ID = uuid.New().String()
	now := time.Now()
	link.CreatedAt = now
	link.UpdatedAt = now

	_, err := s.db.Exec(`
		INSERT INTO share_links (id, share_id, owner_id, target_path, target_type, target_name, token,
			password_hash, expires_at, max_downloads, download_count, max_views, view_count,
			allow_download, allow_preview, allow_upload, allow_listing, name, description, custom_message,
			show_owner, enabled, created_at, updated_at, last_accessed)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		link.ID, link.ShareID, link.OwnerID, link.TargetPath, link.TargetType, link.TargetName, link.Token,
		link.PasswordHash, link.ExpiresAt, link.MaxDownloads, link.DownloadCount, link.MaxViews, link.ViewCount,
		boolToInt(link.AllowDownload), boolToInt(link.AllowPreview), boolToInt(link.AllowUpload), boolToInt(link.AllowListing),
		link.Name, link.Description, link.CustomMessage, boolToInt(link.ShowOwner), boolToInt(link.Enabled),
		link.CreatedAt, link.UpdatedAt, link.LastAccessed)

	if err != nil {
		return nil, err
	}

	return link, nil
}

func (s *SQLiteStore) GetShareLink(id string) (*models.ShareLink, error) {
	return s.scanShareLink(s.db.QueryRow(`
		SELECT id, share_id, owner_id, target_path, target_type, target_name, token,
			password_hash, expires_at, max_downloads, download_count, max_views, view_count,
			allow_download, allow_preview, allow_upload, allow_listing, name, description, custom_message,
			show_owner, enabled, created_at, updated_at, last_accessed
		FROM share_links WHERE id = ?`, id))
}

func (s *SQLiteStore) GetShareLinkByToken(token string) (*models.ShareLink, error) {
	return s.scanShareLink(s.db.QueryRow(`
		SELECT id, share_id, owner_id, target_path, target_type, target_name, token,
			password_hash, expires_at, max_downloads, download_count, max_views, view_count,
			allow_download, allow_preview, allow_upload, allow_listing, name, description, custom_message,
			show_owner, enabled, created_at, updated_at, last_accessed
		FROM share_links WHERE token = ?`, token))
}

func (s *SQLiteStore) scanShareLink(row *sql.Row) (*models.ShareLink, error) {
	var link models.ShareLink
	var shareID, passwordHash, expiresAt, lastAccessed sql.NullString
	var allowDownload, allowPreview, allowUpload, allowListing, showOwner, enabled int

	err := row.Scan(&link.ID, &shareID, &link.OwnerID, &link.TargetPath, &link.TargetType, &link.TargetName, &link.Token,
		&passwordHash, &expiresAt, &link.MaxDownloads, &link.DownloadCount, &link.MaxViews, &link.ViewCount,
		&allowDownload, &allowPreview, &allowUpload, &allowListing,
		&link.Name, &link.Description, &link.CustomMessage, &showOwner, &enabled,
		&link.CreatedAt, &link.UpdatedAt, &lastAccessed)

	if err == sql.ErrNoRows {
		return nil, errors.New("share link not found")
	}
	if err != nil {
		return nil, err
	}

	link.ShareID = shareID.String
	link.PasswordHash = passwordHash.String
	link.AllowDownload = allowDownload == 1
	link.AllowPreview = allowPreview == 1
	link.AllowUpload = allowUpload == 1
	link.AllowListing = allowListing == 1
	link.ShowOwner = showOwner == 1
	link.Enabled = enabled == 1

	if expiresAt.Valid {
		t, _ := time.Parse(time.RFC3339, expiresAt.String)
		link.ExpiresAt = &t
	}
	if lastAccessed.Valid {
		t, _ := time.Parse(time.RFC3339, lastAccessed.String)
		link.LastAccessed = &t
	}

	return &link, nil
}

func (s *SQLiteStore) UpdateShareLink(id string, updates map[string]interface{}) (*models.ShareLink, error) {
	link, err := s.GetShareLink(id)
	if err != nil {
		return nil, err
	}

	if name, ok := updates["name"].(string); ok {
		link.Name = name
	}
	if description, ok := updates["description"].(string); ok {
		link.Description = description
	}
	if customMessage, ok := updates["custom_message"].(string); ok {
		link.CustomMessage = customMessage
	}
	if showOwner, ok := updates["show_owner"].(bool); ok {
		link.ShowOwner = showOwner
	}
	if enabled, ok := updates["enabled"].(bool); ok {
		link.Enabled = enabled
	}
	if allowDownload, ok := updates["allow_download"].(bool); ok {
		link.AllowDownload = allowDownload
	}
	if allowPreview, ok := updates["allow_preview"].(bool); ok {
		link.AllowPreview = allowPreview
	}
	if allowUpload, ok := updates["allow_upload"].(bool); ok {
		link.AllowUpload = allowUpload
	}
	if allowListing, ok := updates["allow_listing"].(bool); ok {
		link.AllowListing = allowListing
	}
	if maxDownloads, ok := updates["max_downloads"].(float64); ok {
		link.MaxDownloads = int(maxDownloads)
	}
	if maxViews, ok := updates["max_views"].(float64); ok {
		link.MaxViews = int(maxViews)
	}
	if expiresAt, ok := updates["expires_at"].(string); ok {
		if expiresAt == "" {
			link.ExpiresAt = nil
		} else {
			t, err := time.Parse(time.RFC3339, expiresAt)
			if err == nil {
				link.ExpiresAt = &t
			}
		}
	}
	if passwordHash, ok := updates["password_hash"].(string); ok {
		link.PasswordHash = passwordHash
	}

	link.UpdatedAt = time.Now()

	_, err = s.db.Exec(`
		UPDATE share_links SET name=?, description=?, custom_message=?, show_owner=?, enabled=?,
			allow_download=?, allow_preview=?, allow_upload=?, allow_listing=?,
			max_downloads=?, max_views=?, expires_at=?, password_hash=?, updated_at=?
		WHERE id=?`,
		link.Name, link.Description, link.CustomMessage, boolToInt(link.ShowOwner), boolToInt(link.Enabled),
		boolToInt(link.AllowDownload), boolToInt(link.AllowPreview), boolToInt(link.AllowUpload), boolToInt(link.AllowListing),
		link.MaxDownloads, link.MaxViews, link.ExpiresAt, link.PasswordHash, link.UpdatedAt, id)

	return link, err
}

func (s *SQLiteStore) DeleteShareLink(id string) error {
	result, err := s.db.Exec("DELETE FROM share_links WHERE id = ?", id)
	if err != nil {
		return err
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return errors.New("share link not found")
	}
	return nil
}

func (s *SQLiteStore) ListShareLinks() []*models.ShareLink {
	rows, err := s.db.Query(`
		SELECT id, share_id, owner_id, target_path, target_type, target_name, token,
			password_hash, expires_at, max_downloads, download_count, max_views, view_count,
			allow_download, allow_preview, allow_upload, allow_listing, name, description, custom_message,
			show_owner, enabled, created_at, updated_at, last_accessed
		FROM share_links ORDER BY created_at DESC`)
	if err != nil {
		return []*models.ShareLink{}
	}
	defer rows.Close()

	return s.scanShareLinks(rows)
}

func (s *SQLiteStore) ListShareLinksByOwner(ownerID string) []*models.ShareLink {
	rows, err := s.db.Query(`
		SELECT id, share_id, owner_id, target_path, target_type, target_name, token,
			password_hash, expires_at, max_downloads, download_count, max_views, view_count,
			allow_download, allow_preview, allow_upload, allow_listing, name, description, custom_message,
			show_owner, enabled, created_at, updated_at, last_accessed
		FROM share_links WHERE owner_id = ? ORDER BY created_at DESC`, ownerID)
	if err != nil {
		return []*models.ShareLink{}
	}
	defer rows.Close()

	return s.scanShareLinks(rows)
}

func (s *SQLiteStore) scanShareLinks(rows *sql.Rows) []*models.ShareLink {
	var links []*models.ShareLink
	for rows.Next() {
		var link models.ShareLink
		var shareID, passwordHash, expiresAt, lastAccessed sql.NullString
		var allowDownload, allowPreview, allowUpload, allowListing, showOwner, enabled int

		if err := rows.Scan(&link.ID, &shareID, &link.OwnerID, &link.TargetPath, &link.TargetType, &link.TargetName, &link.Token,
			&passwordHash, &expiresAt, &link.MaxDownloads, &link.DownloadCount, &link.MaxViews, &link.ViewCount,
			&allowDownload, &allowPreview, &allowUpload, &allowListing,
			&link.Name, &link.Description, &link.CustomMessage, &showOwner, &enabled,
			&link.CreatedAt, &link.UpdatedAt, &lastAccessed); err != nil {
			continue
		}

		link.ShareID = shareID.String
		link.PasswordHash = passwordHash.String
		link.AllowDownload = allowDownload == 1
		link.AllowPreview = allowPreview == 1
		link.AllowUpload = allowUpload == 1
		link.AllowListing = allowListing == 1
		link.ShowOwner = showOwner == 1
		link.Enabled = enabled == 1

		if expiresAt.Valid {
			t, _ := time.Parse(time.RFC3339, expiresAt.String)
			link.ExpiresAt = &t
		}
		if lastAccessed.Valid {
			t, _ := time.Parse(time.RFC3339, lastAccessed.String)
			link.LastAccessed = &t
		}

		links = append(links, &link)
	}

	return links
}

func (s *SQLiteStore) IncrementShareLinkDownload(id string) error {
	now := time.Now()
	_, err := s.db.Exec(`
		UPDATE share_links SET download_count = download_count + 1, last_accessed = ?, updated_at = ?
		WHERE id = ?`, now, now, id)
	return err
}

func (s *SQLiteStore) IncrementShareLinkView(id string) error {
	now := time.Now()
	_, err := s.db.Exec(`
		UPDATE share_links SET view_count = view_count + 1, last_accessed = ?, updated_at = ?
		WHERE id = ?`, now, now, id)
	return err
}

func (s *SQLiteStore) CleanExpiredShareLinks() error {
	_, err := s.db.Exec("DELETE FROM share_links WHERE expires_at IS NOT NULL AND expires_at < ?", time.Now())
	return err
}

// ============================================================================
// Settings Operations
// ============================================================================

func (s *SQLiteStore) GetSetting(key string) (*models.Setting, error) {
	var setting models.Setting
	err := s.db.QueryRow(`
		SELECT key, value, type, category, updated_at
		FROM settings WHERE key = ?`, key).
		Scan(&setting.Key, &setting.Value, &setting.Type, &setting.Category, &setting.UpdatedAt)

	if err == sql.ErrNoRows {
		return nil, nil // Return nil, nil for missing settings (not an error)
	}
	if err != nil {
		return nil, err
	}

	return &setting, nil
}

func (s *SQLiteStore) SetSetting(key, value, settingType, category string) error {
	now := time.Now()
	_, err := s.db.Exec(`
		INSERT INTO settings (key, value, type, category, updated_at)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(key) DO UPDATE SET value=?, type=?, category=?, updated_at=?`,
		key, value, settingType, category, now,
		value, settingType, category, now)
	return err
}

func (s *SQLiteStore) GetSettingsByCategory(category string) []models.Setting {
	rows, err := s.db.Query(`
		SELECT key, value, type, category, updated_at
		FROM settings WHERE category = ? ORDER BY key`, category)
	if err != nil {
		return []models.Setting{}
	}
	defer rows.Close()

	var settings []models.Setting
	for rows.Next() {
		var setting models.Setting
		if err := rows.Scan(&setting.Key, &setting.Value, &setting.Type, &setting.Category, &setting.UpdatedAt); err != nil {
			continue
		}
		settings = append(settings, setting)
	}

	return settings
}

func (s *SQLiteStore) GetAllSettings() []models.Setting {
	rows, err := s.db.Query(`
		SELECT key, value, type, category, updated_at
		FROM settings ORDER BY category, key`)
	if err != nil {
		return []models.Setting{}
	}
	defer rows.Close()

	var settings []models.Setting
	for rows.Next() {
		var setting models.Setting
		if err := rows.Scan(&setting.Key, &setting.Value, &setting.Type, &setting.Category, &setting.UpdatedAt); err != nil {
			continue
		}
		settings = append(settings, setting)
	}

	return settings
}

func (s *SQLiteStore) DeleteSetting(key string) error {
	_, err := s.db.Exec("DELETE FROM settings WHERE key = ?", key)
	return err
}

func (s *SQLiteStore) IsSetupComplete() bool {
	setting, err := s.GetSetting(models.SettingSetupComplete)
	if err != nil || setting == nil {
		return false
	}
	return setting.Value == "true"
}

// ============================================================================
// Snapshot Policy Operations
// ============================================================================

func (s *SQLiteStore) CreateSnapshotPolicy(policy *models.SnapshotPolicy) (*models.SnapshotPolicy, error) {
	policy.ID = uuid.New().String()
	policy.CreatedAt = time.Now()
	policy.UpdatedAt = time.Now()

	if policy.Prefix == "" {
		policy.Prefix = "auto"
	}
	if policy.Retention == 0 {
		policy.Retention = 7
	}

	_, err := s.db.Exec(`
		INSERT INTO snapshot_policies (id, name, dataset, enabled, schedule, retention, prefix, recursive, last_run, next_run, last_error, snapshot_count, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		policy.ID, policy.Name, policy.Dataset, boolToInt(policy.Enabled), policy.Schedule,
		policy.Retention, policy.Prefix, boolToInt(policy.Recursive),
		policy.LastRun, policy.NextRun, policy.LastError, policy.SnapshotCount,
		policy.CreatedAt, policy.UpdatedAt)

	if err != nil {
		return nil, err
	}

	return policy, nil
}

func (s *SQLiteStore) GetSnapshotPolicy(id string) (*models.SnapshotPolicy, error) {
	row := s.db.QueryRow(`
		SELECT id, name, dataset, enabled, schedule, retention, prefix, recursive, last_run, next_run, last_error, snapshot_count, created_at, updated_at
		FROM snapshot_policies WHERE id = ?`, id)
	return s.scanSnapshotPolicy(row)
}

func (s *SQLiteStore) scanSnapshotPolicy(row *sql.Row) (*models.SnapshotPolicy, error) {
	var policy models.SnapshotPolicy
	var enabled, recursive int
	var lastRun, nextRun sql.NullTime
	var lastError sql.NullString

	err := row.Scan(&policy.ID, &policy.Name, &policy.Dataset, &enabled, &policy.Schedule,
		&policy.Retention, &policy.Prefix, &recursive, &lastRun, &nextRun, &lastError,
		&policy.SnapshotCount, &policy.CreatedAt, &policy.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, errors.New("snapshot policy not found")
	}
	if err != nil {
		return nil, err
	}

	policy.Enabled = enabled == 1
	policy.Recursive = recursive == 1
	if lastRun.Valid {
		policy.LastRun = &lastRun.Time
	}
	if nextRun.Valid {
		policy.NextRun = &nextRun.Time
	}
	if lastError.Valid {
		policy.LastError = lastError.String
	}

	return &policy, nil
}

func (s *SQLiteStore) UpdateSnapshotPolicy(id string, updates map[string]interface{}) (*models.SnapshotPolicy, error) {
	policy, err := s.GetSnapshotPolicy(id)
	if err != nil {
		return nil, err
	}

	if name, ok := updates["name"].(string); ok {
		policy.Name = name
	}
	if dataset, ok := updates["dataset"].(string); ok {
		policy.Dataset = dataset
	}
	if enabled, ok := updates["enabled"].(bool); ok {
		policy.Enabled = enabled
	}
	if schedule, ok := updates["schedule"].(string); ok {
		policy.Schedule = schedule
	}
	if retention, ok := updates["retention"].(float64); ok {
		policy.Retention = int(retention)
	}
	if retention, ok := updates["retention"].(int); ok {
		policy.Retention = retention
	}
	if prefix, ok := updates["prefix"].(string); ok {
		policy.Prefix = prefix
	}
	if recursive, ok := updates["recursive"].(bool); ok {
		policy.Recursive = recursive
	}

	policy.UpdatedAt = time.Now()

	_, err = s.db.Exec(`
		UPDATE snapshot_policies SET name = ?, dataset = ?, enabled = ?, schedule = ?, retention = ?, prefix = ?, recursive = ?, updated_at = ?
		WHERE id = ?`,
		policy.Name, policy.Dataset, boolToInt(policy.Enabled), policy.Schedule,
		policy.Retention, policy.Prefix, boolToInt(policy.Recursive),
		policy.UpdatedAt, policy.ID)

	if err != nil {
		return nil, err
	}

	return policy, nil
}

func (s *SQLiteStore) DeleteSnapshotPolicy(id string) error {
	result, err := s.db.Exec("DELETE FROM snapshot_policies WHERE id = ?", id)
	if err != nil {
		return err
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return errors.New("snapshot policy not found")
	}

	return nil
}

func (s *SQLiteStore) ListSnapshotPolicies() []*models.SnapshotPolicy {
	rows, err := s.db.Query(`
		SELECT id, name, dataset, enabled, schedule, retention, prefix, recursive, last_run, next_run, last_error, snapshot_count, created_at, updated_at
		FROM snapshot_policies ORDER BY name`)
	if err != nil {
		return []*models.SnapshotPolicy{}
	}
	defer rows.Close()

	var policies []*models.SnapshotPolicy
	for rows.Next() {
		var policy models.SnapshotPolicy
		var enabled, recursive int
		var lastRun, nextRun sql.NullTime
		var lastError sql.NullString

		if err := rows.Scan(&policy.ID, &policy.Name, &policy.Dataset, &enabled, &policy.Schedule,
			&policy.Retention, &policy.Prefix, &recursive, &lastRun, &nextRun, &lastError,
			&policy.SnapshotCount, &policy.CreatedAt, &policy.UpdatedAt); err != nil {
			continue
		}

		policy.Enabled = enabled == 1
		policy.Recursive = recursive == 1
		if lastRun.Valid {
			policy.LastRun = &lastRun.Time
		}
		if nextRun.Valid {
			policy.NextRun = &nextRun.Time
		}
		if lastError.Valid {
			policy.LastError = lastError.String
		}

		policies = append(policies, &policy)
	}

	return policies
}

func (s *SQLiteStore) ListEnabledSnapshotPolicies() []*models.SnapshotPolicy {
	rows, err := s.db.Query(`
		SELECT id, name, dataset, enabled, schedule, retention, prefix, recursive, last_run, next_run, last_error, snapshot_count, created_at, updated_at
		FROM snapshot_policies WHERE enabled = 1 ORDER BY next_run`)
	if err != nil {
		return []*models.SnapshotPolicy{}
	}
	defer rows.Close()

	var policies []*models.SnapshotPolicy
	for rows.Next() {
		var policy models.SnapshotPolicy
		var enabled, recursive int
		var lastRun, nextRun sql.NullTime
		var lastError sql.NullString

		if err := rows.Scan(&policy.ID, &policy.Name, &policy.Dataset, &enabled, &policy.Schedule,
			&policy.Retention, &policy.Prefix, &recursive, &lastRun, &nextRun, &lastError,
			&policy.SnapshotCount, &policy.CreatedAt, &policy.UpdatedAt); err != nil {
			continue
		}

		policy.Enabled = enabled == 1
		policy.Recursive = recursive == 1
		if lastRun.Valid {
			policy.LastRun = &lastRun.Time
		}
		if nextRun.Valid {
			policy.NextRun = &nextRun.Time
		}
		if lastError.Valid {
			policy.LastError = lastError.String
		}

		policies = append(policies, &policy)
	}

	return policies
}

func (s *SQLiteStore) UpdateSnapshotPolicyRun(id string, lastRun time.Time, nextRun time.Time, lastError string) error {
	_, err := s.db.Exec(`
		UPDATE snapshot_policies SET last_run = ?, next_run = ?, last_error = ?, updated_at = ?
		WHERE id = ?`,
		lastRun, nextRun, lastError, time.Now(), id)
	return err
}

// ============================================================================
// Helper Functions
// ============================================================================

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func interfaceSliceToStrings(slice []interface{}) []string {
	result := make([]string, len(slice))
	for i, v := range slice {
		result[i] = fmt.Sprint(v)
	}
	return result
}
