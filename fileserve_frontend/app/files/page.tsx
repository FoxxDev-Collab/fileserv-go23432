"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { FileList, FileItem } from "@/components/files/file-list";
import { FileBreadcrumbs } from "@/components/files/breadcrumbs";
import { UploadButton } from "@/components/files/upload-button";
import { UploadDropzone } from "@/components/files/upload-dropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FolderPlus,
  RefreshCw,
  HardDrive,
  Users,
  Globe,
  FolderOpen,
  AlertCircle,
  ArrowRight,
  Database,
  Shield,
  Loader2,
  Trash2,
  FolderInput,
  X,
  CheckSquare,
} from "lucide-react";
import { toast } from "sonner";
import { zoneFilesAPI, UserZoneInfo, FileInfo, ListOptions } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ShareDialog } from "@/components/share-dialog";
import { MoveDialog } from "@/components/files/move-dialog";
import { FilesSkeleton } from "@/components/skeletons";
import { useUploadComplete } from "@/lib/hooks/use-upload";

function getZoneIcon(zoneType: string) {
  switch (zoneType) {
    case "personal":
      return <HardDrive className="h-4 w-4" />;
    case "group":
      return <Users className="h-4 w-4" />;
    case "public":
      return <Globe className="h-4 w-4" />;
    default:
      return <HardDrive className="h-4 w-4" />;
  }
}

function getZoneBadgeVariant(zoneType: string): "default" | "secondary" | "outline" {
  switch (zoneType) {
    case "personal":
      return "default";
    case "group":
      return "secondary";
    case "public":
      return "outline";
    default:
      return "default";
  }
}

