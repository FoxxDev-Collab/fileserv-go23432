"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
import { storageAPI, VolumeGroup, RAIDArray, ZFSPool } from "@/lib/api";
import { PageSkeleton } from "@/components/skeletons";
import { toast } from "sonner";
import {
  Layers,
  RefreshCw,
  Plus,
  Trash2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Database,
  HardDrive,
  Server,
  Maximize2,
  Shield,
  Box,
} from "lucide-react";

export default function VolumesPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [volumeGroups, setVolumeGroups] = useState<VolumeGroup[]>([]);
  const [raidArrays, setRaidArrays] = useState<RAIDArray[]>([]);
  const [zfsPools, setZfsPools] = useState<ZFSPool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [createLVDialog, setCreateLVDialog] = useState<{ open: boolean; vgName?: string }>({ open: false });
  const [lvOptions, setLvOptions] = useState({ name: "", size: "", fstype: "ext4", mount: "" });
  const [isCreating, setIsCreating] = useState(false);

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
      const [vgs, raids, zfs] = await Promise.all([
        storageAPI.getVolumeGroups(),
        storageAPI.getRAIDArrays(),
        storageAPI.getZFSPools(),
      ]);
      setVolumeGroups(vgs);
      setRaidArrays(raids);
      setZfsPools(zfs);
    } catch (error) {
      console.error("Failed to fetch volume data:", error);
      toast.error("Failed to fetch volume information");
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

  const handleCreateLV = async () => {
    if (!createLVDialog.vgName) return;

    setIsCreating(true);
    try {
      await storageAPI.createLogicalVolume({
        name: lvOptions.name,
        vg_name: createLVDialog.vgName,
        size: lvOptions.size,
        fstype: lvOptions.fstype || undefined,
        mount: lvOptions.mount || undefined,
      });
      toast.success("Logical volume created successfully");
      setCreateLVDialog({ open: false });
      setLvOptions({ name: "", size: "", fstype: "ext4", mount: "" });
      fetchData();
    } catch (error) {
      toast.error(`Failed to create logical volume: ${error}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteLV = async (vgName: string, lvName: string) => {
    if (!confirm(`Are you sure you want to delete logical volume ${lvName}? This action cannot be undone.`)) {
      return;
    }

    try {
      await storageAPI.deleteLogicalVolume(vgName, lvName, false);
      toast.success("Logical volume deleted");
      fetchData();
    } catch (error) {
      toast.error(`Failed to delete logical volume: ${error}`);
    }
  };

  const getRaidStateBadge = (state: string) => {
    switch (state) {
      case "active":
        return <Badge className="bg-green-500">Active</Badge>;
      case "degraded":
        return <Badge variant="destructive">Degraded</Badge>;
      case "rebuilding":
        return <Badge className="bg-yellow-500">Rebuilding</Badge>;
      default:
        return <Badge variant="secondary">{state}</Badge>;
    }
  };

  const getZfsHealthBadge = (health: string) => {
    switch (health) {
      case "ONLINE":
        return <Badge className="bg-green-500">Online</Badge>;
      case "DEGRADED":
        return <Badge variant="destructive">Degraded</Badge>;
      case "FAULTED":
        return <Badge variant="destructive">Faulted</Badge>;
      default:
        return <Badge variant="secondary">{health}</Badge>;
    }
  };

  // Show skeleton during initial auth check (only if no cached user)
  if (authLoading && !user) {
    return <PageSkeleton title="Volume Management" />;
  }

  // Not authenticated or not admin - will redirect, show skeleton in meantime
  if (!isAuthenticated || (user && user.role !== "admin")) {
    return <PageSkeleton title="Volume Management" />;
  }

  // Data loading - show skeleton
  if (isLoading) {
    return <PageSkeleton title="Volume Management" />;
  }

  const hasLVM = volumeGroups.length > 0;
  const hasRAID = raidArrays.length > 0;
  const hasZFS = zfsPools.length > 0;

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Volume Management" />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Volume Management</h2>
                <p className="text-muted-foreground">Manage LVM, RAID, and ZFS storage</p>
              </div>
              <Button onClick={handleRefresh} disabled={isRefreshing} variant="outline">
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>

            {/* Summary */}
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Layers className="h-4 w-4" />
                    LVM Volume Groups
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{volumeGroups.length}</div>
                  <p className="text-xs text-muted-foreground">
                    {volumeGroups.reduce((acc, vg) => acc + vg.lv_count, 0)} logical volumes
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    RAID Arrays
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{raidArrays.length}</div>
                  <p className="text-xs text-muted-foreground">
                    {raidArrays.filter(r => r.state === "active").length} active
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Database className="h-4 w-4" />
                    ZFS Pools
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{zfsPools.length}</div>
                  <p className="text-xs text-muted-foreground">
                    {zfsPools.filter(p => p.health === "ONLINE").length} online
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Tabs for different volume types */}
            <Tabs defaultValue={hasLVM ? "lvm" : hasRAID ? "raid" : "zfs"}>
              <TabsList>
                <TabsTrigger value="lvm" className="gap-2">
                  <Layers className="h-4 w-4" />
                  LVM ({volumeGroups.length})
                </TabsTrigger>
                <TabsTrigger value="raid" className="gap-2">
                  <Shield className="h-4 w-4" />
                  RAID ({raidArrays.length})
                </TabsTrigger>
                <TabsTrigger value="zfs" className="gap-2">
                  <Database className="h-4 w-4" />
                  ZFS ({zfsPools.length})
                </TabsTrigger>
              </TabsList>

              {/* LVM Tab */}
              <TabsContent value="lvm" className="space-y-4">
                {volumeGroups.length > 0 ? (
                  volumeGroups.map((vg) => (
                    <Card key={vg.name}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="flex items-center gap-2">
                              <Box className="h-5 w-5" />
                              {vg.name}
                            </CardTitle>
                            <CardDescription>
                              {vg.size_human} total • {vg.free_human} free • {vg.pv_count} PV(s)
                            </CardDescription>
                          </div>
                          <Button
                            onClick={() => {
                              setCreateLVDialog({ open: true, vgName: vg.name });
                              setLvOptions({ name: "", size: "", fstype: "ext4", mount: "" });
                            }}
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Create LV
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="mb-4">
                          <div className="flex justify-between text-sm mb-1">
                            <span>Usage</span>
                            <span>{((vg.size - vg.free) / vg.size * 100).toFixed(1)}%</span>
                          </div>
                          <Progress value={((vg.size - vg.free) / vg.size) * 100} />
                        </div>

                        {vg.logical_volumes.length > 0 ? (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Logical Volume</TableHead>
                                <TableHead>Size</TableHead>
                                <TableHead>Attributes</TableHead>
                                <TableHead>Mount Point</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {vg.logical_volumes.map((lv) => (
                                <TableRow key={lv.name}>
                                  <TableCell className="font-mono">{lv.path}</TableCell>
                                  <TableCell>{lv.size_human}</TableCell>
                                  <TableCell>
                                    <code className="text-xs bg-muted px-1 rounded">{lv.attributes}</code>
                                  </TableCell>
                                  <TableCell>
                                    {lv.mountpoint || <span className="text-muted-foreground">-</span>}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <div className="flex justify-end gap-2">
                                      <Button variant="outline" size="sm">
                                        <Maximize2 className="h-4 w-4 mr-1" />
                                        Resize
                                      </Button>
                                      <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => handleDeleteLV(vg.name, lv.name)}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        ) : (
                          <p className="text-center py-4 text-muted-foreground">
                            No logical volumes in this volume group
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <Layers className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                      <h3 className="text-lg font-medium">No LVM Volume Groups</h3>
                      <p className="text-muted-foreground">
                        LVM is not configured on this system
                      </p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* RAID Tab */}
              <TabsContent value="raid" className="space-y-4">
                {raidArrays.length > 0 ? (
                  raidArrays.map((raid) => (
                    <Card key={raid.name}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="flex items-center gap-2">
                              <Shield className="h-5 w-5" />
                              {raid.path}
                              {getRaidStateBadge(raid.state)}
                              <Badge variant="outline">{raid.level.toUpperCase()}</Badge>
                            </CardTitle>
                            <CardDescription>
                              {raid.size_human} • {raid.active_devices}/{raid.devices} devices active
                              {raid.spare_devices > 0 && ` • ${raid.spare_devices} spare(s)`}
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {raid.sync_percent !== undefined && raid.sync_percent < 100 && (
                          <div className="mb-4">
                            <div className="flex justify-between text-sm mb-1">
                              <span>Sync Progress</span>
                              <span>{raid.sync_percent.toFixed(1)}%</span>
                            </div>
                            <Progress value={raid.sync_percent} />
                            {raid.sync_speed && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Speed: {raid.sync_speed}
                              </p>
                            )}
                          </div>
                        )}

                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Device</TableHead>
                              <TableHead>Role</TableHead>
                              <TableHead>State</TableHead>
                              <TableHead>Slot</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {raid.members.map((member, index) => (
                              <TableRow key={index}>
                                <TableCell className="font-mono">{member.device}</TableCell>
                                <TableCell>
                                  <Badge variant="outline">{member.role}</Badge>
                                </TableCell>
                                <TableCell>
                                  {member.state === "in_sync" ? (
                                    <span className="text-green-600 flex items-center gap-1">
                                      <CheckCircle className="h-4 w-4" /> In Sync
                                    </span>
                                  ) : member.state === "faulty" ? (
                                    <span className="text-red-600 flex items-center gap-1">
                                      <XCircle className="h-4 w-4" /> Faulty
                                    </span>
                                  ) : (
                                    <span className="text-yellow-600">{member.state}</span>
                                  )}
                                </TableCell>
                                <TableCell>{member.slot}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <Shield className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                      <h3 className="text-lg font-medium">No RAID Arrays</h3>
                      <p className="text-muted-foreground">
                        No software RAID arrays configured on this system
                      </p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* ZFS Tab */}
              <TabsContent value="zfs" className="space-y-4">
                {zfsPools.length > 0 ? (
                  zfsPools.map((pool) => (
                    <Card key={pool.name}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="flex items-center gap-2">
                              <Database className="h-5 w-5" />
                              {pool.name}
                              {getZfsHealthBadge(pool.health)}
                            </CardTitle>
                            <CardDescription>
                              {pool.size_human} total • {pool.free_human} free •{" "}
                              {pool.fragmentation}% fragmentation
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="mb-4">
                          <div className="flex justify-between text-sm mb-1">
                            <span>Capacity</span>
                            <span>{pool.capacity}%</span>
                          </div>
                          <Progress value={pool.capacity} />
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Dedup Ratio:</span>{" "}
                            {pool.dedup_ratio.toFixed(2)}x
                          </div>
                          <div>
                            <span className="text-muted-foreground">Fragmentation:</span>{" "}
                            {pool.fragmentation}%
                          </div>
                          <div>
                            <span className="text-muted-foreground">VDevs:</span>{" "}
                            {pool.vdevs.length}
                          </div>
                          <div>
                            <span className="text-muted-foreground">Datasets:</span>{" "}
                            {pool.datasets?.length || 0}
                          </div>
                        </div>

                        {pool.datasets && pool.datasets.length > 0 && (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Dataset</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Used</TableHead>
                                <TableHead>Available</TableHead>
                                <TableHead>Compression</TableHead>
                                <TableHead>Mount Point</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {pool.datasets.slice(0, 10).map((dataset) => (
                                <TableRow key={dataset.name}>
                                  <TableCell className="font-mono text-sm">{dataset.name}</TableCell>
                                  <TableCell>
                                    <Badge variant="outline">{dataset.type}</Badge>
                                  </TableCell>
                                  <TableCell>{dataset.used_human}</TableCell>
                                  <TableCell>{dataset.available_human}</TableCell>
                                  <TableCell>
                                    {dataset.compression} ({dataset.compress_ratio.toFixed(2)}x)
                                  </TableCell>
                                  <TableCell>
                                    {dataset.mountpoint || <span className="text-muted-foreground">-</span>}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <Database className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                      <h3 className="text-lg font-medium">No ZFS Pools</h3>
                      <p className="text-muted-foreground">
                        ZFS is not configured on this system
                      </p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>

      {/* Create LV Dialog */}
      <Dialog open={createLVDialog.open} onOpenChange={(open) => setCreateLVDialog({ ...createLVDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Logical Volume</DialogTitle>
            <DialogDescription>
              Create a new logical volume in {createLVDialog.vgName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Volume Name</Label>
              <Input
                value={lvOptions.name}
                onChange={(e) => setLvOptions({ ...lvOptions, name: e.target.value })}
                placeholder="e.g., data"
              />
            </div>
            <div className="space-y-2">
              <Label>Size</Label>
              <Input
                value={lvOptions.size}
                onChange={(e) => setLvOptions({ ...lvOptions, size: e.target.value })}
                placeholder="e.g., 10G, 100%FREE"
              />
              <p className="text-xs text-muted-foreground">
                Use G for gigabytes, M for megabytes, or 100%FREE for all available space
              </p>
            </div>
            <div className="space-y-2">
              <Label>Filesystem (optional)</Label>
              <Select
                value={lvOptions.fstype}
                onValueChange={(value) => setLvOptions({ ...lvOptions, fstype: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None (raw volume)</SelectItem>
                  <SelectItem value="ext4">ext4</SelectItem>
                  <SelectItem value="xfs">XFS</SelectItem>
                  <SelectItem value="btrfs">Btrfs</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Mount Point (optional)</Label>
              <Input
                value={lvOptions.mount}
                onChange={(e) => setLvOptions({ ...lvOptions, mount: e.target.value })}
                placeholder="e.g., /mnt/data"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateLVDialog({ open: false })}>
              Cancel
            </Button>
            <Button onClick={handleCreateLV} disabled={isCreating || !lvOptions.name || !lvOptions.size}>
              {isCreating ? "Creating..." : "Create Volume"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
