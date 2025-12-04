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
import { quotasAPI, storageAPI, Quota, QuotaStatus, UserStorageUsage, MountPoint } from "@/lib/api";
import { PageSkeleton } from "@/components/skeletons";
import { toast } from "sonner";
import {
  Gauge,
  RefreshCw,
  Plus,
  Trash2,
  User,
  Users,
  AlertTriangle,
  CheckCircle,
  Settings,
  HardDrive,
  FolderOpen,
  FileText,
} from "lucide-react";

export default function QuotasPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [quotas, setQuotas] = useState<Quota[]>([]);
  const [quotaStatus, setQuotaStatus] = useState<QuotaStatus[]>([]);
  const [userStorage, setUserStorage] = useState<UserStorageUsage[]>([]);
  const [mounts, setMounts] = useState<MountPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [setQuotaDialog, setSetQuotaDialog] = useState({ open: false });
  const [quotaOptions, setQuotaOptions] = useState({
    type: "user" as "user" | "group",
    target: "",
    filesystem: "",
    block_soft: "",
    block_hard: "",
    inode_soft: "",
    inode_hard: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [removeQuotaDialog, setRemoveQuotaDialog] = useState<{ open: boolean; quota?: Quota }>({ open: false });

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
      const [quotaData, statusData, storageData, mountData] = await Promise.all([
        quotasAPI.list(),
        quotasAPI.getStatus(),
        storageAPI.getUserStorageUsage(),
        storageAPI.getMounts(),
      ]);
      setQuotas(quotaData);
      setQuotaStatus(statusData);
      setUserStorage(storageData);
      setMounts(mountData.filter(m =>
        !m.mount_path.startsWith('/sys') &&
        !m.mount_path.startsWith('/proc') &&
        !m.mount_path.startsWith('/run') &&
        !m.mount_path.startsWith('/dev') &&
        m.fstype !== 'tmpfs' &&
        m.fstype !== 'devtmpfs'
      ));
    } catch (error) {
      console.error("Failed to fetch quota data:", error);
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

  const parseSize = (size: string): number => {
    const match = size.match(/^(\d+(?:\.\d+)?)\s*([KMGTP]?)B?$/i);
    if (!match) return 0;
    const num = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    const multipliers: Record<string, number> = {
      "": 1,
      "K": 1024,
      "M": 1024 * 1024,
      "G": 1024 * 1024 * 1024,
      "T": 1024 * 1024 * 1024 * 1024,
      "P": 1024 * 1024 * 1024 * 1024 * 1024,
    };
    return num * (multipliers[unit] || 1);
  };

  const handleSetQuota = async () => {
    setIsSaving(true);
    try {
      await quotasAPI.setQuota({
        type: quotaOptions.type,
        target: quotaOptions.target,
        filesystem: quotaOptions.filesystem,
        block_soft: parseSize(quotaOptions.block_soft),
        block_hard: parseSize(quotaOptions.block_hard),
        inode_soft: parseInt(quotaOptions.inode_soft) || 0,
        inode_hard: parseInt(quotaOptions.inode_hard) || 0,
      });
      toast.success("Quota set successfully");
      setSetQuotaDialog({ open: false });
      fetchData();
    } catch (error) {
      toast.error(`Failed to set quota: ${error}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveQuota = (quota: Quota) => {
    setRemoveQuotaDialog({ open: true, quota });
  };

  const confirmRemoveQuota = async () => {
    if (!removeQuotaDialog.quota) return;

    try {
      await quotasAPI.removeQuota(
        removeQuotaDialog.quota.type as "user" | "group",
        removeQuotaDialog.quota.target,
        removeQuotaDialog.quota.filesystem
      );
      toast.success("Quota removed");
      setRemoveQuotaDialog({ open: false });
      fetchData();
    } catch (error) {
      toast.error(`Failed to remove quota: ${error}`);
    }
  };

  const handleEnableQuotas = async (filesystem: string) => {
    try {
      await quotasAPI.enable({ filesystem, user_quota: true, group_quota: true });
      toast.success("Quotas enabled");
      fetchData();
    } catch (error) {
      toast.error(`Failed to enable quotas: ${error}`);
    }
  };

  // Show skeleton during initial auth check (only if no cached user)
  if (authLoading && !user) {
    return <PageSkeleton title="Quota Management" />;
  }

  // Not authenticated or not admin - will redirect, show skeleton in meantime
  if (!isAuthenticated || (user && user.role !== "admin")) {
    return <PageSkeleton title="Quota Management" />;
  }

  // Data loading - show skeleton
  if (isLoading) {
    return <PageSkeleton title="Quota Management" />;
  }

  const userQuotas = quotas.filter(q => q.type === "user");
  const groupQuotas = quotas.filter(q => q.type === "group");
  const overQuotaCount = quotas.filter(q => q.over_quota).length;

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Quota Management" />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Quota Management</h2>
                <p className="text-muted-foreground">Manage storage quotas for users and groups</p>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleRefresh} disabled={isRefreshing} variant="outline">
                  <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
                <Button onClick={() => {
                  setSetQuotaDialog({ open: true });
                  setQuotaOptions({
                    type: "user",
                    target: "",
                    filesystem: mounts[0]?.mount_path || "",
                    block_soft: "",
                    block_hard: "",
                    inode_soft: "",
                    inode_hard: "",
                  });
                }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Set Quota
                </Button>
              </div>
            </div>

            {/* Summary */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <User className="h-4 w-4" />
                    User Quotas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{userQuotas.length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Group Quotas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{groupQuotas.length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Over Quota
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${overQuotaCount > 0 ? "text-red-600" : "text-green-600"}`}>
                    {overQuotaCount}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <HardDrive className="h-4 w-4" />
                    Filesystems
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {quotaStatus.filter(s => s.user_state === "on" || s.group_state === "on").length}
                  </div>
                  <p className="text-xs text-muted-foreground">with quotas enabled</p>
                </CardContent>
              </Card>
            </div>

            <Tabs defaultValue="quotas">
              <TabsList>
                <TabsTrigger value="quotas">Active Quotas</TabsTrigger>
                <TabsTrigger value="users">User Storage</TabsTrigger>
                <TabsTrigger value="filesystems">Filesystem Status</TabsTrigger>
              </TabsList>

              {/* Active Quotas Tab */}
              <TabsContent value="quotas">
                <Card>
                  <CardHeader>
                    <CardTitle>Active Quotas</CardTitle>
                    <CardDescription>All configured storage quotas</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {quotas.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Type</TableHead>
                            <TableHead>Target</TableHead>
                            <TableHead>Filesystem</TableHead>
                            <TableHead>Used</TableHead>
                            <TableHead>Soft Limit</TableHead>
                            <TableHead>Hard Limit</TableHead>
                            <TableHead>Usage</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {quotas.map((quota) => (
                            <TableRow key={quota.id} className={quota.over_quota ? "bg-red-50" : ""}>
                              <TableCell>
                                <Badge variant="outline">
                                  {quota.type === "user" ? <User className="h-3 w-3 mr-1" /> : <Users className="h-3 w-3 mr-1" />}
                                  {quota.type}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-medium">{quota.target}</TableCell>
                              <TableCell className="font-mono text-sm">{quota.filesystem}</TableCell>
                              <TableCell>{quota.used_human}</TableCell>
                              <TableCell>{quota.soft_human || "-"}</TableCell>
                              <TableCell>{quota.hard_human || "-"}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Progress
                                    value={Math.min(quota.used_percent, 100)}
                                    className={`w-20 ${quota.over_quota ? "bg-red-200" : ""}`}
                                  />
                                  <span className={`text-sm ${quota.over_quota ? "text-red-600 font-medium" : ""}`}>
                                    {quota.used_percent.toFixed(1)}%
                                  </span>
                                  {quota.over_quota && <AlertTriangle className="h-4 w-4 text-red-500" />}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveQuota(quota)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="text-center py-12">
                        <Gauge className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                        <h3 className="text-lg font-medium">No Quotas Configured</h3>
                        <p className="text-muted-foreground mb-4">
                          Set up storage quotas to limit user and group disk usage
                        </p>
                        <Button onClick={() => setSetQuotaDialog({ open: true })}>
                          <Plus className="h-4 w-4 mr-2" />
                          Set First Quota
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* User Storage Tab */}
              <TabsContent value="users">
                <Card>
                  <CardHeader>
                    <CardTitle>User Storage Usage</CardTitle>
                    <CardDescription>Storage consumption by user</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {userStorage.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>User</TableHead>
                            <TableHead>UID</TableHead>
                            <TableHead>Home Directory</TableHead>
                            <TableHead>Home Size</TableHead>
                            <TableHead>Files</TableHead>
                            <TableHead>Directories</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {userStorage.map((usage) => (
                            <TableRow key={usage.username}>
                              <TableCell className="font-medium">{usage.username}</TableCell>
                              <TableCell>{usage.uid}</TableCell>
                              <TableCell className="font-mono text-sm">{usage.home_dir}</TableCell>
                              <TableCell>{usage.home_size_human}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <FileText className="h-4 w-4 text-muted-foreground" />
                                  {usage.file_count.toLocaleString()}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                                  {usage.dir_count.toLocaleString()}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="text-center py-8 text-muted-foreground">
                        No user storage data available
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Filesystem Status Tab */}
              <TabsContent value="filesystems">
                <Card>
                  <CardHeader>
                    <CardTitle>Filesystem Quota Status</CardTitle>
                    <CardDescription>Quota support status by filesystem</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {quotaStatus.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Filesystem</TableHead>
                            <TableHead>Mount Point</TableHead>
                            <TableHead>User Quota</TableHead>
                            <TableHead>Group Quota</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {quotaStatus.map((status, index) => (
                            <TableRow key={index}>
                              <TableCell className="font-mono text-sm">{status.filesystem}</TableCell>
                              <TableCell>{status.mount_point}</TableCell>
                              <TableCell>
                                {status.user_state === "on" ? (
                                  <Badge className="bg-green-500">Enabled</Badge>
                                ) : status.user_state === "off" ? (
                                  <Badge variant="secondary">Disabled</Badge>
                                ) : (
                                  <Badge variant="outline">Not Configured</Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                {status.group_state === "on" ? (
                                  <Badge className="bg-green-500">Enabled</Badge>
                                ) : status.group_state === "off" ? (
                                  <Badge variant="secondary">Disabled</Badge>
                                ) : (
                                  <Badge variant="outline">Not Configured</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                {(status.user_state !== "on" || status.group_state !== "on") && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleEnableQuotas(status.mount_point)}
                                  >
                                    <Settings className="h-4 w-4 mr-1" />
                                    Enable
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="text-center py-8 text-muted-foreground">
                        No filesystem quota status available
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>

      {/* Set Quota Dialog */}
      <Dialog open={setQuotaDialog.open} onOpenChange={(open) => setSetQuotaDialog({ open })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Set Storage Quota</DialogTitle>
            <DialogDescription>
              Configure storage limits for a user or group
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quota Type</Label>
                <Select
                  value={quotaOptions.type}
                  onValueChange={(value) => setQuotaOptions({ ...quotaOptions, type: value as "user" | "group" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="group">Group</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{quotaOptions.type === "user" ? "Username" : "Group Name"}</Label>
                <Input
                  value={quotaOptions.target}
                  onChange={(e) => setQuotaOptions({ ...quotaOptions, target: e.target.value })}
                  placeholder={quotaOptions.type === "user" ? "john" : "developers"}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Filesystem</Label>
              <Select
                value={quotaOptions.filesystem}
                onValueChange={(value) => setQuotaOptions({ ...quotaOptions, filesystem: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select filesystem" />
                </SelectTrigger>
                <SelectContent>
                  {mounts.map((mount) => (
                    <SelectItem key={mount.mount_path} value={mount.mount_path}>
                      {mount.mount_path} ({mount.fstype})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Soft Limit (Block)</Label>
                <Input
                  value={quotaOptions.block_soft}
                  onChange={(e) => setQuotaOptions({ ...quotaOptions, block_soft: e.target.value })}
                  placeholder="e.g., 10G"
                />
              </div>
              <div className="space-y-2">
                <Label>Hard Limit (Block)</Label>
                <Input
                  value={quotaOptions.block_hard}
                  onChange={(e) => setQuotaOptions({ ...quotaOptions, block_hard: e.target.value })}
                  placeholder="e.g., 15G"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Soft Limit (Inodes)</Label>
                <Input
                  value={quotaOptions.inode_soft}
                  onChange={(e) => setQuotaOptions({ ...quotaOptions, inode_soft: e.target.value })}
                  placeholder="e.g., 100000"
                />
              </div>
              <div className="space-y-2">
                <Label>Hard Limit (Inodes)</Label>
                <Input
                  value={quotaOptions.inode_hard}
                  onChange={(e) => setQuotaOptions({ ...quotaOptions, inode_hard: e.target.value })}
                  placeholder="e.g., 150000"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Use K, M, G, T suffixes for sizes. Leave empty for no limit.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSetQuotaDialog({ open: false })}>
              Cancel
            </Button>
            <Button onClick={handleSetQuota} disabled={isSaving || !quotaOptions.target || !quotaOptions.filesystem}>
              {isSaving ? "Saving..." : "Set Quota"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Quota Confirmation Dialog */}
      <AlertDialog open={removeQuotaDialog.open} onOpenChange={(open) => setRemoveQuotaDialog({ ...removeQuotaDialog, open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Quota</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove the quota for {removeQuotaDialog.quota?.target} on {removeQuotaDialog.quota?.filesystem}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemoveQuota} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove Quota
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
