"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/lib/auth-context";
import { storageAPI, RAIDArray } from "@/lib/api";
import { PageSkeleton } from "@/components/skeletons";
import { toast } from "sonner";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Disc3,
  HardDrive,
  RefreshCw,
  Plus,
  Trash2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  Info,
  MoreVertical,
  StopCircle,
  PlusCircle,
  MinusCircle,
  AlertCircle,
} from "lucide-react";

interface AvailableDevice {
  path: string;
  size: number;
  size_human: string;
  model: string;
  type: string;
  in_use: boolean;
  in_raid?: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export default function RAIDManagementPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [arrays, setArrays] = useState<RAIDArray[]>([]);
  const [availableDevices, setAvailableDevices] = useState<AvailableDevice[]>([]);
  const [selectedArrayDetail, setSelectedArrayDetail] = useState<string>("");

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Dialogs
  const [createArrayOpen, setCreateArrayOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [addDeviceOpen, setAddDeviceOpen] = useState(false);
  const [selectedArray, setSelectedArray] = useState<string>("");

  // Form states
  const [newArray, setNewArray] = useState({
    name: "",
    level: "raid1",
    devices: [] as string[],
    spares: [] as string[],
    chunk: "",
  });

  const [isCreating, setIsCreating] = useState(false);

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

  const fetchRAIDData = async () => {
    try {
      const [arraysData, devicesData] = await Promise.all([
        storageAPI.getRAIDArrays().catch(() => []),
        storageAPI.getAvailableDevicesForRAID().catch(() => []),
      ]);
      setArrays(arraysData);
      setAvailableDevices(devicesData);
    } catch (error) {
      toast.error(`Failed to load RAID data: ${error}`);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && user?.role === "admin") {
      fetchRAIDData();
    }
  }, [isAuthenticated, user]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchRAIDData();
  };

