"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Shield,
  Plus,
  Trash2,
  RefreshCw,
  Pencil,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Home,
  User,
  Users,
  Lock,
  Eye,
  FileEdit,
  Trash,
  HardDrive,
  ArrowRight,
  Search,
  Info,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { PageSkeleton } from "@/components/skeletons";
import {
  permissionsAPI,
  systemUsersAPI,
  poolsAPI,
  zonesAPI,
  storageAPI,
  Permission,
  SystemUser,
  SystemGroup,
  StoragePool,
  ShareZone,
  DirectoryEntry,
} from "@/lib/api";

interface PathInfo {
  exists: boolean;
  isDir: boolean;
  owner?: string;
  group?: string;
  mode?: string;
  size?: number;
}

export default function PermissionsPage() {
  const router = useRouter();
  const { user: currentUser, isAuthenticated, isLoading: authLoading } = useAuth();

  // Data state
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [systemUsers, setSystemUsers] = useState<SystemUser[]>([]);
  const [systemGroups, setSystemGroups] = useState<SystemGroup[]>([]);
  const [pools, setPools] = useState<StoragePool[]>([]);
  const [zones, setZones] = useState<ShareZone[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Dialog state
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isBrowseDialogOpen, setIsBrowseDialogOpen] = useState(false);

  // Form state
  const [editingPermission, setEditingPermission] = useState<Permission | null>(null);
  const [permissionToDelete, setPermissionToDelete] = useState<Permission | null>(null);
  const [formPath, setFormPath] = useState("");
  const [formUsername, setFormUsername] = useState("");
  const [formGroup, setFormGroup] = useState("");
  const [formType, setFormType] = useState<"read" | "write" | "delete">("read");
  const [assignType, setAssignType] = useState<"user" | "group">("user");

  // Path browser state
  const [browsePath, setBrowsePath] = useState("/");
  const [browseEntries, setBrowseEntries] = useState<DirectoryEntry[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [pathInfo, setPathInfo] = useState<PathInfo | null>(null);

  // UI state
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("permissions");
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  // Redirect if not authenticated or not admin
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
    } else if (!authLoading && currentUser?.role !== "admin") {
      router.push("/dashboard");
      toast.error("Admin access required");
    }
  }, [authLoading, isAuthenticated, currentUser, router]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [permsData, usersData, groupsData, poolsData, zonesData] = await Promise.all([
        permissionsAPI.list(),
        systemUsersAPI.list(false),
        systemUsersAPI.listGroups(),
        poolsAPI.list(),
        zonesAPI.list(),
      ]);
      setPermissions(permsData || []);
      setSystemUsers(usersData || []);
      setSystemGroups(groupsData || []);
      setPools(poolsData || []);
      setZones(zonesData || []);
    } catch (error) {
      console.error("Failed to load data:", error);
      toast.error("Failed to load permissions data");
      setPermissions([]);
      setSystemUsers([]);
      setSystemGroups([]);
      setPools([]);
      setZones([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && currentUser?.role === "admin") {
      loadData();
    }
  }, [isAuthenticated, currentUser, loadData]);

  // Browse directories
  const loadBrowseDirectory = useCallback(async (path: string) => {
    setBrowseLoading(true);
    try {
      const response = await storageAPI.browseDirectories(path);
      setBrowseEntries(response.entries || []);
      setBrowsePath(response.current_path);
    } catch (error) {
      console.error("Failed to browse:", error);
      setBrowseEntries([]);
    } finally {
      setBrowseLoading(false);
    }
  }, []);

  // Open browse dialog
  const openBrowseDialog = () => {
    setIsBrowseDialogOpen(true);
    loadBrowseDirectory("/");
  };

  // Select path from browser
  const selectBrowsePath = (path: string) => {
    setFormPath(path);
    setIsBrowseDialogOpen(false);
  };

  // Navigate to parent directory
  const navigateUp = () => {
    const parts = browsePath.split("/").filter(Boolean);
    parts.pop();
    const parentPath = "/" + parts.join("/");
    loadBrowseDirectory(parentPath || "/");
  };

  // Filter permissions
  const filteredPermissions = permissions.filter(
    (perm) =>
      perm.path.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (perm.username && perm.username.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (perm.group && perm.group.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Group permissions by base path for better visualization
  const groupedPermissions = filteredPermissions.reduce((acc, perm) => {
    const basePath = perm.path.split("/").slice(0, 3).join("/") || "/";
    if (!acc[basePath]) {
      acc[basePath] = [];
    }
    acc[basePath].push(perm);
    return acc;
  }, {} as Record<string, Permission[]>);

  // Get zone for a path
  const getZoneForPath = (path: string): { zone: ShareZone; pool: StoragePool } | null => {
    for (const zone of zones) {
      const pool = pools.find(p => p.id === zone.pool_id);
      if (pool) {
        const zonePath = `${pool.path}/${zone.path}`.replace(/\/+/g, "/");
        if (path.startsWith(zonePath)) {
          return { zone, pool };
        }
      }
    }
    return null;
  };

  // Reset form
  const resetForm = () => {
    setFormPath("");
    setFormUsername("");
    setFormGroup("");
    setFormType("read");
    setAssignType("user");
    setEditingPermission(null);
    setPathInfo(null);
  };

  // Handle add permission
  const handleAddPermission = async () => {
    if (!formPath) {
      toast.error("Path is required");
      return;
    }
    if (assignType === "user" && !formUsername) {
      toast.error("Please select a user");
      return;
    }
    if (assignType === "group" && !formGroup) {
      toast.error("Please select a group");
      return;
    }

    try {
      await permissionsAPI.create({
        path: formPath,
        type: formType,
        username: assignType === "user" ? formUsername : undefined,
        group: assignType === "group" ? formGroup : undefined,
      });
      toast.success("Permission added successfully");
      setIsAddDialogOpen(false);
      resetForm();
      loadData();
    } catch (error) {
      console.error("Failed to create permission:", error);
      toast.error("Failed to create permission");
    }
  };

  // Open edit dialog
  const openEditDialog = (permission: Permission) => {
    setEditingPermission(permission);
    setFormPath(permission.path);
    setFormType(permission.type as "read" | "write" | "delete");
    if (permission.username) {
      setAssignType("user");
      setFormUsername(permission.username);
      setFormGroup("");
    } else {
      setAssignType("group");
      setFormGroup(permission.group || "");
      setFormUsername("");
    }
    setIsEditDialogOpen(true);
  };

  // Handle edit permission
  const handleEditPermission = async () => {
    if (!editingPermission) return;

    if (!formPath) {
      toast.error("Path is required");
      return;
    }

    try {
      await permissionsAPI.update(editingPermission.id, {
        path: formPath,
        type: formType,
        username: assignType === "user" ? formUsername : undefined,
        group: assignType === "group" ? formGroup : undefined,
      });
      toast.success("Permission updated successfully");
      setIsEditDialogOpen(false);
      resetForm();
      loadData();
    } catch (error) {
      console.error("Failed to update permission:", error);
      toast.error("Failed to update permission");
    }
  };

  // Open delete dialog
  const openDeleteDialog = (permission: Permission) => {
    setPermissionToDelete(permission);
    setIsDeleteDialogOpen(true);
  };

  // Handle delete permission
  const handleDeletePermission = async () => {
    if (!permissionToDelete) return;

    try {
      await permissionsAPI.delete(permissionToDelete.id);
      toast.success("Permission deleted");
      setIsDeleteDialogOpen(false);
      setPermissionToDelete(null);
      loadData();
    } catch (error) {
      console.error("Failed to delete permission:", error);
      toast.error("Failed to delete permission");
    }
  };

  // Quick add permission from zone
  const quickAddFromZone = (zone: ShareZone, pool: StoragePool) => {
    const fullPath = `${pool.path}/${zone.path}`.replace(/\/+/g, "/");
    setFormPath(fullPath);
    setIsAddDialogOpen(true);
  };

  // Get permission icon
  const getPermissionIcon = (type: string) => {
    switch (type) {
      case "delete":
        return <Trash className="h-4 w-4" />;
      case "write":
        return <FileEdit className="h-4 w-4" />;
      default:
        return <Eye className="h-4 w-4" />;
    }
  };

  // Get access badge variant
  const getAccessBadgeVariant = (type: string) => {
    if (type === "delete") return "default";
    if (type === "write") return "secondary";
    return "outline";
  };

  // Toggle path expansion
  const togglePath = (path: string) => {
    const newExpanded = new Set(expandedPaths);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedPaths(newExpanded);
  };

  // Show skeleton during initial auth check
  if (authLoading && !currentUser) {
    return <PageSkeleton title="Permissions" />;
  }

  // Not authenticated or not admin - will redirect
  if (!isAuthenticated || (currentUser && currentUser.role !== "admin")) {
    return <PageSkeleton title="Permissions" />;
  }

  // Permission form component
  const PermissionForm = () => (
    <div className="space-y-4 py-4">
      {/* Path input with browse button */}
      <div className="space-y-2">
        <Label htmlFor="perm-path">Path</Label>
        <div className="flex gap-2">
          <Input
            id="perm-path"
            placeholder="/path/to/folder"
            value={formPath}
            onChange={(e) => setFormPath(e.target.value)}
            className="flex-1 font-mono"
          />
          <Button type="button" variant="outline" onClick={openBrowseDialog}>
            <Folder className="h-4 w-4 mr-2" />
            Browse
          </Button>
        </div>
        {formPath && (
          <div className="text-xs text-muted-foreground">
            {(() => {
              const zoneInfo = getZoneForPath(formPath);
              if (zoneInfo) {
                return (
                  <span className="flex items-center gap-1 text-green-600">
                    <CheckCircle className="h-3 w-3" />
                    Zone: {zoneInfo.zone.name} (Pool: {zoneInfo.pool.name})
                  </span>
                );
              }
              return (
                <span className="flex items-center gap-1 text-yellow-600">
                  <Info className="h-3 w-3" />
                  Path is outside of configured zones
                </span>
              );
            })()}
          </div>
        )}
      </div>

      {/* Quick zone selection */}
      {zones.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Quick Select Zone</Label>
          <div className="flex flex-wrap gap-2">
            {zones.slice(0, 5).map((zone) => {
              const pool = pools.find(p => p.id === zone.pool_id);
              if (!pool) return null;
              const fullPath = `${pool.path}/${zone.path}`.replace(/\/+/g, "/");
              return (
                <Button
                  key={zone.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setFormPath(fullPath)}
                  className="text-xs"
                >
                  <Folder className="h-3 w-3 mr-1" />
                  {zone.name}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {/* Assign to */}
      <div className="space-y-2">
        <Label>Assign to</Label>
        <Select value={assignType} onValueChange={(v) => setAssignType(v as "user" | "group")}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="user">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4" />
                User
              </div>
            </SelectItem>
            <SelectItem value="group">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Group
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* User/Group selection */}
      {assignType === "user" ? (
        <div className="space-y-2">
          <Label htmlFor="perm-user">User</Label>
          <Select value={formUsername} onValueChange={setFormUsername}>
            <SelectTrigger>
              <SelectValue placeholder="Select a user..." />
            </SelectTrigger>
            <SelectContent>
              {systemUsers.map((user) => (
                <SelectItem key={user.username} value={user.username}>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    {user.username} {user.name && <span className="text-muted-foreground">({user.name})</span>}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="perm-group">Group</Label>
          <Select value={formGroup} onValueChange={setFormGroup}>
            <SelectTrigger>
              <SelectValue placeholder="Select a group..." />
            </SelectTrigger>
            <SelectContent>
              {/* Filter to show only user groups (GID >= 1000) plus useful system groups */}
              {systemGroups
                .filter((group) =>
                  group.gid >= 1000 ||
                  ["wheel", "sudo", "admin", "users", "staff", "docker"].includes(group.name)
                )
                .map((group) => (
                  <SelectItem key={group.name} value={group.name}>
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      {group.name}
                      {group.gid < 1000 && (
                        <span className="text-muted-foreground text-xs">(system)</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Permission level */}
      <div className="space-y-2">
        <Label htmlFor="perm-access">Permission Level</Label>
        <Select value={formType} onValueChange={(v) => setFormType(v as "read" | "write" | "delete")}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="read">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-blue-500" />
                <div>
                  <div>Read Only</div>
                  <div className="text-xs text-muted-foreground">View and download files</div>
                </div>
              </div>
            </SelectItem>
            <SelectItem value="write">
              <div className="flex items-center gap-2">
                <FileEdit className="h-4 w-4 text-yellow-500" />
                <div>
                  <div>Read &amp; Write</div>
                  <div className="text-xs text-muted-foreground">Upload and modify files</div>
                </div>
              </div>
            </SelectItem>
            <SelectItem value="delete">
              <div className="flex items-center gap-2">
                <Trash className="h-4 w-4 text-red-500" />
                <div>
                  <div>Full Access</div>
                  <div className="text-xs text-muted-foreground">Read, write, and delete</div>
                </div>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Permissions Management" />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Page Header */}
            <div className="flex justify-between items-center">
              <div>
                <p className="text-muted-foreground">
                  Manage file and folder access permissions for the web interface
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="icon" onClick={loadData} disabled={isLoading}>
                  <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                </Button>
                <Button onClick={() => { resetForm(); setIsAddDialogOpen(true); }}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Permission
                </Button>
              </div>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="permissions" className="gap-2">
                  <Shield className="h-4 w-4" />
                  Permissions ({permissions.length})
                </TabsTrigger>
                <TabsTrigger value="zones" className="gap-2">
                  <Folder className="h-4 w-4" />
                  Zones ({zones.length})
                </TabsTrigger>
              </TabsList>

              {/* Permissions Tab */}
              <TabsContent value="permissions" className="space-y-4">
                {/* Info Card */}
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-start space-x-3">
                      <Info className="h-5 w-5 text-blue-500 mt-0.5" />
                      <div className="space-y-2 text-sm">
                        <p>
                          These permissions control access to files through the <strong>web interface only</strong>.
                          For SMB/NFS share permissions, configure them in the Zone settings.
                        </p>
                        <div className="flex flex-wrap gap-4">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">
                              <Eye className="h-3 w-3 mr-1" />
                              read
                            </Badge>
                            <span className="text-muted-foreground">View &amp; download</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">
                              <FileEdit className="h-3 w-3 mr-1" />
                              write
                            </Badge>
                            <span className="text-muted-foreground">Upload &amp; modify</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="default">
                              <Trash className="h-3 w-3 mr-1" />
                              delete
                            </Badge>
                            <span className="text-muted-foreground">Full access</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Search */}
                <div className="flex items-center gap-4">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="search"
                      placeholder="Search by path, username, or group..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>

                {/* Permissions grouped by path */}
                <div className="space-y-4">
                  {isLoading ? (
                    <Card>
                      <CardContent className="py-8 text-center text-muted-foreground">
                        Loading permissions...
                      </CardContent>
                    </Card>
                  ) : Object.keys(groupedPermissions).length === 0 ? (
                    <Card>
                      <CardContent className="py-8 text-center">
                        <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                        <h3 className="text-lg font-medium mb-2">No Permissions Configured</h3>
                        <p className="text-muted-foreground mb-4">
                          Admins have full access by default. Add permissions to grant access to non-admin users.
                        </p>
                        <Button onClick={() => { resetForm(); setIsAddDialogOpen(true); }}>
                          <Plus className="mr-2 h-4 w-4" />
                          Add First Permission
                        </Button>
                      </CardContent>
                    </Card>
                  ) : (
                    Object.entries(groupedPermissions).map(([basePath, perms]) => (
                      <Card key={basePath}>
                        <Collapsible
                          open={expandedPaths.has(basePath)}
                          onOpenChange={() => togglePath(basePath)}
                        >
                          <CollapsibleTrigger asChild>
                            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  {expandedPaths.has(basePath) ? (
                                    <ChevronDown className="h-5 w-5" />
                                  ) : (
                                    <ChevronRight className="h-5 w-5" />
                                  )}
                                  <FolderOpen className="h-5 w-5 text-yellow-500" />
                                  <div>
                                    <CardTitle className="font-mono text-sm">{basePath}</CardTitle>
                                    <CardDescription>
                                      {perms.length} permission{perms.length !== 1 ? "s" : ""}
                                      {(() => {
                                        const zoneInfo = getZoneForPath(basePath);
                                        if (zoneInfo) {
                                          return ` • Zone: ${zoneInfo.zone.name}`;
                                        }
                                        return "";
                                      })()}
                                    </CardDescription>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {perms.some(p => p.type === "delete") && (
                                    <Badge variant="default" className="text-xs">Full</Badge>
                                  )}
                                  {perms.some(p => p.type === "write") && !perms.some(p => p.type === "delete") && (
                                    <Badge variant="secondary" className="text-xs">Write</Badge>
                                  )}
                                  {perms.every(p => p.type === "read") && (
                                    <Badge variant="outline" className="text-xs">Read</Badge>
                                  )}
                                </div>
                              </div>
                            </CardHeader>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <CardContent className="pt-0">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Path</TableHead>
                                    <TableHead>User/Group</TableHead>
                                    <TableHead>Access</TableHead>
                                    <TableHead>Created</TableHead>
                                    <TableHead className="w-24"></TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {perms.map((permission) => (
                                    <TableRow key={permission.id}>
                                      <TableCell className="font-mono text-sm">
                                        {permission.path}
                                      </TableCell>
                                      <TableCell>
                                        <div className="flex items-center gap-2">
                                          {permission.username ? (
                                            <User className="h-4 w-4 text-muted-foreground" />
                                          ) : (
                                            <Users className="h-4 w-4 text-muted-foreground" />
                                          )}
                                          <span className="font-medium">
                                            {permission.username || permission.group || "-"}
                                          </span>
                                          {permission.group && (
                                            <Badge variant="outline" className="text-xs">group</Badge>
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                        <Badge variant={getAccessBadgeVariant(permission.type)}>
                                          <span className="flex items-center gap-1">
                                            {getPermissionIcon(permission.type)}
                                            {permission.type}
                                          </span>
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="text-muted-foreground">
                                        {new Date(permission.created_at).toLocaleDateString()}
                                      </TableCell>
                                      <TableCell>
                                        <div className="flex gap-1">
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => openEditDialog(permission)}
                                          >
                                            <Pencil className="h-4 w-4" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => openDeleteDialog(permission)}
                                            className="text-destructive hover:text-destructive"
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </CardContent>
                          </CollapsibleContent>
                        </Collapsible>
                      </Card>
                    ))
                  )}
                </div>

                {/* Summary */}
                {permissions.length > 0 && (
                  <div className="text-sm text-muted-foreground">
                    Showing {filteredPermissions.length} of {permissions.length} permissions
                  </div>
                )}
              </TabsContent>

              {/* Zones Tab - Quick overview for adding permissions */}
              <TabsContent value="zones" className="space-y-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-start space-x-3">
                      <Info className="h-5 w-5 text-blue-500 mt-0.5" />
                      <p className="text-sm text-muted-foreground">
                        Quickly add permissions for your configured zones. Click &quot;Add Permission&quot; on any zone to grant access.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {zones.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center">
                      <Folder className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                      <h3 className="text-lg font-medium mb-2">No Zones Configured</h3>
                      <p className="text-muted-foreground mb-4">
                        Create zones in Storage → Zones to organize your shared folders.
                      </p>
                      <Button variant="outline" onClick={() => router.push("/admin/storage/zones")}>
                        <ArrowRight className="mr-2 h-4 w-4" />
                        Go to Zones
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {zones.map((zone) => {
                      const pool = pools.find(p => p.id === zone.pool_id);
                      if (!pool) return null;
                      const fullPath = `${pool.path}/${zone.path}`.replace(/\/+/g, "/");
                      const zonePermissions = permissions.filter(p => p.path.startsWith(fullPath));

                      return (
                        <Card key={zone.id}>
                          <CardHeader className="pb-2">
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-2">
                                <FolderOpen className="h-5 w-5 text-yellow-500" />
                                <div>
                                  <CardTitle className="text-base">{zone.name}</CardTitle>
                                  <CardDescription className="font-mono text-xs">
                                    {fullPath}
                                  </CardDescription>
                                </div>
                              </div>
                              {zone.enabled ? (
                                <Badge variant="outline" className="text-green-600 border-green-600">
                                  Active
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-muted-foreground">
                                  Disabled
                                </Badge>
                              )}
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-3">
                              <div className="text-sm text-muted-foreground">
                                <div className="flex items-center justify-between">
                                  <span>Pool:</span>
                                  <span className="font-medium text-foreground">{pool.name}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span>Permissions:</span>
                                  <span className="font-medium text-foreground">{zonePermissions.length}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span>SMB:</span>
                                  {zone.smb_enabled ? (
                                    <Badge variant="outline" className="text-xs">Enabled</Badge>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </div>
                              </div>

                              {zonePermissions.length > 0 && (
                                <div className="pt-2 border-t">
                                  <p className="text-xs text-muted-foreground mb-2">Users/Groups with access:</p>
                                  <div className="flex flex-wrap gap-1">
                                    {zonePermissions.slice(0, 3).map(p => (
                                      <Badge key={p.id} variant="secondary" className="text-xs">
                                        {p.username || p.group}
                                      </Badge>
                                    ))}
                                    {zonePermissions.length > 3 && (
                                      <Badge variant="outline" className="text-xs">
                                        +{zonePermissions.length - 3} more
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              )}

                              <Button
                                className="w-full"
                                variant="outline"
                                size="sm"
                                onClick={() => quickAddFromZone(zone, pool)}
                              >
                                <Plus className="h-4 w-4 mr-2" />
                                Add Permission
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>

      {/* Add Permission Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
        setIsAddDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add New Permission</DialogTitle>
            <DialogDescription>
              Grant access to a specific path for a user or group.
            </DialogDescription>
          </DialogHeader>
          <PermissionForm />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddPermission}>Add Permission</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Permission Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={(open) => {
        setIsEditDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Permission</DialogTitle>
            <DialogDescription>
              Modify the permission settings.
            </DialogDescription>
          </DialogHeader>
          <PermissionForm />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditPermission}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Permission</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this permission for{" "}
              <strong>{permissionToDelete?.username || permissionToDelete?.group}</strong> on{" "}
              <code className="bg-muted px-1 rounded">{permissionToDelete?.path}</code>?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePermission}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Path Browser Dialog */}
      <Dialog open={isBrowseDialogOpen} onOpenChange={setIsBrowseDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Browse Folders</DialogTitle>
            <DialogDescription>
              Navigate to select a folder path.
            </DialogDescription>
          </DialogHeader>

          {/* Current path breadcrumb */}
          <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
            <Button variant="ghost" size="icon" onClick={() => loadBrowseDirectory("/")}>
              <Home className="h-4 w-4" />
            </Button>
            {browsePath !== "/" && (
              <>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                <Button variant="ghost" size="sm" onClick={navigateUp}>
                  ..
                </Button>
              </>
            )}
            <span className="font-mono text-sm flex-1 truncate">{browsePath}</span>
          </div>

          {/* Directory listing */}
          <ScrollArea className="h-[400px] border rounded-lg">
            {browseLoading ? (
              <div className="p-8 text-center text-muted-foreground">Loading...</div>
            ) : browseEntries.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Folder className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No subdirectories</p>
              </div>
            ) : (
              <div className="p-2">
                {browseEntries
                  .filter(e => e.is_dir)
                  .map((entry) => (
                    <div
                      key={entry.path}
                      className="flex items-center justify-between p-2 hover:bg-muted rounded-lg cursor-pointer group"
                      onClick={() => loadBrowseDirectory(entry.path)}
                    >
                      <div className="flex items-center gap-2">
                        <Folder className="h-5 w-5 text-yellow-500" />
                        <span>{entry.name}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          selectBrowsePath(entry.path);
                        }}
                      >
                        Select
                      </Button>
                    </div>
                  ))}
              </div>
            )}
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBrowseDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => selectBrowsePath(browsePath)}>
              Select Current: {browsePath}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
