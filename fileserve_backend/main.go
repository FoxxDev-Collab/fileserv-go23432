package main

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"fileserv/config"
	"fileserv/handlers"
	"fileserv/internal/fileops"
	"fileserv/middleware"
	"fileserv/storage"

	"github.com/go-chi/chi/v5"
)

//go:embed static/*
var staticFiles embed.FS

func main() {
	// Load configuration
	cfg := config.Load()

	// Initialize SQLite storage
	dbPath := cfg.StorageFile
	if strings.HasSuffix(dbPath, ".json") {
		dbPath = strings.TrimSuffix(dbPath, ".json") + ".db"
	}
	store, err := storage.NewSQLiteStore(dbPath)
	if err != nil {
		log.Fatalf("Failed to initialize storage: %v", err)
	}
	defer store.Close()

	// Initialize ownership cache for file listings
	fileops.InitOwnershipCache()

	// Initialize chunked upload manager
	chunkedUploadManager, err := fileops.NewChunkedUploadManager(cfg.DataDir)
	if err != nil {
		log.Fatalf("Failed to initialize chunked upload manager: %v", err)
	}
	defer chunkedUploadManager.Close()

	// Initialize handlers
	poolHandler := handlers.NewPoolHandler(store)
	zoneHandler := handlers.NewZoneHandler(store)
	shareLinkHandler := handlers.NewShareLinkHandler(store, cfg.DataDir)
	publicHandler := handlers.NewPublicHandler(store, cfg.DataDir)
	zoneFileHandler := handlers.NewZoneFileHandler(store)
	chunkedUploadHandler := handlers.NewChunkedUploadHandler(store, chunkedUploadManager)
	setupHandler := handlers.NewSetupHandler(store)
	settingsHandler := handlers.NewSettingsHandler(store)

	// Initialize snapshot scheduler
	snapshotScheduler := handlers.NewSnapshotScheduler(store)
	snapshotScheduler.Start()
	defer snapshotScheduler.Stop()
	snapshotPolicyHandler := handlers.NewSnapshotPolicyHandler(store, snapshotScheduler)

	// Get JWT secret from database if available, otherwise use config or generate one
	jwtSecret := handlers.GetJWTSecretFromStore(store)
	if jwtSecret == "" {
		jwtSecret = cfg.JWTSecret
	}
	if jwtSecret == "" {
		// Generate a temporary secret for first run (will be replaced during setup)
		log.Println("Warning: No JWT secret configured. A temporary secret will be used until setup is complete.")
		jwtSecret = "temporary-secret-complete-setup-wizard"
	}

	// Setup router
	r := chi.NewRouter()

	// Global middleware
	r.Use(middleware.Logger)
	r.Use(middleware.CORS)

	// Public share routes (NO AUTH)
	r.Route("/s/{token}", func(r chi.Router) {
		r.Get("/", publicHandler.GetPublicShare)
		r.Post("/verify", publicHandler.VerifySharePassword)
		r.Get("/list", publicHandler.ListPublicShare)
		r.Get("/download", publicHandler.DownloadPublicShare)
		r.Get("/preview", publicHandler.PreviewPublicFile)
		r.Post("/upload", publicHandler.UploadToPublicShare)
	})

	// API routes
	r.Route("/api", func(r chi.Router) {
		// Setup routes (public - but only work before setup is complete)
		r.Get("/setup/status", setupHandler.GetSetupStatus)
		r.Post("/setup/complete", setupHandler.CompleteSetup)

		// Auth routes (public)
		r.Post("/auth/login", handlers.Login(store, cfg, jwtSecret))

		// Protected routes
		r.Group(func(r chi.Router) {
			r.Use(middleware.Auth(jwtSecret))

			r.Post("/auth/logout", handlers.Logout())
			r.Post("/auth/refresh", handlers.RefreshToken(jwtSecret))
			r.Get("/auth/me", handlers.GetCurrentUser())
			r.Post("/auth/password", handlers.ChangePassword(cfg))

			// File operations (legacy - uses global DataDir)
			r.Get("/files", handlers.ListFiles(store, cfg))
			r.Get("/files/*", handlers.GetFile(store, cfg))
			r.Post("/files/*", handlers.UploadFile(store, cfg))
			r.Delete("/files/*", handlers.DeleteFile(store, cfg))
			r.Put("/files/*", handlers.RenameFile(store, cfg))
			r.Post("/folders/*", handlers.CreateFolder(store, cfg))

			// Zone-based file operations (uses Pools/Zones)
			r.Get("/zones/accessible", zoneFileHandler.GetUserZones)
			r.Route("/zones/{zoneId}/files", func(r chi.Router) {
				r.Get("/", zoneFileHandler.ListZoneFiles)
				r.Get("/*", zoneFileHandler.DownloadZoneFile)
				r.Post("/*", zoneFileHandler.UploadZoneFile)
				r.Delete("/*", zoneFileHandler.DeleteZoneFile)
				r.Put("/*", zoneFileHandler.RenameZoneFile)
			})
			r.Post("/zones/{zoneId}/folders/*", zoneFileHandler.CreateZoneFolder)
			r.Get("/zones/{zoneId}/folders", zoneFileHandler.GetZoneFolders)

			// Bulk operations for zones
			r.Post("/zones/{zoneId}/bulk/delete", zoneFileHandler.BulkDeleteZoneFiles)
			r.Post("/zones/{zoneId}/bulk/move", zoneFileHandler.BulkMoveZoneFiles)

			// Zone stats (recursive file count and size)
			r.Get("/zones/{zoneId}/stats", zoneFileHandler.GetZoneStats)

			// Chunked/resumable upload routes
			r.Route("/upload", func(r chi.Router) {
				r.Post("/session", chunkedUploadHandler.CreateSession)
				r.Get("/session/{sessionId}", chunkedUploadHandler.GetProgress)
				r.Delete("/session/{sessionId}", chunkedUploadHandler.CancelSession)
				r.Post("/session/{sessionId}/chunk/{chunkIndex}", chunkedUploadHandler.UploadChunk)
				r.Post("/session/{sessionId}/finalize", chunkedUploadHandler.Finalize)
				r.Get("/sessions", chunkedUploadHandler.ListMySessions)
			})

			// Share links (user can create their own)
			r.Route("/links", func(r chi.Router) {
				r.Get("/", shareLinkHandler.GetMyShareLinks)
				r.Post("/", shareLinkHandler.CreateShareLink)
				r.Get("/{id}", shareLinkHandler.GetShareLink)
				r.Put("/{id}", shareLinkHandler.UpdateShareLink)
				r.Delete("/{id}", shareLinkHandler.DeleteShareLink)
			})

			// Admin routes
			r.Group(func(r chi.Router) {
				r.Use(middleware.RequireAdmin)

				r.Get("/admin/stats", handlers.GetStats(store, cfg))

				// Settings management
				r.Route("/admin/settings", func(r chi.Router) {
					r.Get("/", settingsHandler.GetSettings)
					r.Put("/", settingsHandler.UpdateSettings)
					r.Post("/regenerate-jwt", settingsHandler.RegenerateJWTSecret)
				})

				// Internal user management
				r.Get("/users", handlers.ListUsers(store))
				r.Post("/users", handlers.CreateUser(store))
				r.Put("/users/{id}", handlers.UpdateUser(store))
				r.Delete("/users/{id}", handlers.DeleteUser(store))

				// System user management (for root/wheel admins)
				r.Get("/system/users", handlers.ListSystemUsers())
				r.Post("/system/users", handlers.CreateSystemUser())
				r.Get("/system/users/{username}", handlers.GetSystemUser())
				r.Put("/system/users/{username}", handlers.UpdateSystemUser())
				r.Delete("/system/users/{username}", handlers.DeleteSystemUser())
				r.Get("/system/groups", handlers.ListSystemGroups())
				r.Post("/system/groups", handlers.CreateSystemGroup())
				r.Get("/system/groups/{groupname}", handlers.GetSystemGroup())
				r.Put("/system/groups/{groupname}", handlers.UpdateSystemGroup())
				r.Delete("/system/groups/{groupname}", handlers.DeleteSystemGroup())
				r.Post("/system/groups/{groupname}/members", handlers.AddGroupMember())
				r.Delete("/system/groups/{groupname}/members", handlers.RemoveGroupMember())

				// File share management
				r.Get("/shares", handlers.ListShares(store))
				r.Post("/shares", handlers.CreateShare(store))
				r.Get("/shares/{id}", handlers.GetShare(store))
				r.Put("/shares/{id}", handlers.UpdateShare(store))
				r.Delete("/shares/{id}", handlers.DeleteShare(store))
				r.Post("/shares/{id}/access", handlers.AddShareAccess(store))
				r.Delete("/shares/{id}/access", handlers.RemoveShareAccess(store))

				// Storage Pools
				r.Route("/admin/pools", func(r chi.Router) {
					r.Get("/", poolHandler.GetStoragePools)
					r.Post("/", poolHandler.CreateStoragePool)
					r.Get("/{id}", poolHandler.GetStoragePool)
					r.Put("/{id}", poolHandler.UpdateStoragePool)
					r.Delete("/{id}", poolHandler.DeleteStoragePool)
					r.Get("/{id}/usage", poolHandler.GetPoolUsage)
					r.Get("/{id}/zones", poolHandler.GetPoolZones)
				})

				// Share Zones
				r.Route("/admin/zones", func(r chi.Router) {
					r.Get("/", zoneHandler.GetShareZones)
					r.Post("/", zoneHandler.CreateShareZone)
					r.Get("/{id}", zoneHandler.GetShareZone)
					r.Put("/{id}", zoneHandler.UpdateShareZone)
					r.Delete("/{id}", zoneHandler.DeleteShareZone)
					r.Get("/{id}/usage", zoneHandler.GetZoneUsage)
					r.Post("/{id}/provision", zoneHandler.ProvisionUserDirectory)
				})

				// Admin share links management
				r.Get("/links", shareLinkHandler.GetAllShareLinks)

				r.Get("/permissions", handlers.ListPermissions(store))
				r.Post("/permissions", handlers.CreatePermission(store))
				r.Put("/permissions/{id}", handlers.UpdatePermission(store))
				r.Delete("/permissions/{id}", handlers.DeletePermission(store))

				// Storage Management (Enterprise)
				r.Route("/storage", func(r chi.Router) {
					// Overview
					r.Get("/overview", handlers.GetStorageOverview())

					// Disks and Partitions
					r.Get("/disks", handlers.GetDisks())
					r.Post("/disks/partition-table", handlers.CreatePartitionTable())
					r.Post("/partitions", handlers.CreatePartition())
					r.Delete("/partitions", handlers.DeletePartition())
					r.Post("/partitions/format", handlers.FormatPartition())

					// Directory browsing for path selection
					r.Get("/browse", handlers.BrowseDirectories())

					// Available devices for storage setup
					r.Get("/devices/available", handlers.GetAvailableDevices())

					// Device setup (format + mount + fstab)
					r.Post("/devices/setup", handlers.SetupStorageDevice())

					// Mount point creation
					r.Post("/mountpoint", handlers.CreateMountPoint())

					// Mount operations
					r.Get("/mounts", handlers.GetMountPoints())
					r.Post("/mounts", handlers.Mount())
					r.Delete("/mounts", handlers.Unmount())
					r.Get("/fstab", handlers.GetFstab())

					// I/O Statistics
					r.Get("/iostats", handlers.GetIOStats())

					// LVM Management
					r.Get("/lvm/vgs", handlers.GetVolumeGroups())
					r.Post("/lvm/vgs", handlers.CreateVolumeGroup())
					r.Delete("/lvm/vgs", handlers.DeleteVolumeGroup())
					r.Post("/lvm/lvs", handlers.CreateLogicalVolume())
					r.Delete("/lvm/lvs", handlers.DeleteLogicalVolume())
					r.Post("/lvm/lvs/resize", handlers.ResizeLogicalVolume())

					// RAID Management
					r.Get("/raid", handlers.GetRAIDArrays())
					r.Get("/raid/status", handlers.GetRAIDStatus())
					r.Get("/raid/devices", handlers.GetAvailableDevicesForRAID())
					r.Post("/raid", handlers.CreateRAIDArray())
					r.Delete("/raid", handlers.RemoveRAIDArray())
					r.Post("/raid/stop", handlers.StopRAIDArray())
					r.Post("/raid/add-device", handlers.AddRAIDDevice())
					r.Post("/raid/remove-device", handlers.RemoveRAIDDevice())
					r.Post("/raid/fail-device", handlers.MarkRAIDDeviceFaulty())

					// ZFS Management
					r.Get("/zfs/pools", handlers.GetZFSPools())
				})

				// Quota Management
				r.Route("/quotas", func(r chi.Router) {
					r.Get("/", handlers.GetQuotas())
					r.Get("/user", handlers.GetUserQuota())
					r.Get("/group", handlers.GetGroupQuota())
					r.Post("/", handlers.SetQuota())
					r.Delete("/", handlers.RemoveQuota())
					r.Get("/status", handlers.GetQuotaStatus())
					r.Post("/enable", handlers.EnableQuotas())
					r.Delete("/disable", handlers.DisableQuotas())
				})

				// User Storage Usage
				r.Get("/storage/users", handlers.GetUserStorageUsage())
				r.Get("/storage/users/{username}", handlers.GetSpecificUserStorage())
				r.Get("/storage/scan", handlers.ScanFilesystemUsage())
				r.Get("/storage/large-files", handlers.FindLargeFiles())
				r.Get("/storage/health", handlers.CheckFilesystemHealth())

				// Sharing Services Management (SMB/NFS)
				r.Route("/sharing", func(r chi.Router) {
					r.Get("/status", handlers.GetSharingServices())
					r.Post("/install", handlers.InstallSharingService())
					r.Get("/install/stream", handlers.InstallSharingServiceStream())
					r.Post("/control", handlers.ControlSharingService())
					r.Get("/smb/config", handlers.GetSMBConfig())
					r.Get("/smb/status", handlers.GetSMBStatus())
					r.Get("/smb/test", handlers.TestSMBConnection())
					r.Get("/smb/users", handlers.GetSambaUsers())
					r.Post("/smb/password", handlers.SetSambaPassword())
					r.Get("/nfs/exports", handlers.GetNFSExports())
					r.Get("/nfs/status", handlers.GetNFSStatus())
					r.Get("/nfs/test", handlers.TestNFSConnection())
				})

				// ZFS Management
				r.Route("/zfs", func(r chi.Router) {
					// Status (installation is left to the user/admin to do manually)
					r.Get("/status", handlers.GetZFSStatus())
					r.Post("/load-module", handlers.LoadZFSModule())
					r.Get("/disks", handlers.GetAvailableDisksForZFS())

					// Pool Management
					r.Get("/pools", handlers.ListZFSPools())
					r.Get("/pools/status", handlers.GetZFSPoolStatus())
					r.Post("/pools", handlers.CreateZFSPool())
					r.Delete("/pools", handlers.DestroyZFSPool())
					r.Post("/pools/scrub", handlers.ScrubZFSPool())
					r.Post("/pools/import", handlers.ImportZFSPool())
					r.Post("/pools/export", handlers.ExportZFSPool())
					r.Get("/pools/importable", handlers.ListImportablePools())

					// Dataset Management
					r.Get("/datasets", handlers.ListZFSDatasets())
					r.Post("/datasets", handlers.CreateZFSDataset())
					r.Delete("/datasets", handlers.DestroyZFSDataset())
					r.Post("/datasets/property", handlers.SetZFSProperty())

					// Snapshot Management
					r.Get("/snapshots", handlers.ListZFSSnapshots())
					r.Post("/snapshots", handlers.CreateZFSSnapshot())
					r.Delete("/snapshots", handlers.DeleteZFSSnapshot())
					r.Post("/snapshots/rollback", handlers.RollbackZFSSnapshot())

					// Snapshot Scheduling
					r.Get("/snapshot-policies", snapshotPolicyHandler.ListPolicies)
					r.Post("/snapshot-policies", snapshotPolicyHandler.CreatePolicy)
					r.Get("/snapshot-policies/status", snapshotPolicyHandler.GetSchedulerStatus)
					r.Get("/snapshot-policies/{id}", snapshotPolicyHandler.GetPolicy)
					r.Put("/snapshot-policies/{id}", snapshotPolicyHandler.UpdatePolicy)
					r.Delete("/snapshot-policies/{id}", snapshotPolicyHandler.DeletePolicy)
					r.Post("/snapshot-policies/{id}/run", snapshotPolicyHandler.RunPolicy)
					r.Get("/snapshot-policies/{id}/snapshots", snapshotPolicyHandler.GetPolicySnapshots)
				})

				// System Management
				r.Route("/system", func(r chi.Router) {
					// Resources and Hardware
					r.Get("/resources", handlers.GetSystemResources())
					r.Get("/hardware", handlers.GetHardwareInfo())

					// Services
					r.Get("/services", handlers.GetServices())
					r.Post("/services", handlers.ControlService())

					// Network
					r.Get("/network", handlers.GetNetworkInterfaces())

					// Processes
					r.Get("/processes", handlers.GetProcesses())
					r.Post("/processes/kill", handlers.KillProcess())

					// Logs
					r.Get("/logs", handlers.GetSystemLogs())
					r.Get("/dmesg", handlers.GetDMESGLogs())

					// Scheduled Tasks
					r.Get("/tasks", handlers.GetScheduledTasks())

					// Power Control
					r.Post("/power", handlers.PowerControl())
				})
			})
		})
	})

	// Serve static files from embedded filesystem
	staticFS, err := fs.Sub(staticFiles, "static")
	if err != nil {
		log.Fatalf("Failed to create static filesystem: %v", err)
	}
	r.Get("/*", handlers.ServeStatic(staticFS))

	// Create HTTP server
	srv := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Port),
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in goroutine
	go func() {
		log.Printf("Data directory: %s", cfg.DataDir)
		log.Printf("Storage file: %s", cfg.StorageFile)

		if cfg.TLSCert != "" && cfg.TLSKey != "" {
			log.Printf("Starting HTTPS server on port %d", cfg.Port)
			if err := srv.ListenAndServeTLS(cfg.TLSCert, cfg.TLSKey); err != nil && err != http.ErrServerClosed {
				log.Fatalf("Server error: %v", err)
			}
		} else {
			log.Printf("Starting HTTP server on port %d", cfg.Port)
			if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				log.Fatalf("Server error: %v", err)
			}
		}
	}()

	// Wait for interrupt signal for graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")

	// Graceful shutdown with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exited")
}