// Loading skeleton for the zones area
function ZonesLoadingSkeleton() {
  return (
    <div className="space-y-6">
      {/* Zone selector skeleton */}
      <div className="flex items-center gap-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-64" />
      </div>
      {/* Breadcrumbs skeleton */}
      <Skeleton className="h-6 w-48" />
      {/* Actions bar skeleton */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-64" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-32" />
        </div>
      </div>
      {/* File list skeleton */}
      <Card>
        <CardContent className="p-0">
          <div className="divide-y">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4 p-4">
                <Skeleton className="h-10 w-10 rounded" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-8 w-20" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Empty state for admins - guides them to set up storage
function AdminEmptyState() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-2xl w-full">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Database className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Set Up Storage Zones</CardTitle>
          <CardDescription className="text-base mt-2">
            Storage zones define where users can store their files. You need to create at least one storage pool and zone to get started.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Setup steps */}
          <div className="grid gap-4">
            <div className="flex items-start gap-4 p-4 rounded-lg border bg-muted/50">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                1
              </div>
              <div className="space-y-1">
                <p className="font-medium">Create a Storage Pool</p>
                <p className="text-sm text-muted-foreground">
                  A storage pool defines a physical location on your server where files will be stored (e.g., /srv/data).
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4 p-4 rounded-lg border bg-muted/50">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                2
              </div>
              <div className="space-y-1">
                <p className="font-medium">Create a Share Zone</p>
                <p className="text-sm text-muted-foreground">
                  A share zone is a folder within a pool where users can access files. Set the type (personal, group, or public) and access permissions.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4 p-4 rounded-lg border bg-muted/50">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                3
              </div>
              <div className="space-y-1">
                <p className="font-medium">Start Using Files</p>
                <p className="text-sm text-muted-foreground">
                  Once configured, users can upload, organize, and share files through their accessible zones.
                </p>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button asChild className="flex-1">
              <Link href="/admin/storage/pools">
                <Database className="mr-2 h-4 w-4" />
                Create Storage Pool
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="flex-1">
              <Link href="/admin/storage/zones">
                <FolderOpen className="mr-2 h-4 w-4" />
                Manage Zones
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Empty state for regular users - tells them to contact admin
function UserEmptyState() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-muted flex items-center justify-center">
            <FolderOpen className="h-8 w-8 text-muted-foreground" />
          </div>
          <CardTitle className="text-xl">No Storage Access</CardTitle>
          <CardDescription className="text-base mt-2">
            You don&apos;t have access to any storage zones yet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/50 p-4">
            <div className="flex gap-3">
              <Shield className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Storage zones are managed by administrators</p>
                <p className="text-sm text-muted-foreground">
                  Contact your system administrator to request access to a storage zone. They can assign you to personal, group, or public storage areas.
                </p>
              </div>
            </div>
          </div>

          <div className="text-center pt-2">
            <p className="text-sm text-muted-foreground">
              Once you have access, you&apos;ll be able to:
            </p>
            <div className="flex flex-wrap justify-center gap-2 mt-3">
              <Badge variant="secondary" className="text-xs">
                <FolderOpen className="mr-1 h-3 w-3" />
                Browse Files
              </Badge>
              <Badge variant="secondary" className="text-xs">
                <HardDrive className="mr-1 h-3 w-3" />
                Upload &amp; Download
              </Badge>
              <Badge variant="secondary" className="text-xs">
                <Users className="mr-1 h-3 w-3" />
                Share with Others
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Error state
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle className="text-xl">Unable to Load Storage</CardTitle>
          <CardDescription className="text-base mt-2">
            {message}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button onClick={onRetry} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function FilesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPath, setCurrentPath] = useState("/");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [zones, setZones] = useState<UserZoneInfo[]>([]);
  const [selectedZone, setSelectedZone] = useState<UserZoneInfo | null>(null);
  const [zonesLoading, setZonesLoading] = useState(true);
  const [zonesError, setZonesError] = useState<string | null>(null);
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  // Pagination state
  const [totalFiles, setTotalFiles] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [currentOffset, setCurrentOffset] = useState(0);
  const PAGE_SIZE = 50; // Load 50 files at a time

  const isAdmin = user?.role === "admin";

  // Dialog states
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<FileItem | null>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [fileToRename, setFileToRename] = useState<FileItem | null>(null);
  const [newFileName, setNewFileName] = useState("");
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [fileToShare, setFileToShare] = useState<FileItem | null>(null);

  // Selection and bulk operation states
  const [selectedFiles, setSelectedFiles] = useState<FileItem[]>([]);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [isBulkOperating, setIsBulkOperating] = useState(false);

  // Convert API FileInfo to component FileItem
  const convertFiles = (apiFiles: FileInfo[]): FileItem[] => {
    return apiFiles.map((f, index) => ({
      id: `${f.path}-${index}`,
      name: f.name,
      type: f.is_dir ? "folder" as const : "file" as const,
      size: f.size,
      modifiedAt: f.mod_time,
      path: f.path,
      owner: f.owner,
      group: f.group,
      mode: f.mode,
      mimeType: f.mime_type,
      extension: f.extension,
    }));
  };

  // Load accessible zones
  const loadZones = useCallback(async () => {
    setZonesLoading(true);
    setZonesError(null);
    try {
      const userZones = await zoneFilesAPI.getAccessibleZones();
      // Handle null response - API might return null instead of empty array
      const safeZones = userZones || [];
      setZones(safeZones);
      // Auto-select first zone if available and none selected
      if (safeZones.length > 0 && !selectedZone) {
        setSelectedZone(safeZones[0]);
      }
    } catch (error) {
      console.error("Failed to load zones:", error);
      setZonesError("Failed to connect to the server. Please check your connection and try again.");
      setZones([]);
    } finally {
      setZonesLoading(false);
    }
  }, [selectedZone]);

  // Load files for current zone and path with pagination
  // Note: We use a ref for currentOffset to avoid infinite loops in useEffect
  const currentOffsetRef = useRef(currentOffset);
  currentOffsetRef.current = currentOffset;

  const loadFiles = useCallback(async (zoneId: string, path: string, append = false) => {
    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
      setCurrentOffset(0);
    }
    try {
      const offset = append ? currentOffsetRef.current : 0;
      const result = await zoneFilesAPI.listPaginated(zoneId, path, {
        limit: PAGE_SIZE,
        offset,
      });

      const newFiles = convertFiles(result.files);
      if (append) {
        setFiles(prev => [...prev, ...newFiles]);
      } else {
        setFiles(newFiles);
      }
      setTotalFiles(result.total);
      setHasMore(result.has_more);
      setCurrentOffset(offset + result.files.length);
    } catch (error) {
      console.error("Failed to load files:", error);
      toast.error("Failed to load files");
      if (!append) {
        setFiles([]);
        setTotalFiles(0);
        setHasMore(false);
      }
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, []); // Empty dependency array - no longer depends on currentOffset

  // Load more files
  const handleLoadMore = () => {
    if (selectedZone && hasMore && !isLoadingMore) {
      loadFiles(selectedZone.zone_id, currentPath, true);
    }
  };

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/");
    }
  }, [authLoading, isAuthenticated, router]);

  // Load zones when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      loadZones();
    }
  }, [isAuthenticated, loadZones]);

  // Load files when zone or path changes
  useEffect(() => {
    if (isAuthenticated && selectedZone) {
      loadFiles(selectedZone.zone_id, currentPath);
    }
  }, [selectedZone, currentPath, isAuthenticated, loadFiles]);

  const handleZoneChange = (zoneId: string) => {
    const zone = zones.find(z => z.zone_id === zoneId);
    if (zone) {
      setSelectedZone(zone);
      setCurrentPath("/");
    }
  };

  const handleNavigate = (path: string) => {
    setCurrentPath(path);
  };

  const handleRefresh = () => {
    if (selectedZone) {
      loadFiles(selectedZone.zone_id, currentPath);
    }
  };

  const handleNewFolderClick = () => {
    setNewFolderName("");
    setNewFolderOpen(true);
  };

  const handleNewFolderSubmit = async () => {
    if (!newFolderName.trim() || !selectedZone) return;

    try {
      const newPath = currentPath === "/"
        ? `/${newFolderName}`
        : `${currentPath}/${newFolderName}`;
      await zoneFilesAPI.createFolder(selectedZone.zone_id, newPath);
      toast.success("Folder created successfully");
      setNewFolderOpen(false);
      setNewFolderName("");
      loadFiles(selectedZone.zone_id, currentPath);
    } catch (error) {
      console.error("Failed to create folder:", error);
      toast.error("Failed to create folder");
    }
  };

  // Debounce ref for upload completion - prevents multiple rapid refreshes
  const uploadCompleteTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleUploadComplete = useCallback(() => {
    // Debounce: only refresh once after all uploads complete (within 500ms window)
    if (uploadCompleteTimeoutRef.current) {
      clearTimeout(uploadCompleteTimeoutRef.current);
    }
    uploadCompleteTimeoutRef.current = setTimeout(() => {
      if (selectedZone) {
        loadFiles(selectedZone.zone_id, currentPath);
      }
      uploadCompleteTimeoutRef.current = null;
    }, 500);
  }, [selectedZone, currentPath, loadFiles]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (uploadCompleteTimeoutRef.current) {
        clearTimeout(uploadCompleteTimeoutRef.current);
      }
    };
  }, []);

  // Auto-refresh files when uploads complete
  useUploadComplete(handleUploadComplete);

  const handleDeleteClick = (file: FileItem) => {
    setFileToDelete(file);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!fileToDelete || !selectedZone) return;

    try {
      await zoneFilesAPI.delete(selectedZone.zone_id, fileToDelete.path);
      toast.success(`Deleted ${fileToDelete.name}`);
      setDeleteDialogOpen(false);
      setFileToDelete(null);
      loadFiles(selectedZone.zone_id, currentPath);
    } catch (error) {
      console.error("Failed to delete:", error);
      toast.error("Failed to delete file");
    }
  };

  const handleDownload = async (file: FileItem) => {
    if (!selectedZone) return;
    try {
      toast.info(`Downloading ${file.name}...`);
      await zoneFilesAPI.download(selectedZone.zone_id, file.path);
      toast.success(`Downloaded ${file.name}`);
    } catch (error) {
      console.error("Failed to download:", error);
      toast.error("Failed to download file");
    }
  };

  const handleRenameClick = (file: FileItem) => {
    setFileToRename(file);
    setNewFileName(file.name);
    setRenameDialogOpen(true);
  };

  const handleRenameSubmit = async () => {
    if (!fileToRename || !newFileName.trim() || newFileName === fileToRename.name || !selectedZone) return;

    try {
      const parentPath = fileToRename.path.substring(0, fileToRename.path.lastIndexOf("/")) || "/";
      const newPath = parentPath === "/"
        ? `/${newFileName}`
        : `${parentPath}/${newFileName}`;
      await zoneFilesAPI.rename(selectedZone.zone_id, fileToRename.path, newPath);
      toast.success("File renamed successfully");
      setRenameDialogOpen(false);
      setFileToRename(null);
      setNewFileName("");
      loadFiles(selectedZone.zone_id, currentPath);
    } catch (error) {
      console.error("Failed to rename:", error);
      toast.error("Failed to rename file");
    }
  };

  const handleShareClick = (file: FileItem) => {
    setFileToShare(file);
    setShareDialogOpen(true);
  };

  // Handle selection changes
  const handleSelectionChange = useCallback((selected: FileItem[]) => {
    setSelectedFiles(selected);
  }, []);

  // Clear selection
  const clearSelection = () => {
    setSelectedFiles([]);
  };

  // Bulk delete handler
  const handleBulkDelete = async () => {
    if (!selectedZone || selectedFiles.length === 0) return;

    setIsBulkOperating(true);
    try {
      const paths = selectedFiles.map((f) => f.path);
      const result = await zoneFilesAPI.bulkDelete(selectedZone.zone_id, paths);

      if (result.deleted.length > 0) {
        toast.success(`Deleted ${result.deleted.length} item${result.deleted.length !== 1 ? "s" : ""}`);
      }
      if (result.failed && result.failed.length > 0) {
        toast.error(`Failed to delete ${result.failed.length} item${result.failed.length !== 1 ? "s" : ""}`);
      }

      setBulkDeleteDialogOpen(false);
      setSelectedFiles([]);
      loadFiles(selectedZone.zone_id, currentPath);
    } catch (error) {
      console.error("Failed to bulk delete:", error);
      toast.error("Failed to delete files");
    } finally {
      setIsBulkOperating(false);
    }
  };

  // Bulk move handler
  const handleBulkMove = async (destination: string) => {
    if (!selectedZone || selectedFiles.length === 0) return;

    setIsBulkOperating(true);
    try {
      const paths = selectedFiles.map((f) => f.path);
      const result = await zoneFilesAPI.bulkMove(selectedZone.zone_id, paths, destination);

      if (result.moved.length > 0) {
        toast.success(`Moved ${result.moved.length} item${result.moved.length !== 1 ? "s" : ""}`);
      }
      if (result.failed && result.failed.length > 0) {
        toast.error(`Failed to move ${result.failed.length} item${result.failed.length !== 1 ? "s" : ""}`);
      }

      setMoveDialogOpen(false);
      setSelectedFiles([]);
      loadFiles(selectedZone.zone_id, currentPath);
    } catch (error) {
      console.error("Failed to bulk move:", error);
      toast.error("Failed to move files");
    } finally {
      setIsBulkOperating(false);
    }
  };

  const filteredFiles = files.filter((file) =>
    file.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Show skeleton during initial auth check (only if no cached user)
  if (authLoading && !user) {
    return <FilesSkeleton />;
  }

  // Not authenticated - will redirect, show skeleton in meantime
  if (!authLoading && !isAuthenticated) {
    return <FilesSkeleton />;
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Files" />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto">
            {/* Loading State */}
            {zonesLoading ? (
              <ZonesLoadingSkeleton />
            ) : zonesError ? (
              /* Error State */
              <ErrorState message={zonesError} onRetry={loadZones} />
            ) : zones.length === 0 ? (
              /* Empty State - different for admins vs users */
              isAdmin ? <AdminEmptyState /> : <UserEmptyState />
            ) : (
              /* Normal file browser */
              <div className="space-y-6">
                {/* Zone Selector */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="zone-select" className="text-sm font-medium whitespace-nowrap">
                      Storage Zone:
                    </Label>
                    <Select
                      value={selectedZone?.zone_id || ""}
                      onValueChange={handleZoneChange}
                    >
                      <SelectTrigger id="zone-select" className="w-64">
                        <SelectValue placeholder="Select a zone" />
                      </SelectTrigger>
                      <SelectContent>
                        {zones.map((zone) => (
                          <SelectItem key={zone.zone_id} value={zone.zone_id}>
                            <div className="flex items-center gap-2">
                              {getZoneIcon(zone.zone_type)}
                              <span>{zone.zone_name}</span>
                              <Badge variant={getZoneBadgeVariant(zone.zone_type)} className="ml-2 text-xs">
                                {zone.zone_type}
                              </Badge>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {selectedZone?.description && (
                    <p className="text-sm text-muted-foreground">
                      {selectedZone.description}
                    </p>
                  )}
                </div>

                {selectedZone && (
                  <>
                    {/* Breadcrumb Navigation */}
                    <FileBreadcrumbs
                      path={currentPath}
                      onNavigate={handleNavigate}
                      rootLabel={selectedZone.zone_name}
                    />

                    {/* Bulk Action Toolbar - Shows when files are selected */}
                    {selectedFiles.length > 0 && (
                      <div className="flex items-center gap-3 p-3 bg-primary/10 border border-primary/20 rounded-lg">
                        <div className="flex items-center gap-2">
                          <CheckSquare className="h-4 w-4 text-primary" />
                          <span className="text-sm font-medium">
                            {selectedFiles.length} selected
                          </span>
                        </div>
                        <div className="h-4 w-px bg-border" />
                        <div className="flex gap-2">
                          {selectedZone.can_upload && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setMoveDialogOpen(true)}
                              disabled={isBulkOperating}
                            >
                              <FolderInput className="mr-2 h-4 w-4" />
                              Move
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setBulkDeleteDialogOpen(true)}
                            disabled={isBulkOperating}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </Button>
                        </div>
                        <div className="flex-1" />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={clearSelection}
                        >
                          <X className="mr-2 h-4 w-4" />
                          Clear
                        </Button>
                      </div>
                    )}

                    {/* Actions Bar */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <Input
                        type="search"
                        placeholder="Search files..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="max-w-md"
                      />
                      <div className="flex gap-2">
                        <Button variant="outline" size="icon" onClick={handleRefresh} disabled={isLoading}>
                          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                        </Button>
                        {selectedZone.can_upload && (
                          <>
                            <Button variant="outline" onClick={handleNewFolderClick}>
                              <FolderPlus className="mr-2 h-4 w-4" />
                              New Folder
                            </Button>
                            <UploadButton
                              currentPath={currentPath}
                              onUploadComplete={handleUploadComplete}
                              zoneId={selectedZone.zone_id}
                            />
                          </>
                        )}
                      </div>
                    </div>

                    {/* File List with Drag & Drop */}
                    <UploadDropzone
                      currentPath={currentPath}
                      zoneId={selectedZone.zone_id}
                      disabled={!selectedZone.can_upload}
                      className="min-h-[300px]"
                    >
                      {isLoading ? (
                        <Card>
                          <CardContent className="p-0">
                            <div className="divide-y">
                              {[1, 2, 3].map((i) => (
                                <div key={i} className="flex items-center gap-4 p-4">
                                  <Skeleton className="h-10 w-10 rounded" />
                                  <div className="flex-1 space-y-2">
                                    <Skeleton className="h-4 w-48" />
                                    <Skeleton className="h-3 w-24" />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      ) : (
                        <>
                          <FileList
                            files={filteredFiles}
                            onNavigate={handleNavigate}
                            onDelete={handleDeleteClick}
                            onDownload={handleDownload}
                            onRename={handleRenameClick}
                            onShare={selectedZone.can_share ? handleShareClick : undefined}
                            showSelection={true}
                            onSelectionChange={handleSelectionChange}
                          />
                          {/* Load More Button */}
                          {hasMore && !searchTerm && (
                            <div className="flex justify-center py-4">
                              <Button
                                variant="outline"
                                onClick={handleLoadMore}
                                disabled={isLoadingMore}
                                className="min-w-[200px]"
                              >
                                {isLoadingMore ? (
                                  <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Loading...
                                  </>
                                ) : (
                                  <>
                                    Load More ({files.length} of {totalFiles})
                                  </>
                                )}
                              </Button>
                            </div>
                          )}
                        </>
                      )}
                    </UploadDropzone>
                  </>
                )}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* New Folder Dialog */}
      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>
              Enter a name for the new folder.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="folder-name">Folder name</Label>
              <Input
                id="folder-name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="New Folder"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleNewFolderSubmit();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFolderOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleNewFolderSubmit} disabled={!newFolderName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {fileToDelete?.type === "folder" ? "Folder" : "File"}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{fileToDelete?.name}&quot;?
              {fileToDelete?.type === "folder" && " This will delete all contents inside the folder."}
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename {fileToRename?.type === "folder" ? "Folder" : "File"}</DialogTitle>
            <DialogDescription>
              Enter a new name for &quot;{fileToRename?.name}&quot;.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="new-name">New name</Label>
              <Input
                id="new-name"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleRenameSubmit();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleRenameSubmit}
              disabled={!newFileName.trim() || newFileName === fileToRename?.name}
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Dialog */}
      {fileToShare && selectedZone && (
        <ShareDialog
          open={shareDialogOpen}
          onOpenChange={setShareDialogOpen}
          targetPath={`${selectedZone.full_path}${fileToShare.path}`}
          isFolder={fileToShare.type === "folder"}
          targetName={fileToShare.name}
        />
      )}

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedFiles.length} item{selectedFiles.length !== 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the selected items?
              {selectedFiles.some(f => f.type === "folder") && " Folders will have all their contents deleted."}
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkOperating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isBulkOperating}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isBulkOperating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete All"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Move Dialog */}
      {selectedZone && (
        <MoveDialog
          open={moveDialogOpen}
          onOpenChange={setMoveDialogOpen}
          zoneId={selectedZone.zone_id}
          selectedFiles={selectedFiles.map(f => ({ name: f.name, path: f.path, type: f.type }))}
          currentPath={currentPath}
          onMove={handleBulkMove}
        />
      )}
    </div>
  );
}
