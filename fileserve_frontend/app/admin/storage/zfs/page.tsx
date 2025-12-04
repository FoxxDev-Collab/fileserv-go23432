"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TerminalOutput } from "@/components/terminal-output";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/lib/auth-context";
import {
  zfsAPI,
  ZFSStatus,
  ZFSPool,
  ZFSPoolStatus,
  ZFSDataset,
  ZFSSnapshot,
  ZFSDisk,
  ImportablePool,
} from "@/lib/api";
import { PageSkeleton } from "@/components/skeletons";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Database,
  HardDrive,
  RefreshCw,
  Plus,
  Trash2,
  Download,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  Info,
  Shield,
  FolderOpen,
  Camera,
  RotateCcw,
  Upload,
  Play,
  Square,
  MoreVertical,
  Package,
} from "lucide-react";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export default function ZFSManagementPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [status, setStatus] = useState<ZFSStatus | null>(null);
  const [pools, setPools] = useState<ZFSPool[]>([]);
  const [datasets, setDatasets] = useState<ZFSDataset[]>([]);
  const [snapshots, setSnapshots] = useState<ZFSSnapshot[]>([]);
  const [availableDisks, setAvailableDisks] = useState<ZFSDisk[]>([]);
  const [importablePools, setImportablePools] = useState<ImportablePool[]>([]);
  const [selectedPoolStatus, setSelectedPoolStatus] = useState<ZFSPoolStatus | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isLoadingModule, setIsLoadingModule] = useState(false);

  // Dialogs
  const [createPoolOpen, setCreatePoolOpen] = useState(false);
  const [createDatasetOpen, setCreateDatasetOpen] = useState(false);
  const [createSnapshotOpen, setCreateSnapshotOpen] = useState(false);
  const [poolStatusOpen, setPoolStatusOpen] = useState(false);
  const [importPoolOpen, setImportPoolOpen] = useState(false);

  // Form states
  const [newPool, setNewPool] = useState({
    name: "",
    vdev_type: "stripe",
    devices: [] as string[],
    mountpoint: "",
    force: false,
  });
  const [newDataset, setNewDataset] = useState({
    name: "",
    mountpoint: "",
    compression: "lz4",
    quota: "",
  });
  const [newSnapshot, setNewSnapshot] = useState({
    dataset: "",
    name: "",
    recursive: false,
  });

  const [isCreatingPool, setIsCreatingPool] = useState(false);
  const [isCreatingDataset, setIsCreatingDataset] = useState(false);
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);
  const [showInstallTerminal, setShowInstallTerminal] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.replace("/");
      return;
    }
    if (user && user.role === "user") {
      router.replace("/dashboard");
    }
  }, [authLoading, isAuthenticated, user, router]);

  const fetchZFSData = async () => {
    try {
      const statusData = await zfsAPI.getStatus();
      setStatus(statusData);

      if (statusData.installed && statusData.kernel_module) {
        // Fetch all ZFS data in parallel
        const [poolsData, datasetsData, snapshotsData, disksData] = await Promise.all([
          zfsAPI.listPools().catch(() => []),
          zfsAPI.listDatasets().catch(() => []),
          zfsAPI.listSnapshots().catch(() => []),
          zfsAPI.getAvailableDisks().catch(() => []),
        ]);
        setPools(poolsData);
        setDatasets(datasetsData);
        setSnapshots(snapshotsData);
        setAvailableDisks(disksData);

        // Fetch importable pools
        try {
          const importable = await zfsAPI.listImportablePools();
          setImportablePools(importable);
        } catch {
          setImportablePools([]);
        }
      }
    } catch (error) {
      toast.error(`Failed to load ZFS data: ${error}`);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && user?.role === "admin") {
      fetchZFSData();
    }
  }, [isAuthenticated, user]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchZFSData();
  };

  const handleInstall = () => {
    setIsInstalling(true);
    setShowInstallTerminal(true);
  };

  const handleInstallComplete = useCallback((success: boolean) => {
    setIsInstalling(false);
    if (success) {
      toast.success("ZFS installed successfully");
      fetchZFSData();
    } else {
      toast.error("ZFS installation failed - check the output above for details");
    }
  }, []);

  const handleCloseTerminal = () => {
    setShowInstallTerminal(false);
    fetchZFSData();
  };

  const handleLoadModule = async () => {
    setIsLoadingModule(true);
    try {
      const result = await zfsAPI.loadModule();
      toast.success(result.message);
      fetchZFSData();
    } catch (error) {
      toast.error(`Failed to load ZFS module: ${error}`);
    } finally {
      setIsLoadingModule(false);
    }
  };

  const handleCreatePool = async () => {
    if (!newPool.name || newPool.devices.length === 0) {
      toast.error("Pool name and at least one device are required");
      return;
    }
    setIsCreatingPool(true);
    try {
      await zfsAPI.createPool({
        name: newPool.name,
        vdev_type: newPool.vdev_type,
        devices: newPool.devices,
        mountpoint: newPool.mountpoint || undefined,
        force: newPool.force,
      });
      toast.success(`Pool ${newPool.name} created successfully`);
      setCreatePoolOpen(false);
      setNewPool({ name: "", vdev_type: "stripe", devices: [], mountpoint: "", force: false });
      fetchZFSData();
    } catch (error) {
      toast.error(`Failed to create pool: ${error}`);
    } finally {
      setIsCreatingPool(false);
    }
  };

  const handleDestroyPool = async (name: string) => {
    if (!confirm(`Are you sure you want to destroy pool "${name}"? This will DELETE ALL DATA in the pool!`)) {
      return;
    }
    try {
      await zfsAPI.destroyPool(name, true);
      toast.success(`Pool ${name} destroyed`);
      fetchZFSData();
    } catch (error) {
      toast.error(`Failed to destroy pool: ${error}`);
    }
  };

  const handleScrubPool = async (pool: string, action: 'start' | 'stop') => {
    try {
      await zfsAPI.scrubPool(pool, action);
      toast.success(`Scrub ${action}ed for pool ${pool}`);
      fetchZFSData();
    } catch (error) {
      toast.error(`Failed to ${action} scrub: ${error}`);
    }
  };

  const handleExportPool = async (pool: string) => {
    if (!confirm(`Export pool "${pool}"? It will be unmounted and made unavailable.`)) {
      return;
    }
    try {
      await zfsAPI.exportPool(pool);
      toast.success(`Pool ${pool} exported`);
      fetchZFSData();
    } catch (error) {
      toast.error(`Failed to export pool: ${error}`);
    }
  };

  const handleImportPool = async (pool?: string) => {
    try {
      await zfsAPI.importPool(pool);
      toast.success(pool ? `Pool ${pool} imported` : "All pools imported");
      setImportPoolOpen(false);
      fetchZFSData();
    } catch (error) {
      toast.error(`Failed to import pool: ${error}`);
    }
  };

  const handleViewPoolStatus = async (pool: string) => {
    try {
      const statusData = await zfsAPI.getPoolStatus(pool);
      setSelectedPoolStatus(statusData);
      setPoolStatusOpen(true);
    } catch (error) {
      toast.error(`Failed to get pool status: ${error}`);
    }
  };

  const handleCreateDataset = async () => {
    if (!newDataset.name) {
      toast.error("Dataset name is required (format: pool/dataset)");
      return;
    }
    setIsCreatingDataset(true);
    try {
      await zfsAPI.createDataset({
        name: newDataset.name,
        mountpoint: newDataset.mountpoint || undefined,
        compression: newDataset.compression || undefined,
        quota: newDataset.quota || undefined,
      });
      toast.success(`Dataset ${newDataset.name} created successfully`);
      setCreateDatasetOpen(false);
      setNewDataset({ name: "", mountpoint: "", compression: "lz4", quota: "" });
      fetchZFSData();
    } catch (error) {
      toast.error(`Failed to create dataset: ${error}`);
    } finally {
      setIsCreatingDataset(false);
    }
  };

  const handleDestroyDataset = async (name: string) => {
    if (!confirm(`Are you sure you want to destroy dataset "${name}"? This will DELETE ALL DATA!`)) {
      return;
    }
    try {
      await zfsAPI.destroyDataset(name, true, true);
      toast.success(`Dataset ${name} destroyed`);
      fetchZFSData();
    } catch (error) {
      toast.error(`Failed to destroy dataset: ${error}`);
    }
  };

  const handleCreateSnapshot = async () => {
    if (!newSnapshot.dataset || !newSnapshot.name) {
      toast.error("Dataset and snapshot name are required");
      return;
    }
    setIsCreatingSnapshot(true);
    try {
      await zfsAPI.createSnapshot(newSnapshot.dataset, newSnapshot.name, newSnapshot.recursive);
      toast.success(`Snapshot created successfully`);
      setCreateSnapshotOpen(false);
      setNewSnapshot({ dataset: "", name: "", recursive: false });
      fetchZFSData();
    } catch (error) {
      toast.error(`Failed to create snapshot: ${error}`);
    } finally {
      setIsCreatingSnapshot(false);
    }
  };

  const handleDeleteSnapshot = async (name: string) => {
    if (!confirm(`Delete snapshot "${name}"?`)) {
      return;
    }
    try {
      await zfsAPI.deleteSnapshot(name);
      toast.success(`Snapshot ${name} deleted`);
      fetchZFSData();
    } catch (error) {
      toast.error(`Failed to delete snapshot: ${error}`);
    }
  };

  const handleRollbackSnapshot = async (name: string) => {
    if (!confirm(`Rollback to snapshot "${name}"? This will revert the dataset to this point in time and destroy all newer snapshots!`)) {
      return;
    }
    try {
      await zfsAPI.rollbackSnapshot(name, true, false, true);
      toast.success(`Rolled back to snapshot ${name}`);
      fetchZFSData();
    } catch (error) {
      toast.error(`Failed to rollback: ${error}`);
    }
  };

  if (authLoading && !user) {
    return <PageSkeleton title="ZFS Storage" />;
  }

  if (!isAuthenticated || (user && user.role !== "admin")) {
    return <PageSkeleton title="ZFS Storage" />;
  }

  if (isLoading) {
    return <PageSkeleton title="ZFS Storage" />;
  }

  const getHealthBadge = (health: string) => {
    switch (health.toUpperCase()) {
      case "ONLINE":
        return <Badge variant="default" className="bg-green-600">ONLINE</Badge>;
      case "DEGRADED":
        return <Badge variant="default" className="bg-yellow-600">DEGRADED</Badge>;
      case "FAULTED":
        return <Badge variant="destructive">FAULTED</Badge>;
      case "OFFLINE":
        return <Badge variant="secondary">OFFLINE</Badge>;
      default:
        return <Badge variant="outline">{health}</Badge>;
    }
  };

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">ZFS Storage Management</h1>
                <p className="text-muted-foreground">
                  Manage ZFS pools, datasets, and snapshots
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>

            {/* ZFS Status Card */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Database className="h-10 w-10 text-blue-500" />
                    <div>
                      <CardTitle className="text-lg">ZFS (Zettabyte File System)</CardTitle>
                      <CardDescription>Advanced storage management with data integrity</CardDescription>
                    </div>
                  </div>
                  {status?.installed && status?.kernel_module ? (
                    <CheckCircle className="h-8 w-8 text-green-500" />
                  ) : status?.installed ? (
                    <AlertTriangle className="h-8 w-8 text-yellow-500" />
                  ) : (
                    <XCircle className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  {!status?.installed ? (
                    <Badge variant="secondary">Not Installed</Badge>
                  ) : !status?.kernel_module ? (
                    <Badge variant="outline" className="text-yellow-600 border-yellow-600">Module Not Loaded</Badge>
                  ) : (
                    <Badge variant="default" className="bg-green-600">Ready</Badge>
                  )}
                  {status?.version && (
                    <Badge variant="outline">v{status.version}</Badge>
                  )}
                  {pools.length > 0 && (
                    <Badge variant="secondary">{pools.length} pool(s)</Badge>
                  )}
                </div>

                <p className="text-sm text-muted-foreground">{status?.message}</p>

                {!status?.installed ? (
                  <div className="pt-2">
                    {status?.can_install ? (
                      <Button onClick={handleInstall} disabled={isInstalling} className="w-full">
                        {isInstalling ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Installing...
                          </>
                        ) : (
                          <>
                            <Download className="h-4 w-4 mr-2" />
                            Install {status.package_name}
                          </>
                        )}
                      </Button>
                    ) : (
                      <Alert>
                        <Shield className="h-4 w-4" />
                        <AlertTitle>Installation Required</AlertTitle>
                        <AlertDescription>
                          Run the following command as root to install:
                          <code className="block mt-2 p-2 bg-muted rounded text-xs">
                            {status?.package_manager === "apt"
                              ? `sudo apt install ${status?.package_name}`
                              : `sudo dnf install ${status?.package_name}`}
                          </code>
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                ) : !status?.kernel_module ? (
                  <div className="pt-2">
                    <Button onClick={handleLoadModule} disabled={isLoadingModule}>
                      {isLoadingModule ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Loading Module...
                        </>
                      ) : (
                        <>
                          <Package className="h-4 w-4 mr-2" />
                          Load ZFS Kernel Module
                        </>
                      )}
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {/* Installation Terminal Output */}
            {showInstallTerminal && (
              <TerminalOutput
                url="/api/zfs/install/stream"
                title="ZFS Installation"
                onComplete={handleInstallComplete}
                onClose={handleCloseTerminal}
              />
            )}

            {/* Main ZFS Management - Only show if ZFS is ready */}
            {status?.installed && status?.kernel_module && (
              <Tabs defaultValue="pools" className="space-y-4">
                <TabsList>
                  <TabsTrigger value="pools" className="gap-2">
                    <HardDrive className="h-4 w-4" />
                    Pools
                    <Badge variant="secondary" className="ml-1">{pools.length}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="datasets" className="gap-2">
                    <FolderOpen className="h-4 w-4" />
                    Datasets
                    <Badge variant="secondary" className="ml-1">{datasets.length}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="snapshots" className="gap-2">
                    <Camera className="h-4 w-4" />
                    Snapshots
                    <Badge variant="secondary" className="ml-1">{snapshots.length}</Badge>
                  </TabsTrigger>
                </TabsList>

                {/* Pools Tab */}
                <TabsContent value="pools" className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium">Storage Pools</h3>
                    <div className="flex gap-2">
                      {importablePools.length > 0 && (
                        <Button variant="outline" size="sm" onClick={() => setImportPoolOpen(true)}>
                          <Upload className="h-4 w-4 mr-2" />
                          Import Pool ({importablePools.length})
                        </Button>
                      )}
                      <Button size="sm" onClick={() => setCreatePoolOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Create Pool
                      </Button>
                    </div>
                  </div>

                  {pools.length === 0 ? (
                    <Card>
                      <CardContent className="py-8 text-center text-muted-foreground">
                        <HardDrive className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>No ZFS pools configured</p>
                        <p className="text-sm">Create a pool to get started with ZFS storage</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Size</TableHead>
                            <TableHead>Used</TableHead>
                            <TableHead>Free</TableHead>
                            <TableHead>Health</TableHead>
                            <TableHead>Fragmentation</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pools.map((pool) => (
                            <TableRow key={pool.name}>
                              <TableCell className="font-medium">{pool.name}</TableCell>
                              <TableCell>{formatBytes(pool.size)}</TableCell>
                              <TableCell>{formatBytes(pool.allocated)}</TableCell>
                              <TableCell>{formatBytes(pool.free)}</TableCell>
                              <TableCell>{getHealthBadge(pool.health)}</TableCell>
                              <TableCell>{pool.fragmentation}</TableCell>
                              <TableCell className="text-right">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm">
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => handleViewPoolStatus(pool.name)}>
                                      <Info className="h-4 w-4 mr-2" />
                                      View Status
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleScrubPool(pool.name, 'start')}>
                                      <Play className="h-4 w-4 mr-2" />
                                      Start Scrub
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleScrubPool(pool.name, 'stop')}>
                                      <Square className="h-4 w-4 mr-2" />
                                      Stop Scrub
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleExportPool(pool.name)}>
                                      <Download className="h-4 w-4 mr-2" />
                                      Export Pool
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => handleDestroyPool(pool.name)}
                                      className="text-red-600"
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      Destroy Pool
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>

                {/* Datasets Tab */}
                <TabsContent value="datasets" className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium">Datasets</h3>
                    <Button size="sm" onClick={() => setCreateDatasetOpen(true)} disabled={pools.length === 0}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Dataset
                    </Button>
                  </div>

                  {datasets.length === 0 ? (
                    <Card>
                      <CardContent className="py-8 text-center text-muted-foreground">
                        <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>No datasets found</p>
                        <p className="text-sm">Create a pool first, then add datasets</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Used</TableHead>
                            <TableHead>Available</TableHead>
                            <TableHead>Mountpoint</TableHead>
                            <TableHead>Compression</TableHead>
                            <TableHead>Quota</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {datasets.map((ds) => (
                            <TableRow key={ds.name}>
                              <TableCell className="font-medium font-mono text-sm">{ds.name}</TableCell>
                              <TableCell>{formatBytes(ds.used)}</TableCell>
                              <TableCell>{formatBytes(ds.available)}</TableCell>
                              <TableCell className="font-mono text-sm">{ds.mountpoint}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{ds.compression}</Badge>
                              </TableCell>
                              <TableCell>{ds.quota ? (typeof ds.quota === 'number' ? formatBytes(ds.quota) : ds.quota) : "-"}</TableCell>
                              <TableCell className="text-right">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm">
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => {
                                      setNewSnapshot({ dataset: ds.name, name: "", recursive: false });
                                      setCreateSnapshotOpen(true);
                                    }}>
                                      <Camera className="h-4 w-4 mr-2" />
                                      Create Snapshot
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => handleDestroyDataset(ds.name)}
                                      className="text-red-600"
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      Destroy Dataset
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>

                {/* Snapshots Tab */}
                <TabsContent value="snapshots" className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium">Snapshots</h3>
                    <Button size="sm" onClick={() => setCreateSnapshotOpen(true)} disabled={datasets.length === 0}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Snapshot
                    </Button>
                  </div>

                  {snapshots.length === 0 ? (
                    <Card>
                      <CardContent className="py-8 text-center text-muted-foreground">
                        <Camera className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>No snapshots found</p>
                        <p className="text-sm">Create snapshots to preserve point-in-time copies of your data</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Dataset</TableHead>
                            <TableHead>Used</TableHead>
                            <TableHead>Referenced</TableHead>
                            <TableHead>Created</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {snapshots.map((snap) => (
                            <TableRow key={snap.name}>
                              <TableCell className="font-medium font-mono text-sm">{snap.name}</TableCell>
                              <TableCell className="font-mono text-sm">{snap.dataset}</TableCell>
                              <TableCell>{formatBytes(snap.used)}</TableCell>
                              <TableCell>{formatBytes(snap.referenced)}</TableCell>
                              <TableCell>{snap.creation}</TableCell>
                              <TableCell className="text-right">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm">
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => handleRollbackSnapshot(snap.name)}>
                                      <RotateCcw className="h-4 w-4 mr-2" />
                                      Rollback
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => handleDeleteSnapshot(snap.name)}
                                      className="text-red-600"
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            )}

            {/* ZFS Info Section */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Info className="h-5 w-5" />
                  About ZFS
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  ZFS is an advanced filesystem and volume manager with built-in data integrity verification,
                  copy-on-write snapshots, and RAID-Z redundancy. It combines the roles of a filesystem
                  and volume manager, providing powerful features for data protection and storage efficiency.
                </p>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <h4 className="font-medium">Pools</h4>
                    <p className="text-sm text-muted-foreground">
                      Pools combine multiple disks into a single storage unit. They can use
                      striping, mirroring, or RAID-Z configurations for performance and redundancy.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium">Datasets</h4>
                    <p className="text-sm text-muted-foreground">
                      Datasets are flexible filesystem containers within a pool. They share pool
                      space and can have individual quotas, compression, and mount options.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium">Snapshots</h4>
                    <p className="text-sm text-muted-foreground">
                      Snapshots are instant, space-efficient point-in-time copies. They only use
                      space when data changes, making them ideal for backups and testing.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>

      {/* Create Pool Dialog */}
      <Dialog open={createPoolOpen} onOpenChange={setCreatePoolOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create ZFS Pool</DialogTitle>
            <DialogDescription>
              Create a new storage pool from available disks
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pool-name">Pool Name</Label>
              <Input
                id="pool-name"
                placeholder="mypool"
                value={newPool.name}
                onChange={(e) => setNewPool({ ...newPool, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vdev-type">VDEV Type</Label>
              <Select
                value={newPool.vdev_type}
                onValueChange={(value) => setNewPool({ ...newPool, vdev_type: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stripe">Stripe (no redundancy)</SelectItem>
                  <SelectItem value="mirror">Mirror (2+ disks)</SelectItem>
                  <SelectItem value="raidz1">RAID-Z1 (3+ disks, 1 parity)</SelectItem>
                  <SelectItem value="raidz2">RAID-Z2 (4+ disks, 2 parity)</SelectItem>
                  <SelectItem value="raidz3">RAID-Z3 (5+ disks, 3 parity)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Available Disks</Label>
              {availableDisks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No available disks found</p>
              ) : (
                <div className="border rounded-lg max-h-48 overflow-y-auto">
                  {availableDisks.filter(d => !d.in_use).map((disk) => (
                    <div key={disk.path} className="flex items-center gap-3 p-3 border-b last:border-b-0">
                      <Checkbox
                        id={disk.path}
                        checked={newPool.devices.includes(disk.path)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setNewPool({ ...newPool, devices: [...newPool.devices, disk.path] });
                          } else {
                            setNewPool({ ...newPool, devices: newPool.devices.filter(d => d !== disk.path) });
                          }
                        }}
                      />
                      <label htmlFor={disk.path} className="flex-1 cursor-pointer">
                        <div className="font-mono text-sm">{disk.path}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatBytes(disk.size)} - {disk.model || disk.type}
                        </div>
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="mountpoint">Mount Point (optional)</Label>
              <Input
                id="mountpoint"
                placeholder="/mnt/mypool"
                value={newPool.mountpoint}
                onChange={(e) => setNewPool({ ...newPool, mountpoint: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="force"
                checked={newPool.force}
                onCheckedChange={(checked) => setNewPool({ ...newPool, force: !!checked })}
              />
              <label htmlFor="force" className="text-sm">
                Force creation (use with caution)
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatePoolOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreatePool} disabled={isCreatingPool || newPool.devices.length === 0}>
              {isCreatingPool ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Pool"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Dataset Dialog */}
      <Dialog open={createDatasetOpen} onOpenChange={setCreateDatasetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Dataset</DialogTitle>
            <DialogDescription>
              Create a new dataset within an existing pool
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dataset-name">Dataset Name</Label>
              <Input
                id="dataset-name"
                placeholder="pool/dataset"
                value={newDataset.name}
                onChange={(e) => setNewDataset({ ...newDataset, name: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Format: poolname/datasetname (e.g., mypool/documents)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ds-mountpoint">Mount Point (optional)</Label>
              <Input
                id="ds-mountpoint"
                placeholder="/mnt/mypool/documents"
                value={newDataset.mountpoint}
                onChange={(e) => setNewDataset({ ...newDataset, mountpoint: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="compression">Compression</Label>
              <Select
                value={newDataset.compression}
                onValueChange={(value) => setNewDataset({ ...newDataset, compression: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select compression" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Off</SelectItem>
                  <SelectItem value="lz4">LZ4 (recommended)</SelectItem>
                  <SelectItem value="gzip">GZIP</SelectItem>
                  <SelectItem value="zstd">ZSTD</SelectItem>
                  <SelectItem value="lzjb">LZJB</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="quota">Quota (optional)</Label>
              <Input
                id="quota"
                placeholder="10G, 500M, etc."
                value={newDataset.quota}
                onChange={(e) => setNewDataset({ ...newDataset, quota: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDatasetOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateDataset} disabled={isCreatingDataset || !newDataset.name}>
              {isCreatingDataset ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Dataset"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Snapshot Dialog */}
      <Dialog open={createSnapshotOpen} onOpenChange={setCreateSnapshotOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Snapshot</DialogTitle>
            <DialogDescription>
              Create a point-in-time snapshot of a dataset
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="snap-dataset">Dataset</Label>
              <Select
                value={newSnapshot.dataset}
                onValueChange={(value) => setNewSnapshot({ ...newSnapshot, dataset: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select dataset" />
                </SelectTrigger>
                <SelectContent>
                  {datasets.map((ds) => (
                    <SelectItem key={ds.name} value={ds.name}>
                      {ds.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="snap-name">Snapshot Name</Label>
              <Input
                id="snap-name"
                placeholder="snap-2024-01-01"
                value={newSnapshot.name}
                onChange={(e) => setNewSnapshot({ ...newSnapshot, name: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="recursive"
                checked={newSnapshot.recursive}
                onCheckedChange={(checked) => setNewSnapshot({ ...newSnapshot, recursive: !!checked })}
              />
              <label htmlFor="recursive" className="text-sm">
                Recursive (include child datasets)
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateSnapshotOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateSnapshot} disabled={isCreatingSnapshot || !newSnapshot.dataset || !newSnapshot.name}>
              {isCreatingSnapshot ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Snapshot"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pool Status Dialog */}
      <Dialog open={poolStatusOpen} onOpenChange={setPoolStatusOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Pool Status: {selectedPoolStatus?.name}</DialogTitle>
            <DialogDescription>
              Detailed status and configuration
            </DialogDescription>
          </DialogHeader>
          {selectedPoolStatus && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">State</Label>
                  <p className="font-medium">{selectedPoolStatus.state}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <p className="font-medium">{selectedPoolStatus.status || "OK"}</p>
                </div>
              </div>
              {selectedPoolStatus.scan && (
                <div>
                  <Label className="text-muted-foreground">Last Scan</Label>
                  <p className="text-sm">{selectedPoolStatus.scan}</p>
                </div>
              )}
              {selectedPoolStatus.action && (
                <div>
                  <Label className="text-muted-foreground">Action</Label>
                  <p className="text-sm">{selectedPoolStatus.action}</p>
                </div>
              )}
              {selectedPoolStatus.config && selectedPoolStatus.config.length > 0 && (
                <div>
                  <Label className="text-muted-foreground mb-2 block">Configuration</Label>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>State</TableHead>
                          <TableHead>Read</TableHead>
                          <TableHead>Write</TableHead>
                          <TableHead>Cksum</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedPoolStatus.config.map((vdev, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-mono text-sm" style={{ paddingLeft: `${vdev.indent * 16 + 12}px` }}>
                              {vdev.name}
                            </TableCell>
                            <TableCell>{vdev.state}</TableCell>
                            <TableCell>{vdev.read}</TableCell>
                            <TableCell>{vdev.write}</TableCell>
                            <TableCell>{vdev.cksum}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
              {selectedPoolStatus.errors && selectedPoolStatus.errors !== "No known data errors" && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Errors Detected</AlertTitle>
                  <AlertDescription>{selectedPoolStatus.errors}</AlertDescription>
                </Alert>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPoolStatusOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Pool Dialog */}
      <Dialog open={importPoolOpen} onOpenChange={setImportPoolOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import ZFS Pool</DialogTitle>
            <DialogDescription>
              Import a previously exported or disconnected pool
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {importablePools.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                No importable pools found
              </p>
            ) : (
              <div className="space-y-2">
                {importablePools.map((pool) => (
                  <div key={pool.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">{pool.name}</p>
                      <p className="text-xs text-muted-foreground">ID: {pool.id} - State: {pool.state}</p>
                    </div>
                    <Button size="sm" onClick={() => handleImportPool(pool.name)}>
                      <Upload className="h-4 w-4 mr-2" />
                      Import
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportPoolOpen(false)}>
              Close
            </Button>
            <Button onClick={() => handleImportPool()} disabled={importablePools.length === 0}>
              Import All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
