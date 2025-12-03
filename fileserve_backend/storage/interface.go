package storage

import (
	"time"

	"fileserv/models"
)

// DataStore defines the interface for all storage operations
type DataStore interface {
	// User operations
	GetUserByUsername(username string) (*models.User, error)
	GetUserByID(id string) (*models.User, error)
	CreateUser(username, password, email string, isAdmin bool, groups []string) (*models.User, error)
	UpdateUser(id string, updates map[string]interface{}) (*models.User, error)
	DeleteUser(id string) error
	ListUsers() []*models.User

	// Session operations
	CreateSession(userID string, token string, expiresAt time.Time) error
	GetSession(token string) (*models.Session, error)
	DeleteSession(token string) error
	CleanExpiredSessions() error

	// Permission operations
	CreatePermission(path string, permType models.PermissionType, username, group string) (*models.Permission, error)
	DeletePermission(id string) error
	UpdatePermission(id string, path string, permType models.PermissionType, username, group string) (*models.Permission, error)
	ListPermissions() []models.Permission
	GetPermissions() []models.Permission

	// Share operations
	CreateShare(share *models.Share) (*models.Share, error)
	GetShare(id string) (*models.Share, error)
	GetShareByName(name string) (*models.Share, error)
	UpdateShare(id string, updates map[string]interface{}) (*models.Share, error)
	DeleteShare(id string) error
	ListShares() []*models.Share
	ListSharesByProtocol(protocol models.ShareProtocol) []*models.Share

	// Storage Pool operations
	CreateStoragePool(pool *models.StoragePool) (*models.StoragePool, error)
	GetStoragePool(id string) (*models.StoragePool, error)
	GetStoragePoolByName(name string) (*models.StoragePool, error)
	UpdateStoragePool(id string, updates map[string]interface{}) (*models.StoragePool, error)
	DeleteStoragePool(id string) error
	ListStoragePools() []*models.StoragePool

	// Share Zone operations
	CreateShareZone(zone *models.ShareZone) (*models.ShareZone, error)
	GetShareZone(id string) (*models.ShareZone, error)
	GetShareZoneByName(name string) (*models.ShareZone, error)
	UpdateShareZone(id string, updates map[string]interface{}) (*models.ShareZone, error)
	DeleteShareZone(id string) error
	ListShareZones() []*models.ShareZone
	ListShareZonesByPool(poolID string) []*models.ShareZone

	// Share Link operations
	CreateShareLink(link *models.ShareLink) (*models.ShareLink, error)
	GetShareLink(id string) (*models.ShareLink, error)
	GetShareLinkByToken(token string) (*models.ShareLink, error)
	UpdateShareLink(id string, updates map[string]interface{}) (*models.ShareLink, error)
	DeleteShareLink(id string) error
	ListShareLinks() []*models.ShareLink
	ListShareLinksByOwner(ownerID string) []*models.ShareLink
	IncrementShareLinkDownload(id string) error
	IncrementShareLinkView(id string) error
	CleanExpiredShareLinks() error
}

// Ensure both Store types implement DataStore
var _ DataStore = (*Store)(nil)
var _ DataStore = (*SQLiteStore)(nil)
