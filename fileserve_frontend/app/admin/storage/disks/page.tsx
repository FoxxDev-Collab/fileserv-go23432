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
} from "lucide-react";

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

                        {/* Partitions Table */}
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
    </div>
  );
}
