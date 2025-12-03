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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { storageAPI, MountPoint, FstabEntry, DiskInfo, Partition } from "@/lib/api";
import { PageSkeleton } from "@/components/skeletons";
import { toast } from "sonner";
import {
  HardDrive,
  RefreshCw,
  Plus,
  Unplug,
  CheckCircle,
  XCircle,
  AlertTriangle,
  FolderOpen,
  FileText,
  Settings,
  Play,
} from "lucide-react";

export default function FilesystemsPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [mounts, setMounts] = useState<MountPoint[]>([]);
  const [fstab, setFstab] = useState<FstabEntry[]>([]);
  const [disks, setDisks] = useState<DiskInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [mountDialog, setMountDialog] = useState({ open: false });
  const [mountOptions, setMountOptions] = useState({
    device: "",
    mount_point: "",
    fstype: "auto",
    options: "defaults",
    persistent: false,
  });
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

  const fetchData = async () => {
    try {
      const [mountData, fstabData, diskData] = await Promise.all([
        storageAPI.getMounts(),
        storageAPI.getFstab(),
        storageAPI.getDisks(),
      ]);
      setMounts(mountData);
      setFstab(fstabData);
      setDisks(diskData);
    } catch (error) {
      console.error("Failed to fetch filesystem data:", error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && user?.role === "admin") {
      fetchData();
    }
  }, [isAuthenticated, user]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchData();
  };

  const handleMount = async () => {
    setIsMounting(true);
    try {
      await storageAPI.mount({
        device: mountOptions.device,
        mount_point: mountOptions.mount_point,
        fstype: mountOptions.fstype !== "auto" ? mountOptions.fstype : undefined,
        options: mountOptions.options || undefined,
        persistent: mountOptions.persistent,
      });
      toast.success("Filesystem mounted successfully");
      setMountDialog({ open: false });
      fetchData();
    } catch (error) {
      toast.error(`Failed to mount: ${error}`);
    } finally {
      setIsMounting(false);
    }
  };

  const handleUnmount = async (path: string, force: boolean = false) => {
    if (!confirm(`Unmount ${path}?`)) return;

    try {
      await storageAPI.unmount(path, force);
      toast.success("Filesystem unmounted");
      fetchData();
    } catch (error) {
      toast.error(`Failed to unmount: ${error}`);
    }
  };

  // Get available partitions for mounting
  const availablePartitions: Partition[] = [];
  disks.forEach(disk => {
    disk.partitions.forEach(part => {
      if (!part.mounted && part.fstype) {
        availablePartitions.push(part);
      }
    });
  });

  // Filter out pseudo-filesystems
  const realMounts = mounts.filter(m =>
    !m.mount_path.startsWith('/sys') &&
    !m.mount_path.startsWith('/proc') &&
    !m.mount_path.startsWith('/run') &&
    !m.mount_path.startsWith('/dev/shm') &&
    m.fstype !== 'tmpfs' &&
    m.fstype !== 'devtmpfs' &&
    m.fstype !== 'overlay' &&
    m.fstype !== 'cgroup2'
  );

  const getUsageColor = (percent: number) => {
    if (percent >= 90) return "text-red-600";
    if (percent >= 80) return "text-yellow-600";
    return "text-green-600";
  };

  // Show skeleton during initial auth check (only if no cached user)
  if (authLoading && !user) {
    return <PageSkeleton title="Filesystem Management" />;
  }

  // Not authenticated or not admin - will redirect, show skeleton in meantime
  if (!isAuthenticated || (user && user.role !== "admin")) {
    return <PageSkeleton title="Filesystem Management" />;
  }

  // Data loading - show skeleton
  if (isLoading) {
    return <PageSkeleton title="Filesystem Management" />;
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Filesystem Management" />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Filesystem Management</h2>
                <p className="text-muted-foreground">Manage mounted filesystems and fstab entries</p>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleRefresh} disabled={isRefreshing} variant="outline">
                  <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
                <Button onClick={() => {
                  setMountDialog({ open: true });
                  setMountOptions({
                    device: "",
                    mount_point: "",
                    fstype: "auto",
                    options: "defaults",
                    persistent: false,
                  });
                }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Mount
                </Button>
              </div>
            </div>

            {/* Summary */}
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Mounted Filesystems</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{realMounts.length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Fstab Entries</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{fstab.length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Available Partitions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{availablePartitions.length}</div>
                  <p className="text-xs text-muted-foreground">unmounted, formatted</p>
                </CardContent>
              </Card>
            </div>

            {/* Mounted Filesystems */}
            <Card>
              <CardHeader>
                <CardTitle>Mounted Filesystems</CardTitle>
                <CardDescription>Currently mounted storage volumes</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Device</TableHead>
                      <TableHead>Mount Point</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Used</TableHead>
                      <TableHead>Available</TableHead>
                      <TableHead>Usage</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {realMounts.map((mount, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-mono text-sm">{mount.device}</TableCell>
                        <TableCell className="font-medium">{mount.mount_path}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{mount.fstype}</Badge>
                        </TableCell>
                        <TableCell>{mount.total_human}</TableCell>
                        <TableCell>{mount.used_human}</TableCell>
                        <TableCell>{mount.available_human}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={mount.used_percent} className="w-16 h-2" />
                            <span className={`text-sm font-medium ${getUsageColor(mount.used_percent)}`}>
                              {mount.used_percent.toFixed(1)}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {mount.mount_path !== "/" && mount.mount_path !== "/boot" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleUnmount(mount.mount_path)}
                            >
                              <Unplug className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Fstab Entries */}
            <Card>
              <CardHeader>
                <CardTitle>Fstab Configuration</CardTitle>
                <CardDescription>/etc/fstab entries for persistent mounts</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Device</TableHead>
                      <TableHead>Mount Point</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Options</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fstab.map((entry, index) => (
                      <TableRow key={index} className={entry.has_error ? "bg-red-50" : ""}>
                        <TableCell className="font-mono text-sm">{entry.device}</TableCell>
                        <TableCell>{entry.mount_point}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{entry.fstype}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                          {entry.options}
                        </TableCell>
                        <TableCell>
                          {entry.has_error ? (
                            <div className="flex items-center gap-1 text-red-600">
                              <XCircle className="h-4 w-4" />
                              <span className="text-sm">{entry.error_msg || "Error"}</span>
                            </div>
                          ) : entry.is_mounted ? (
                            <div className="flex items-center gap-1 text-green-600">
                              <CheckCircle className="h-4 w-4" />
                              <span className="text-sm">Mounted</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <AlertTriangle className="h-4 w-4" />
                              <span className="text-sm">Not Mounted</span>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Available Partitions */}
            {availablePartitions.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Available Partitions</CardTitle>
                  <CardDescription>Unmounted partitions ready to be mounted</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {availablePartitions.map((part) => (
                      <div key={part.path} className="p-3 rounded-lg border flex items-center justify-between">
                        <div>
                          <p className="font-mono font-medium">{part.path}</p>
                          <p className="text-sm text-muted-foreground">
                            {part.size_human} • {part.fstype}
                            {part.label && ` • ${part.label}`}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setMountOptions({
                              device: part.path,
                              mount_point: `/mnt/${part.name}`,
                              fstype: part.fstype || "auto",
                              options: "defaults",
                              persistent: false,
                            });
                            setMountDialog({ open: true });
                          }}
                        >
                          <Play className="h-4 w-4 mr-1" />
                          Mount
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </main>
      </div>

      {/* Mount Dialog */}
      <Dialog open={mountDialog.open} onOpenChange={(open) => setMountDialog({ open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mount Filesystem</DialogTitle>
            <DialogDescription>
              Mount a device to a directory
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Device</Label>
              <Input
                value={mountOptions.device}
                onChange={(e) => setMountOptions({ ...mountOptions, device: e.target.value })}
                placeholder="/dev/sda1"
              />
            </div>
            <div className="space-y-2">
              <Label>Mount Point</Label>
              <Input
                value={mountOptions.mount_point}
                onChange={(e) => setMountOptions({ ...mountOptions, mount_point: e.target.value })}
                placeholder="/mnt/data"
              />
            </div>
            <div className="space-y-2">
              <Label>Filesystem Type</Label>
              <Select
                value={mountOptions.fstype}
                onValueChange={(value) => setMountOptions({ ...mountOptions, fstype: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto-detect</SelectItem>
                  <SelectItem value="ext4">ext4</SelectItem>
                  <SelectItem value="xfs">XFS</SelectItem>
                  <SelectItem value="btrfs">Btrfs</SelectItem>
                  <SelectItem value="ntfs">NTFS</SelectItem>
                  <SelectItem value="vfat">FAT32</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Mount Options</Label>
              <Input
                value={mountOptions.options}
                onChange={(e) => setMountOptions({ ...mountOptions, options: e.target.value })}
                placeholder="defaults"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="persistent"
                checked={mountOptions.persistent}
                onChange={(e) => setMountOptions({ ...mountOptions, persistent: e.target.checked })}
              />
              <Label htmlFor="persistent">Add to fstab (persistent)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMountDialog({ open: false })}>
              Cancel
            </Button>
            <Button onClick={handleMount} disabled={isMounting || !mountOptions.device || !mountOptions.mount_point}>
              {isMounting ? "Mounting..." : "Mount"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
