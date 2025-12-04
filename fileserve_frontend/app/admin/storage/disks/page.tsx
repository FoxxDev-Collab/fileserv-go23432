"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useAuth } from "@/lib/auth-context";
import { storageAPI, DiskInfo, Partition } from "@/lib/api";
import { PageSkeleton } from "@/components/skeletons";
import { toast } from "sonner";
import {
  HardDrive,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Plus,
  Trash2,
  Database,
  Cpu,
  Thermometer,
  Zap,
  RotateCcw,
  Play,
  CircleStop,
  Table2,
} from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";

export default function DisksPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [disks, setDisks] = useState<DiskInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedDisks, setExpandedDisks] = useState<Set<string>>(new Set());
  const [formatDialog, setFormatDialog] = useState<{ open: boolean; partition?: Partition }>({ open: false });
  const [formatOptions, setFormatOptions] = useState({ fstype: "ext4", label: "", force: false });
  const [isFormatting, setIsFormatting] = useState(false);

  // Initialize disk (create partition table) dialog
  const [initDiskDialog, setInitDiskDialog] = useState<{ open: boolean; disk?: DiskInfo }>({ open: false });
  const [initDiskOptions, setInitDiskOptions] = useState({ tableType: "gpt" as "gpt" | "msdos" });
  const [isInitializing, setIsInitializing] = useState(false);

  // Create partition dialog
  const [createPartDialog, setCreatePartDialog] = useState<{ open: boolean; disk?: DiskInfo }>({ open: false });
  const [createPartOptions, setCreatePartOptions] = useState({ start: "0%", end: "100%", fstype: "", label: "" });
  const [isCreatingPart, setIsCreatingPart] = useState(false);

  // Delete partition state
  const [deletePartDialog, setDeletePartDialog] = useState<{ open: boolean; partition?: Partition }>({ open: false });
  const [isDeleting, setIsDeleting] = useState(false);

  // Mount/unmount state
  const [mountDialog, setMountDialog] = useState<{ open: boolean; partition?: Partition }>({ open: false });
  const [mountOptions, setMountOptions] = useState({ mountPoint: "", persistent: false });
  const [isMounting, setIsMounting] = useState(false);

  useEffect(() => {
    if (!authLoading) {
      if (!isAuthenticated) {
        router.replace("/");
      } else if (user && user.role !== "admin") {
        router.replace("/dashboard");
      }
    }
  }, [authLoading, isAuthenticated, user, router]);

  const fetchDisks = async () => {
    try {
      const data = await storageAPI.getDisks();
      setDisks(data);
      // Expand first disk by default
      if (data.length > 0 && expandedDisks.size === 0) {
        setExpandedDisks(new Set([data[0].name]));
      }
    } catch (error) {
      console.error("Failed to fetch disks:", error);
      toast.error("Failed to fetch disk information");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && user?.role === "admin") {
      fetchDisks();
    }
  }, [isAuthenticated, user]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchDisks();
  };

  const toggleDisk = (name: string) => {
    const newExpanded = new Set(expandedDisks);
    if (newExpanded.has(name)) {
      newExpanded.delete(name);
    } else {
      newExpanded.add(name);
    }
    setExpandedDisks(newExpanded);
  };

  const handleFormat = async () => {
    if (!formatDialog.partition) return;

    setIsFormatting(true);
    try {
      await storageAPI.formatPartition({
        device: formatDialog.partition.path,
        fstype: formatOptions.fstype,
        label: formatOptions.label || undefined,
        force: formatOptions.force,
      });
      toast.success("Partition formatted successfully");
      setFormatDialog({ open: false });
      fetchDisks();
    } catch (error) {
      toast.error(`Failed to format partition: ${error}`);
    } finally {
      setIsFormatting(false);
    }
  };

  const handleInitializeDisk = async () => {
    if (!initDiskDialog.disk) return;

    setIsInitializing(true);
    try {
      await storageAPI.createPartitionTable({
        disk: initDiskDialog.disk.path,
        table_type: initDiskOptions.tableType,
      });
      toast.success(`Disk initialized with ${initDiskOptions.tableType.toUpperCase()} partition table`);
      setInitDiskDialog({ open: false });
      fetchDisks();
    } catch (error) {
      toast.error(`Failed to initialize disk: ${error}`);
    } finally {
      setIsInitializing(false);
    }
  };

  const handleCreatePartition = async () => {
    if (!createPartDialog.disk) return;

    setIsCreatingPart(true);
    try {
      await storageAPI.createPartition({
        disk: createPartDialog.disk.path,
        start: createPartOptions.start,
        end: createPartOptions.end,
        fstype: createPartOptions.fstype || undefined,
        label: createPartOptions.label || undefined,
      });
      toast.success("Partition created successfully");
      setCreatePartDialog({ open: false });
      setCreatePartOptions({ start: "0%", end: "100%", fstype: "", label: "" });
      fetchDisks();
    } catch (error) {
      toast.error(`Failed to create partition: ${error}`);
    } finally {
      setIsCreatingPart(false);
    }
  };

  const handleDeletePartition = async () => {
    if (!deletePartDialog.partition) return;

    setIsDeleting(true);
    try {
      await storageAPI.deletePartition(deletePartDialog.partition.path);
      toast.success("Partition deleted successfully");
      setDeletePartDialog({ open: false });
      fetchDisks();
    } catch (error) {
      toast.error(`Failed to delete partition: ${error}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleMount = async () => {
    if (!mountDialog.partition) return;

    setIsMounting(true);
    try {
      await storageAPI.mount({
        device: mountDialog.partition.path,
        mount_point: mountOptions.mountPoint,
        fstype: mountDialog.partition.fstype,
        persistent: mountOptions.persistent,
      });
      toast.success(`Mounted at ${mountOptions.mountPoint}`);
      setMountDialog({ open: false });
      setMountOptions({ mountPoint: "", persistent: false });
      fetchDisks();
    } catch (error) {
      toast.error(`Failed to mount: ${error}`);
    } finally {
      setIsMounting(false);
    }
  };

  const handleUnmount = async (partition: Partition) => {
    try {
      await storageAPI.unmount(partition.mountpoint, false);
      toast.success("Unmounted successfully");
      fetchDisks();
    } catch (error) {
      toast.error(`Failed to unmount: ${error}`);
    }
  };

  const getDiskTypeIcon = (type: string) => {
    switch (type) {
      case "nvme":
        return <Zap className="h-5 w-5 text-purple-500" />;
      case "ssd":
        return <Cpu className="h-5 w-5 text-blue-500" />;
      case "hdd":
        return <RotateCcw className="h-5 w-5 text-gray-500" />;
      default:
        return <HardDrive className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getDiskTypeBadge = (type: string) => {
    switch (type) {
      case "nvme":
        return <Badge className="bg-purple-500">NVMe</Badge>;
      case "ssd":
        return <Badge className="bg-blue-500">SSD</Badge>;
      case "hdd":
        return <Badge variant="secondary">HDD</Badge>;
      case "virtual":
        return <Badge variant="outline">Virtual</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  const getHealthBadge = (smart?: { healthy: boolean; overall_status: string }) => {
    if (!smart) return <Badge variant="outline">Unknown</Badge>;
    if (smart.healthy) {
      return <Badge className="bg-green-500">Healthy</Badge>;
    }
    return <Badge variant="destructive">{smart.overall_status}</Badge>;
  };

  // Show skeleton during initial auth check (only if no cached user)
  if (authLoading && !user) {
    return <PageSkeleton title="Disk Management" />;
  }

  // Not authenticated or not admin - will redirect, show skeleton in meantime
  if (!isAuthenticated || (user && user.role !== "admin")) {
    return <PageSkeleton title="Disk Management" />;
  }

  // Data loading - show skeleton
  if (isLoading) {
    return <PageSkeleton title="Disk Management" />;
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Disk Management" />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Disks & Partitions</h2>
                <p className="text-muted-foreground">Manage physical disks and partition layouts</p>
              </div>
              <Button onClick={handleRefresh} disabled={isRefreshing} variant="outline">
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>

            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Total Disks</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{disks.length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Total Partitions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {disks.reduce((acc, disk) => acc + disk.partitions.length, 0)}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Total Capacity</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {disks.reduce((acc, disk) => acc + disk.size, 0) > 0
                      ? disks.find(d => d.size_human)?.size_human || "0 B"
                      : "0 B"}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Health Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    {disks.every(d => !d.smart || d.smart.healthy) ? (
                      <>
                        <CheckCircle className="h-5 w-5 text-green-500" />
                        <span className="font-medium text-green-600">All Healthy</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="h-5 w-5 text-yellow-500" />
                        <span className="font-medium text-yellow-600">Issues Detected</span>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Disk List */}
            <div className="space-y-4">
              {disks.map((disk) => (
                <Card key={disk.name}>
                  <Collapsible
                    open={expandedDisks.has(disk.name)}
                    onOpenChange={() => toggleDisk(disk.name)}
                  >
                    <CollapsibleTrigger asChild>
                      <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            {expandedDisks.has(disk.name) ? (
                              <ChevronDown className="h-5 w-5" />
                            ) : (
                              <ChevronRight className="h-5 w-5" />
                            )}
                            {getDiskTypeIcon(disk.type)}
                            <div>
                              <CardTitle className="text-lg flex items-center gap-2">
                                {disk.path}
                                {getDiskTypeBadge(disk.type)}
                                {getHealthBadge(disk.smart)}
                              </CardTitle>
                              <CardDescription>
                                {disk.model || "Unknown Model"} • {disk.size_human} •{" "}
                                {disk.partitions.length} partition(s)
                              </CardDescription>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            {disk.temperature && (
                              <div className="flex items-center gap-1">
                                <Thermometer className="h-4 w-4" />
                                <span>{disk.temperature}°C</span>
                              </div>
                            )}
                            {disk.serial && (
                              <span className="font-mono text-xs">{disk.serial}</span>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent>
                        {/* SMART Info */}
                        {disk.smart && (
                          <div className="mb-4 p-3 rounded-lg bg-muted/50">
                            <h4 className="font-medium mb-2 flex items-center gap-2">
                              <Database className="h-4 w-4" />
                              SMART Status
                            </h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div>
                                <span className="text-muted-foreground">Status:</span>{" "}
                                <span className={disk.smart.healthy ? "text-green-600" : "text-red-600"}>
                                  {disk.smart.overall_status}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Power On:</span>{" "}
                                {disk.smart.power_on_hours.toLocaleString()}h
                              </div>
                              <div>
                                <span className="text-muted-foreground">Power Cycles:</span>{" "}
                                {disk.smart.power_cycles.toLocaleString()}
                              </div>
                              <div>
                                <span className="text-muted-foreground">Temperature:</span>{" "}
                                {disk.smart.temperature}°C
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Partitions Section */}
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="font-medium">Partitions</h4>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setInitDiskDialog({ open: true, disk });
                                setInitDiskOptions({ tableType: "gpt" });
                              }}
                            >
                              <Table2 className="h-4 w-4 mr-1" />
                              New Table
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setCreatePartDialog({ open: true, disk });
                                setCreatePartOptions({ start: "0%", end: "100%", fstype: "", label: "" });
                              }}
                            >
                              <Plus className="h-4 w-4 mr-1" />
                              Create Partition
                            </Button>
                          </div>
                        </div>

                        {disk.partitions.length > 0 ? (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Partition</TableHead>
                                <TableHead>Size</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Filesystem</TableHead>
                                <TableHead>Mount Point</TableHead>
                                <TableHead>Label</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {disk.partitions.map((partition) => (
                                <TableRow key={partition.name}>
                                  <TableCell className="font-mono">{partition.path}</TableCell>
                                  <TableCell>{partition.size_human}</TableCell>
                                  <TableCell>
                                    <Badge variant="outline">{partition.type}</Badge>
                                  </TableCell>
                                  <TableCell>
                                    {partition.fstype ? (
                                      <Badge variant="secondary">{partition.fstype}</Badge>
                                    ) : (
                                      <span className="text-muted-foreground">Unformatted</span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {partition.mounted ? (
                                      <span className="text-green-600">{partition.mountpoint}</span>
                                    ) : (
                                      <span className="text-muted-foreground">Not mounted</span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {partition.label || (
                                      <span className="text-muted-foreground">-</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <div className="flex justify-end gap-2">
                                      {/* Mount/Unmount buttons */}
                                      {partition.mounted ? (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => handleUnmount(partition)}
                                        >
                                          <CircleStop className="h-4 w-4 mr-1" />
                                          Unmount
                                        </Button>
                                      ) : partition.fstype ? (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => {
                                            setMountDialog({ open: true, partition });
                                            setMountOptions({ mountPoint: `/mnt/${partition.name}`, persistent: false });
                                          }}
                                        >
                                          <Play className="h-4 w-4 mr-1" />
                                          Mount
                                        </Button>
                                      ) : null}

                                      {/* Format button (only if not mounted) */}
                                      {!partition.mounted && (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => {
                                            setFormatDialog({ open: true, partition });
                                            setFormatOptions({ fstype: "ext4", label: "", force: false });
                                          }}
                                        >
                                          <Database className="h-4 w-4 mr-1" />
                                          Format
                                        </Button>
                                      )}

                                      {/* Delete button (only if not mounted) */}
                                      {!partition.mounted && (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                          onClick={() => setDeletePartDialog({ open: true, partition })}
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      )}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        ) : (
                          <div className="text-center py-8 text-muted-foreground">
                            <HardDrive className="h-12 w-12 mx-auto mb-2 opacity-50" />
                            <p>No partitions found on this disk</p>
                            <p className="text-sm">This disk appears to be unpartitioned</p>
                            <Button
                              variant="outline"
                              className="mt-4"
                              onClick={() => {
                                setInitDiskDialog({ open: true, disk });
                                setInitDiskOptions({ tableType: "gpt" });
                              }}
                            >
                              <Table2 className="h-4 w-4 mr-2" />
                              Initialize Disk
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
              ))}

              {disks.length === 0 && (
                <Card>
                  <CardContent className="py-12 text-center">
                    <HardDrive className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <h3 className="text-lg font-medium">No Disks Found</h3>
                    <p className="text-muted-foreground">
                      Unable to detect any storage devices on this system
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Format Dialog */}
      <Dialog open={formatDialog.open} onOpenChange={(open) => setFormatDialog({ ...formatDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Format Partition</DialogTitle>
            <DialogDescription>
              Format {formatDialog.partition?.path} with a new filesystem.
              <span className="text-red-500 block mt-2">
                Warning: This will erase all data on the partition!
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Filesystem Type</Label>
              <Select
                value={formatOptions.fstype}
                onValueChange={(value) => setFormatOptions({ ...formatOptions, fstype: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ext4">ext4 (Recommended)</SelectItem>
                  <SelectItem value="xfs">XFS</SelectItem>
                  <SelectItem value="btrfs">Btrfs</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Volume Label (optional)</Label>
              <Input
                value={formatOptions.label}
                onChange={(e) => setFormatOptions({ ...formatOptions, label: e.target.value })}
                placeholder="e.g., DATA"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="force"
                checked={formatOptions.force}
                onChange={(e) => setFormatOptions({ ...formatOptions, force: e.target.checked })}
              />
              <Label htmlFor="force">Force format (skip safety checks)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormatDialog({ open: false })}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleFormat} disabled={isFormatting}>
              {isFormatting ? "Formatting..." : "Format Partition"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Initialize Disk Dialog */}
      <Dialog open={initDiskDialog.open} onOpenChange={(open) => setInitDiskDialog({ ...initDiskDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Initialize Disk</DialogTitle>
            <DialogDescription>
              Create a new partition table on {initDiskDialog.disk?.path}.
              <span className="text-red-500 block mt-2">
                Warning: This will erase all existing partitions and data!
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Partition Table Type</Label>
              <Select
                value={initDiskOptions.tableType}
                onValueChange={(value: "gpt" | "msdos") => setInitDiskOptions({ tableType: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt">GPT (Recommended for disks &gt; 2TB)</SelectItem>
                  <SelectItem value="msdos">MBR/MS-DOS (Legacy, max 2TB)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="p-3 bg-muted rounded-lg text-sm">
              <p><strong>GPT</strong>: Modern partition table, supports large disks, more partitions.</p>
              <p className="mt-1"><strong>MBR</strong>: Legacy format, required for older systems and BIOS boot.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInitDiskDialog({ open: false })}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleInitializeDisk} disabled={isInitializing}>
              {isInitializing ? "Initializing..." : "Initialize Disk"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Partition Dialog */}
      <Dialog open={createPartDialog.open} onOpenChange={(open) => setCreatePartDialog({ ...createPartDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Partition</DialogTitle>
            <DialogDescription>
              Create a new partition on {createPartDialog.disk?.path} ({createPartDialog.disk?.size_human}).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Quick fill button */}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setCreatePartOptions({ ...createPartOptions, start: "0%", end: "100%" })}
              >
                Use Entire Disk
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCreatePartOptions({ ...createPartOptions, start: "0%", end: "50%" })}
              >
                First Half
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCreatePartOptions({ ...createPartOptions, start: "50%", end: "100%" })}
              >
                Second Half
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Position</Label>
                <Input
                  value={createPartOptions.start}
                  onChange={(e) => setCreatePartOptions({ ...createPartOptions, start: e.target.value })}
                  placeholder="0%"
                />
                <p className="text-xs text-muted-foreground">Where partition begins (0% = start of disk)</p>
              </div>
              <div className="space-y-2">
                <Label>End Position</Label>
                <Input
                  value={createPartOptions.end}
                  onChange={(e) => setCreatePartOptions({ ...createPartOptions, end: e.target.value })}
                  placeholder="100%"
                />
                <p className="text-xs text-muted-foreground">Where partition ends (100% = end of disk)</p>
              </div>
            </div>

            <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg text-sm text-blue-800 dark:text-blue-200">
              <strong>Tip:</strong> For a single partition using the whole disk, use Start: 0% and End: 100%
            </div>

            <div className="space-y-2">
              <Label>Volume Label (optional)</Label>
              <Input
                value={createPartOptions.label}
                onChange={(e) => setCreatePartOptions({ ...createPartOptions, label: e.target.value })}
                placeholder="e.g., DATA"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatePartDialog({ open: false })}>
              Cancel
            </Button>
            <Button onClick={handleCreatePartition} disabled={isCreatingPart}>
              {isCreatingPart ? "Creating..." : "Create Partition"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Partition Confirmation */}
      <AlertDialog open={deletePartDialog.open} onOpenChange={(open) => setDeletePartDialog({ ...deletePartDialog, open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Partition</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {deletePartDialog.partition?.path}?
              <span className="text-red-500 block mt-2">
                This action cannot be undone and all data will be lost!
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePartition}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? "Deleting..." : "Delete Partition"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mount Dialog */}
      <Dialog open={mountDialog.open} onOpenChange={(open) => setMountDialog({ ...mountDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mount Partition</DialogTitle>
            <DialogDescription>
              Mount {mountDialog.partition?.path} ({mountDialog.partition?.fstype}) to a directory.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Mount Point</Label>
              <Input
                value={mountOptions.mountPoint}
                onChange={(e) => setMountOptions({ ...mountOptions, mountPoint: e.target.value })}
                placeholder="/mnt/data"
              />
              <p className="text-xs text-muted-foreground">Directory will be created if it does not exist</p>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="persistent"
                checked={mountOptions.persistent}
                onCheckedChange={(checked) => setMountOptions({ ...mountOptions, persistent: checked as boolean })}
              />
              <Label htmlFor="persistent" className="cursor-pointer">
                Make persistent (add to /etc/fstab)
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMountDialog({ open: false })}>
              Cancel
            </Button>
            <Button onClick={handleMount} disabled={isMounting || !mountOptions.mountPoint}>
              {isMounting ? "Mounting..." : "Mount"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
