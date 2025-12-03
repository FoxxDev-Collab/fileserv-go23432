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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth-context";
import { poolsAPI, StoragePool } from "@/lib/api";
import { PageSkeleton } from "@/components/skeletons";
import { toast } from "sonner";
import {
  Database,
  RefreshCw,
  Plus,
  Pencil,
  Trash2,
  HardDrive,
  FolderOpen,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export default function StoragePoolsPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [pools, setPools] = useState<StoragePool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Dialog states
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedPool, setSelectedPool] = useState<StoragePool | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    path: "",
    description: "",
    enabled: true,
    reserved: 0,
    max_file_size: 0,
    default_user_quota: 0,
    default_group_quota: 0,
    allowed_types: "",
    denied_types: "",
  });

  useEffect(() => {
    // Wait for auth to finish loading before making any redirect decisions
    if (authLoading) return;

    // Not authenticated - redirect to login
    if (!isAuthenticated) {
      router.replace("/");
      return;
    }

    // User is authenticated but not admin - redirect to dashboard
    // Only redirect if we have confirmed user data with a valid role
    if (user && user.role === "user") {
      router.replace("/dashboard");
    }
  }, [authLoading, isAuthenticated, user, router]);

  const fetchPools = async () => {
    try {
      const data = await poolsAPI.list();
      setPools(data || []);
    } catch (error) {
      toast.error(`Failed to load storage pools: ${error}`);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && user?.role === "admin") {
      fetchPools();
    }
  }, [isAuthenticated, user]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchPools();
  };

  const resetForm = () => {
    setFormData({
      name: "",
      path: "",
      description: "",
      enabled: true,
      reserved: 0,
      max_file_size: 0,
      default_user_quota: 0,
      default_group_quota: 0,
      allowed_types: "",
      denied_types: "",
    });
  };

  const handleEdit = (pool: StoragePool) => {
    setSelectedPool(pool);
    setFormData({
      name: pool.name,
      path: pool.path,
      description: pool.description,
      enabled: pool.enabled,
      reserved: pool.reserved / 1024 / 1024 / 1024,
      max_file_size: pool.max_file_size / 1024 / 1024,
      default_user_quota: pool.default_user_quota / 1024 / 1024 / 1024,
      default_group_quota: pool.default_group_quota / 1024 / 1024 / 1024,
      allowed_types: pool.allowed_types?.join(", ") || "",
      denied_types: pool.denied_types?.join(", ") || "",
    });
    setEditDialogOpen(true);
  };

  const handleUpdate = async () => {
    if (!selectedPool) return;

    try {
      const updates: Partial<StoragePool> = {
        name: formData.name,
        description: formData.description,
        enabled: formData.enabled,
        reserved: formData.reserved * 1024 * 1024 * 1024,
        max_file_size: formData.max_file_size * 1024 * 1024,
        default_user_quota: formData.default_user_quota * 1024 * 1024 * 1024,
        default_group_quota: formData.default_group_quota * 1024 * 1024 * 1024,
        allowed_types: formData.allowed_types ? formData.allowed_types.split(",").map(s => s.trim()) : [],
        denied_types: formData.denied_types ? formData.denied_types.split(",").map(s => s.trim()) : [],
      };

      await poolsAPI.update(selectedPool.id, updates);
      toast.success("Storage pool updated successfully");
      setEditDialogOpen(false);
      resetForm();
      setSelectedPool(null);
      fetchPools();
    } catch (error) {
      toast.error(`Failed to update pool: ${error}`);
    }
  };

  const handleDelete = async () => {
    if (!selectedPool) return;

    try {
      await poolsAPI.delete(selectedPool.id);
      toast.success("Storage pool deleted successfully");
      setDeleteDialogOpen(false);
      setSelectedPool(null);
      fetchPools();
    } catch (error) {
      toast.error(`Failed to delete pool: ${error}`);
    }
  };

  const getUsagePercent = (pool: StoragePool) => {
    if (pool.total_space === 0) return 0;
    return (pool.used_space / pool.total_space) * 100;
  };

  const getUsageColor = (percent: number) => {
    if (percent >= 90) return "text-red-500";
    if (percent >= 75) return "text-yellow-500";
    return "text-green-500";
  };

  // Show skeleton during initial auth check (only if no cached user)
  if (authLoading && !user) {
    return <PageSkeleton title="Storage Pools" />;
  }

  // Not authenticated or not admin - will redirect, show skeleton in meantime
  if (!isAuthenticated || (user && user.role !== "admin")) {
    return <PageSkeleton title="Storage Pools" />;
  }

  // Data loading - show skeleton
  if (isLoading) {
    return <PageSkeleton title="Storage Pools" />;
  }

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
                <h1 className="text-2xl font-bold">Storage Pools</h1>
                <p className="text-muted-foreground">
                  Configure storage locations where shares and user data can exist
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
                <Button size="sm" onClick={() => router.push("/admin/storage/pools/create")}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Pool
                </Button>
              </div>
            </div>

            {/* Overview Cards */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Pools</CardTitle>
                  <Database className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{pools.length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Pools</CardTitle>
                  <CheckCircle className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{pools.filter(p => p.enabled).length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Capacity</CardTitle>
                  <HardDrive className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatBytes(pools.reduce((acc, p) => acc + p.total_space, 0))}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Used Space</CardTitle>
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatBytes(pools.reduce((acc, p) => acc + p.used_space, 0))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Pools Table */}
            <Card>
              <CardHeader>
                <CardTitle>Storage Pools</CardTitle>
                <CardDescription>
                  Manage your storage pool configurations
                </CardDescription>
              </CardHeader>
              <CardContent>
                {pools.length === 0 ? (
                  <div className="text-center py-8">
                    <Database className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium">No Storage Pools</h3>
                    <p className="text-muted-foreground mb-4">
                      Create a storage pool to define where shares can be stored
                    </p>
                    <Button onClick={() => router.push("/admin/storage/pools/create")}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Pool
                    </Button>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Path</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Usage</TableHead>
                        <TableHead>Capacity</TableHead>
                        <TableHead>Default Quota</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pools.map((pool) => {
                        const usagePercent = getUsagePercent(pool);
                        return (
                          <TableRow key={pool.id}>
                            <TableCell className="font-medium">{pool.name}</TableCell>
                            <TableCell className="font-mono text-sm">{pool.path}</TableCell>
                            <TableCell>
                              <Badge variant={pool.enabled ? "default" : "secondary"}>
                                {pool.enabled ? "Active" : "Disabled"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="w-32">
                                <div className="flex items-center justify-between text-sm mb-1">
                                  <span className={getUsageColor(usagePercent)}>
                                    {usagePercent.toFixed(1)}%
                                  </span>
                                </div>
                                <Progress value={usagePercent} className="h-2" />
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">
                                <div>{formatBytes(pool.used_space)} used</div>
                                <div className="text-muted-foreground">
                                  {formatBytes(pool.free_space)} free
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              {pool.default_user_quota > 0
                                ? formatBytes(pool.default_user_quota)
                                : "Unlimited"}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEdit(pool)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedPool(pool);
                                    setDeleteDialogOpen(true);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>

      {/* Edit Pool Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Storage Pool</DialogTitle>
            <DialogDescription>
              Modify storage pool configuration
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Path</Label>
              <Input value={formData.path} disabled className="bg-muted" />
              <p className="text-sm text-muted-foreground">
                Pool path cannot be changed after creation
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="edit-enabled">Enabled</Label>
                <p className="text-sm text-muted-foreground">Allow shares in this pool</p>
              </div>
              <Switch
                id="edit-enabled"
                checked={formData.enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-reserved">Reserved Space (GB)</Label>
                <Input
                  id="edit-reserved"
                  type="number"
                  value={formData.reserved}
                  onChange={(e) => setFormData({ ...formData, reserved: Number(e.target.value) })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-max_file_size">Max File Size (MB)</Label>
                <Input
                  id="edit-max_file_size"
                  type="number"
                  value={formData.max_file_size}
                  onChange={(e) => setFormData({ ...formData, max_file_size: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-user_quota">Default User Quota (GB)</Label>
                <Input
                  id="edit-user_quota"
                  type="number"
                  value={formData.default_user_quota}
                  onChange={(e) => setFormData({ ...formData, default_user_quota: Number(e.target.value) })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-group_quota">Default Group Quota (GB)</Label>
                <Input
                  id="edit-group_quota"
                  type="number"
                  value={formData.default_group_quota}
                  onChange={(e) => setFormData({ ...formData, default_group_quota: Number(e.target.value) })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Delete Storage Pool
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the storage pool &quot;{selectedPool?.name}&quot;?
              This action cannot be undone. All zones in this pool must be deleted first.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete Pool
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