  const handleCreateArray = async () => {
    if (!newArray.name || newArray.devices.length === 0) {
      toast.error("Array name and at least one device are required");
      return;
    }

    // Validate device count based on RAID level
    const minDevices: Record<string, number> = {
      raid0: 2,
      raid1: 2,
      raid5: 3,
      raid6: 4,
      raid10: 4,
    };
    const min = minDevices[newArray.level] || 2;
    if (newArray.devices.length < min) {
      toast.error(`${newArray.level.toUpperCase()} requires at least ${min} devices`);
      return;
    }

    setIsCreating(true);
    try {
      await storageAPI.createRAIDArray({
        name: newArray.name,
        level: newArray.level,
        devices: newArray.devices,
        spares: newArray.spares.length > 0 ? newArray.spares : undefined,
        chunk: newArray.chunk || undefined,
      });
      toast.success(`RAID array ${newArray.name} created successfully`);
      setCreateArrayOpen(false);
      setNewArray({ name: "", level: "raid1", devices: [], spares: [], chunk: "" });
      fetchRAIDData();
    } catch (error) {
      toast.error(`Failed to create RAID array: ${error}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleViewDetail = async (name: string) => {
    try {
      const result = await storageAPI.getRAIDStatus(name);
      setSelectedArrayDetail(result.detail);
      setDetailDialogOpen(true);
    } catch (error) {
      toast.error(`Failed to get RAID status: ${error}`);
    }
  };

  const handleStopArray = async (name: string) => {
    if (!confirm(`Are you sure you want to stop RAID array "${name}"? It will become inactive.`)) {
      return;
    }
    try {
      await storageAPI.stopRAIDArray(name);
      toast.success(`RAID array ${name} stopped`);
      fetchRAIDData();
    } catch (error) {
      toast.error(`Failed to stop RAID array: ${error}`);
    }
  };

  const handleRemoveArray = async (name: string) => {
    if (!confirm(`Are you sure you want to remove RAID array "${name}"? This will stop the array and clear superblocks on all member devices!`)) {
      return;
    }
    try {
      await storageAPI.removeRAIDArray(name, true);
      toast.success(`RAID array ${name} removed`);
      fetchRAIDData();
    } catch (error) {
      toast.error(`Failed to remove RAID array: ${error}`);
    }
  };

  const handleAddDevice = async (device: string) => {
    if (!selectedArray) return;
    try {
      await storageAPI.addRAIDDevice(selectedArray, device);
      toast.success(`Device ${device} added to ${selectedArray}`);
      setAddDeviceOpen(false);
      fetchRAIDData();
    } catch (error) {
      toast.error(`Failed to add device: ${error}`);
    }
  };

  const handleRemoveDevice = async (array: string, device: string) => {
    if (!confirm(`Remove device ${device} from ${array}? The device will be marked as faulty first.`)) {
      return;
    }
    try {
      await storageAPI.removeRAIDDevice(array, device);
      toast.success(`Device ${device} removed from ${array}`);
      fetchRAIDData();
    } catch (error) {
      toast.error(`Failed to remove device: ${error}`);
    }
  };

  const handleMarkFaulty = async (array: string, device: string) => {
    if (!confirm(`Mark device ${device} as faulty in ${array}?`)) {
      return;
    }
    try {
      await storageAPI.markRAIDDeviceFaulty(array, device);
      toast.success(`Device ${device} marked as faulty`);
      fetchRAIDData();
    } catch (error) {
      toast.error(`Failed to mark device as faulty: ${error}`);
    }
  };

  if (authLoading && !user) {
    return <PageSkeleton title="RAID Storage" />;
  }

  if (!isAuthenticated || (user && user.role !== "admin")) {
    return <PageSkeleton title="RAID Storage" />;
  }

  if (isLoading) {
    return <PageSkeleton title="RAID Storage" />;
  }

  const getStateBadge = (state: string) => {
    switch (state.toLowerCase()) {
      case "active":
      case "clean":
        return <Badge variant="default" className="bg-green-600">Active</Badge>;
      case "degraded":
        return <Badge variant="default" className="bg-yellow-600">Degraded</Badge>;
      case "rebuilding":
      case "recovering":
        return <Badge variant="default" className="bg-blue-600">Rebuilding</Badge>;
      case "inactive":
        return <Badge variant="secondary">Inactive</Badge>;
      default:
        return <Badge variant="outline">{state}</Badge>;
    }
  };

  const getMemberStateBadge = (state: string) => {
    switch (state.toLowerCase()) {
      case "in_sync":
      case "active":
        return <Badge variant="outline" className="text-green-600 border-green-600">In Sync</Badge>;
      case "spare":
        return <Badge variant="outline">Spare</Badge>;
      case "faulty":
        return <Badge variant="destructive">Faulty</Badge>;
      case "rebuilding":
        return <Badge variant="outline" className="text-blue-600 border-blue-600">Rebuilding</Badge>;
      default:
        return <Badge variant="outline">{state}</Badge>;
    }
  };

  const availableForCreation = availableDevices.filter(d => !d.in_use);

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
                <h1 className="text-2xl font-bold">Software RAID Management</h1>
                <p className="text-muted-foreground">
                  Manage Linux software RAID arrays (mdadm)
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
                <Button size="sm" onClick={() => setCreateArrayOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Array
                </Button>
              </div>
            </div>

            {/* RAID Overview Card */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Disc3 className="h-10 w-10 text-blue-500" />
                    <div>
                      <CardTitle className="text-lg">Linux Software RAID</CardTitle>
                      <CardDescription>Manage mdadm RAID arrays for data redundancy</CardDescription>
                    </div>
                  </div>
                  {arrays.length > 0 ? (
                    <CheckCircle className="h-8 w-8 text-green-500" />
                  ) : (
                    <Info className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{arrays.length} array(s)</Badge>
                  <Badge variant="outline">{availableForCreation.length} device(s) available</Badge>
                  {arrays.some(a => a.state === "degraded") && (
                    <Badge variant="destructive">Degraded array(s)</Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* RAID Arrays */}
            <Card>
              <CardHeader>
                <CardTitle>RAID Arrays</CardTitle>
                <CardDescription>Active software RAID arrays</CardDescription>
              </CardHeader>
              <CardContent>
                {arrays.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">
                    <Disc3 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No RAID arrays configured</p>
                    <p className="text-sm">Create an array to get started with software RAID</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {arrays.map((array) => (
                      <Card key={array.name} className="border">
                        <CardHeader className="py-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <HardDrive className="h-5 w-5 text-muted-foreground" />
                              <div>
                                <CardTitle className="text-base font-mono">{array.path}</CardTitle>
                                <CardDescription>
                                  {array.level.toUpperCase()} - {array.size_human}
                                </CardDescription>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {getStateBadge(array.state)}
                              {array.sync_percent !== undefined && array.sync_percent > 0 && array.sync_percent < 100 && (
                                <Badge variant="outline">{array.sync_percent.toFixed(1)}% synced</Badge>
                              )}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => handleViewDetail(array.name)}>
                                    <Info className="h-4 w-4 mr-2" />
                                    View Details
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => {
                                    setSelectedArray(array.path);
                                    setAddDeviceOpen(true);
                                  }}>
                                    <PlusCircle className="h-4 w-4 mr-2" />
                                    Add Device
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => handleStopArray(array.name)}>
                                    <StopCircle className="h-4 w-4 mr-2" />
                                    Stop Array
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleRemoveArray(array.name)}
                                    className="text-red-600"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Remove Array
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="border rounded-lg overflow-hidden">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Device</TableHead>
                                  <TableHead>Role</TableHead>
                                  <TableHead>State</TableHead>
                                  <TableHead>Slot</TableHead>
                                  <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {array.members.map((member, idx) => (
                                  <TableRow key={idx}>
                                    <TableCell className="font-mono text-sm">{member.device}</TableCell>
                                    <TableCell>{member.role}</TableCell>
                                    <TableCell>{getMemberStateBadge(member.state)}</TableCell>
                                    <TableCell>{member.slot}</TableCell>
                                    <TableCell className="text-right">
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button variant="ghost" size="sm">
                                            <MoreVertical className="h-4 w-4" />
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                          <DropdownMenuItem
                                            onClick={() => handleMarkFaulty(array.path, member.device)}
                                            disabled={member.state === "faulty"}
                                          >
                                            <AlertCircle className="h-4 w-4 mr-2" />
                                            Mark Faulty
                                          </DropdownMenuItem>
                                          <DropdownMenuItem
                                            onClick={() => handleRemoveDevice(array.path, member.device)}
                                            className="text-red-600"
                                          >
                                            <MinusCircle className="h-4 w-4 mr-2" />
                                            Remove
                                          </DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                          <div className="mt-3 flex gap-4 text-sm text-muted-foreground">
                            <span>Devices: {array.devices}</span>
                            <span>Active: {array.active_devices}</span>
                            <span>Spare: {array.spare_devices}</span>
                            <span>Failed: {array.failed_devices}</span>
                            {array.chunk_size && <span>Chunk: {array.chunk_size}</span>}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* RAID Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Info className="h-5 w-5" />
                  About Software RAID
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Linux software RAID (mdadm) provides redundancy and performance improvements
                  by combining multiple disks. Choose the right RAID level based on your needs.
                </p>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-2 p-3 border rounded-lg">
                    <h4 className="font-medium">RAID 0 (Stripe)</h4>
                    <p className="text-sm text-muted-foreground">
                      Maximum performance, no redundancy. Data striped across all disks.
                      Minimum 2 disks.
                    </p>
                  </div>
                  <div className="space-y-2 p-3 border rounded-lg">
                    <h4 className="font-medium">RAID 1 (Mirror)</h4>
                    <p className="text-sm text-muted-foreground">
                      Full redundancy, data mirrored across disks. Can survive disk failure.
                      Minimum 2 disks.
                    </p>
                  </div>
                  <div className="space-y-2 p-3 border rounded-lg">
                    <h4 className="font-medium">RAID 5 (Striped Parity)</h4>
                    <p className="text-sm text-muted-foreground">
                      Balance of performance and redundancy. Single parity distributed across disks.
                      Minimum 3 disks.
                    </p>
                  </div>
                  <div className="space-y-2 p-3 border rounded-lg">
                    <h4 className="font-medium">RAID 6 (Double Parity)</h4>
                    <p className="text-sm text-muted-foreground">
                      Enhanced redundancy with dual parity. Can survive 2 disk failures.
                      Minimum 4 disks.
                    </p>
                  </div>
                  <div className="space-y-2 p-3 border rounded-lg">
                    <h4 className="font-medium">RAID 10 (Stripe + Mirror)</h4>
                    <p className="text-sm text-muted-foreground">
                      High performance with redundancy. Combines striping and mirroring.
                      Minimum 4 disks.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>

      {/* Create Array Dialog */}
      <Dialog open={createArrayOpen} onOpenChange={setCreateArrayOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create RAID Array</DialogTitle>
            <DialogDescription>
              Create a new software RAID array from available devices
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="array-name">Array Name</Label>
              <Input
                id="array-name"
                placeholder="md0"
                value={newArray.name}
                onChange={(e) => setNewArray({ ...newArray, name: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Will create /dev/md{newArray.name.replace(/^md/, "")}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="raid-level">RAID Level</Label>
              <Select
                value={newArray.level}
                onValueChange={(value) => setNewArray({ ...newArray, level: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="raid0">RAID 0 (Stripe - 2+ disks)</SelectItem>
                  <SelectItem value="raid1">RAID 1 (Mirror - 2+ disks)</SelectItem>
                  <SelectItem value="raid5">RAID 5 (Parity - 3+ disks)</SelectItem>
                  <SelectItem value="raid6">RAID 6 (Double Parity - 4+ disks)</SelectItem>
                  <SelectItem value="raid10">RAID 10 (Stripe + Mirror - 4+ disks)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Select Devices</Label>
              {availableForCreation.length === 0 ? (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>No Available Devices</AlertTitle>
                  <AlertDescription>
                    No unused devices found. Devices must not be mounted or in use.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="border rounded-lg max-h-48 overflow-y-auto">
                  {availableForCreation.map((device) => (
                    <div key={device.path} className="flex items-center gap-3 p-3 border-b last:border-b-0">
                      <Checkbox
                        id={device.path}
                        checked={newArray.devices.includes(device.path)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setNewArray({ ...newArray, devices: [...newArray.devices, device.path] });
                          } else {
                            setNewArray({ ...newArray, devices: newArray.devices.filter(d => d !== device.path) });
                          }
                        }}
                      />
                      <label htmlFor={device.path} className="flex-1 cursor-pointer">
                        <div className="font-mono text-sm">{device.path}</div>
                        <div className="text-xs text-muted-foreground">
                          {device.size_human} - {device.model || device.type}
                        </div>
                      </label>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Selected: {newArray.devices.length} device(s)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="chunk-size">Chunk Size (optional)</Label>
              <Input
                id="chunk-size"
                placeholder="512K"
                value={newArray.chunk}
                onChange={(e) => setNewArray({ ...newArray, chunk: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Default varies by level. Common values: 64K, 128K, 256K, 512K
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateArrayOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateArray} disabled={isCreating || newArray.devices.length < 2}>
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Array"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>RAID Array Details</DialogTitle>
            <DialogDescription>
              Detailed mdadm status output
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted p-4 rounded-lg overflow-x-auto">
            <pre className="text-xs font-mono whitespace-pre-wrap">{selectedArrayDetail}</pre>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Device Dialog */}
      <Dialog open={addDeviceOpen} onOpenChange={setAddDeviceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Device to Array</DialogTitle>
            <DialogDescription>
              Add a device to {selectedArray}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {availableForCreation.length === 0 ? (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>No Available Devices</AlertTitle>
                <AlertDescription>
                  No unused devices found.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="border rounded-lg max-h-64 overflow-y-auto">
                {availableForCreation.map((device) => (
                  <div
                    key={device.path}
                    className="flex items-center justify-between p-3 border-b last:border-b-0 hover:bg-muted/50 cursor-pointer"
                    onClick={() => handleAddDevice(device.path)}
                  >
                    <div>
                      <div className="font-mono text-sm">{device.path}</div>
                      <div className="text-xs text-muted-foreground">
                        {device.size_human} - {device.model || device.type}
                      </div>
                    </div>
                    <Button size="sm">
                      <PlusCircle className="h-4 w-4 mr-2" />
                      Add
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDeviceOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
