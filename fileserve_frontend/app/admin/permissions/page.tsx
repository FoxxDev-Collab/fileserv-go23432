"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  DialogTrigger,
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
import { Label } from "@/components/ui/label";
import { Shield, Plus, Trash2, RefreshCw, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { PageSkeleton } from "@/components/skeletons";
import {
  permissionsAPI,
  systemUsersAPI,
  Permission,
  SystemUser,
  SystemGroup,
} from "@/lib/api";

export default function PermissionsPage() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [systemUsers, setSystemUsers] = useState<SystemUser[]>([]);
  const [systemGroups, setSystemGroups] = useState<SystemGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user: currentUser, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  // Form state
  const [editingPermission, setEditingPermission] = useState<Permission | null>(null);
  const [permissionToDelete, setPermissionToDelete] = useState<Permission | null>(null);
  const [formPath, setFormPath] = useState("");
  const [formUsername, setFormUsername] = useState("");
  const [formGroup, setFormGroup] = useState("");
  const [formType, setFormType] = useState<"read" | "write" | "delete">("read");
  const [assignType, setAssignType] = useState<"user" | "group">("user");

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
      const [permsData, usersData, groupsData] = await Promise.all([
        permissionsAPI.list(),
        systemUsersAPI.list(false),
        systemUsersAPI.listGroups(),
      ]);
      setPermissions(permsData || []);
      setSystemUsers(usersData || []);
      setSystemGroups(groupsData || []);
    } catch (error) {
      console.error("Failed to load data:", error);
      toast.error("Failed to load permissions");
      // Set empty arrays on error
      setPermissions([]);
      setSystemUsers([]);
      setSystemGroups([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && currentUser?.role === "admin") {
      loadData();
    }
  }, [isAuthenticated, currentUser, loadData]);

  const filteredPermissions = permissions.filter(
    (perm) =>
      perm.path.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (perm.username && perm.username.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (perm.group && perm.group.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const resetForm = () => {
    setFormPath("");
    setFormUsername("");
    setFormGroup("");
    setFormType("read");
    setAssignType("user");
    setEditingPermission(null);
  };

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

  const openDeleteDialog = (permission: Permission) => {
    setPermissionToDelete(permission);
    setIsDeleteDialogOpen(true);
  };

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

  const getAccessBadgeVariant = (perm: Permission) => {
    if (perm.type === "delete") return "default";
    if (perm.type === "write") return "secondary";
    return "outline";
  };

  const getAccessLabel = (perm: Permission) => {
    return perm.type || "read";
  };

  // Show skeleton during initial auth check (only if no cached user)
  if (authLoading && !currentUser) {
    return <PageSkeleton title="Permissions" />;
  }

  // Not authenticated or not admin - will redirect, show skeleton in meantime
  if (!isAuthenticated || (currentUser && currentUser.role !== "admin")) {
    return <PageSkeleton title="Permissions" />;
  }

  const PermissionForm = () => (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label htmlFor="perm-path">Path</Label>
        <Input
          id="perm-path"
          placeholder="/path/to/folder"
          value={formPath}
          onChange={(e) => setFormPath(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>Assign to</Label>
        <Select value={assignType} onValueChange={(v) => setAssignType(v as "user" | "group")}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="user">User</SelectItem>
            <SelectItem value="group">Group</SelectItem>
          </SelectContent>
        </Select>
      </div>

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
                  {user.username} {user.name && `(${user.name})`}
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
              {systemGroups.map((group) => (
                <SelectItem key={group.name} value={group.name}>
                  {group.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="perm-access">Permission Level</Label>
        <Select value={formType} onValueChange={(v) => setFormType(v as "read" | "write" | "delete")}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="read">Read Only</SelectItem>
            <SelectItem value="write">Read &amp; Write</SelectItem>
            <SelectItem value="delete">Full Access (Read, Write, Delete)</SelectItem>
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
              <p className="text-muted-foreground">
                Manage file and folder access permissions
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="icon" onClick={loadData} disabled={isLoading}>
                  <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                </Button>
                <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
                  setIsAddDialogOpen(open);
                  if (!open) resetForm();
                }}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Permission
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
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
              </div>
            </div>

            {/* Search */}
            <div>
              <Input
                type="search"
                placeholder="Search by path, username, or group..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-md"
              />
            </div>

            {/* Info Card */}
            <div className="border rounded-lg p-4 bg-muted/50">
              <div className="flex items-start space-x-3">
                <Shield className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">Permission Levels</p>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li><Badge variant="outline" className="mr-2">read</Badge> View and download files</li>
                    <li><Badge variant="secondary" className="mr-2">write</Badge> Upload and modify files</li>
                    <li><Badge variant="default" className="mr-2">delete</Badge> Full access including deletion</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Permissions Table */}
            <div className="border rounded-lg">
              {isLoading ? (
                <div className="p-8 text-center text-muted-foreground">Loading permissions...</div>
              ) : permissions.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  No permissions configured. Admins have full access by default.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Path</TableHead>
                      <TableHead>User/Group</TableHead>
                      <TableHead>Access Level</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="w-24"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPermissions.map((permission) => (
                      <TableRow key={permission.id}>
                        <TableCell className="font-mono text-sm">{permission.path}</TableCell>
                        <TableCell className="font-medium">
                          {permission.username || permission.group || "-"}
                          {permission.group && (
                            <Badge variant="outline" className="ml-2">group</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={getAccessBadgeVariant(permission)}>
                            {getAccessLabel(permission)}
                          </Badge>
                        </TableCell>
                        <TableCell>
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
              )}
            </div>

            {/* Summary */}
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                Showing {filteredPermissions.length} of {permissions.length} permissions
              </p>
            </div>
          </div>
        </main>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={(open) => {
        setIsEditDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent>
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
    </div>
  );
}
