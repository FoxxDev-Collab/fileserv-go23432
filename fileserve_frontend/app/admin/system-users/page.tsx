"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RefreshCw, Eye, Users, Plus, MoreVertical, Pencil, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { systemUsersAPI, SystemUser, SystemGroup, CreateUserRequest, UpdateUserRequest } from "@/lib/api";
import { PageSkeleton } from "@/components/skeletons";

const COMMON_SHELLS = [
  "/bin/bash",
  "/bin/sh",
  "/bin/zsh",
  "/usr/bin/bash",
  "/usr/bin/zsh",
  "/usr/sbin/nologin",
  "/bin/false",
];

export default function SystemUsersPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [groups, setGroups] = useState<SystemGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [includeSystem, setIncludeSystem] = useState(false);
  const [selectedUser, setSelectedUser] = useState<SystemUser | null>(null);
  const [showGroupsDialog, setShowGroupsDialog] = useState(false);
  const { user: currentUser, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  // Create user dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createForm, setCreateForm] = useState<CreateUserRequest>({
    username: "",
    password: "",
    name: "",
    shell: "/bin/bash",
    groups: [],
  });
  const [isCreating, setIsCreating] = useState(false);

  // Edit user dialog state
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<SystemUser | null>(null);
  const [editForm, setEditForm] = useState<UpdateUserRequest>({});
  const [isEditing, setIsEditing] = useState(false);

  // Delete user dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingUser, setDeletingUser] = useState<SystemUser | null>(null);
  const [deleteRemoveHome, setDeleteRemoveHome] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Redirect if not authenticated or not admin
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
    } else if (!authLoading && currentUser?.role !== "admin") {
      router.push("/dashboard");
      toast.error("Admin access required");
    }
  }, [authLoading, isAuthenticated, currentUser, router]);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const data = await systemUsersAPI.list(includeSystem);
      setUsers(data || []);
    } catch (error) {
      console.error("Failed to load system users:", error);
      toast.error("Failed to load system users");
    } finally {
      setIsLoading(false);
    }
  };

  const loadGroups = async () => {
    try {
      const data = await systemUsersAPI.listGroups();
      setGroups(data || []);
    } catch (error) {
      console.error("Failed to load system groups:", error);
    }
  };

  useEffect(() => {
    if (isAuthenticated && currentUser?.role === "admin") {
      loadUsers();
      loadGroups();
    }
  }, [isAuthenticated, currentUser, includeSystem]);

  const filteredUsers = users.filter(
    (user) =>
      user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleViewUser = async (username: string) => {
    try {
      const user = await systemUsersAPI.get(username);
      setSelectedUser(user);
    } catch (error) {
      console.error("Failed to get user details:", error);
      toast.error("Failed to get user details");
    }
  };

  const handleCreateUser = async () => {
    if (!createForm.username || !createForm.password) {
      toast.error("Username and password are required");
      return;
    }

    setIsCreating(true);
    try {
      await systemUsersAPI.create(createForm);
      toast.success(`User "${createForm.username}" created successfully`);
      setShowCreateDialog(false);
      setCreateForm({
        username: "",
        password: "",
        name: "",
        shell: "/bin/bash",
        groups: [],
      });
      loadUsers();
    } catch (error: unknown) {
      console.error("Failed to create user:", error);
      const message = error instanceof Error ? error.message : "Failed to create user";
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleEditUser = async () => {
    if (!editingUser) return;

    setIsEditing(true);
    try {
      await systemUsersAPI.update(editingUser.username, editForm);
      toast.success(`User "${editingUser.username}" updated successfully`);
      setShowEditDialog(false);
      setEditingUser(null);
      setEditForm({});
      loadUsers();
    } catch (error: unknown) {
      console.error("Failed to update user:", error);
      const message = error instanceof Error ? error.message : "Failed to update user";
      toast.error(message);
    } finally {
      setIsEditing(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;

    setIsDeleting(true);
    try {
      await systemUsersAPI.delete(deletingUser.username, deleteRemoveHome);
      toast.success(`User "${deletingUser.username}" deleted successfully`);
      setShowDeleteDialog(false);
      setDeletingUser(null);
      setDeleteRemoveHome(false);
      loadUsers();
    } catch (error: unknown) {
      console.error("Failed to delete user:", error);
      const message = error instanceof Error ? error.message : "Failed to delete user";
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  };

  const openEditDialog = (user: SystemUser) => {
    setEditingUser(user);
    setEditForm({
      name: user.name,
      shell: user.shell,
      groups: user.groups,
    });
    setShowEditDialog(true);
  };

  const openDeleteDialog = (user: SystemUser) => {
    setDeletingUser(user);
    setDeleteRemoveHome(false);
    setShowDeleteDialog(true);
  };

  const toggleGroupInCreate = (groupName: string) => {
    setCreateForm((prev) => ({
      ...prev,
      groups: prev.groups?.includes(groupName)
        ? prev.groups.filter((g) => g !== groupName)
        : [...(prev.groups || []), groupName],
    }));
  };

  const toggleGroupInEdit = (groupName: string) => {
    setEditForm((prev) => ({
      ...prev,
      groups: prev.groups?.includes(groupName)
        ? prev.groups.filter((g) => g !== groupName)
        : [...(prev.groups || []), groupName],
    }));
  };

  // Show skeleton during initial auth check (only if no cached user)
  if (authLoading && !currentUser) {
    return <PageSkeleton title="System Users" />;
  }

  // Not authenticated or not admin - will redirect, show skeleton in meantime
  if (!isAuthenticated || (currentUser && currentUser.role !== "admin")) {
    return <PageSkeleton title="System Users" />;
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="System Users" />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Page Header */}
            <div className="flex justify-between items-center">
              <p className="text-muted-foreground">
                Manage local system users for file share access
              </p>
              <div className="flex gap-2">
                <Button onClick={() => setShowCreateDialog(true)}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Create User
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowGroupsDialog(true)}
                >
                  <Users className="mr-2 h-4 w-4" />
                  View Groups
                </Button>
                <Button variant="outline" size="icon" onClick={loadUsers} disabled={isLoading}>
                  <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>

            {/* Filters */}
            <div className="flex gap-4 items-center">
              <Input
                type="search"
                placeholder="Search users by username or name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-md"
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={includeSystem}
                  onChange={(e) => setIncludeSystem(e.target.checked)}
                  className="rounded border-input"
                />
                Show system accounts
              </label>
            </div>

            {/* Users Table */}
            <div className="border rounded-lg">
              {isLoading ? (
                <div className="p-8 text-center text-muted-foreground">Loading users...</div>
              ) : filteredUsers.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  {searchTerm ? "No users match your search" : "No users found"}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Username</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>UID/GID</TableHead>
                      <TableHead>Groups</TableHead>
                      <TableHead>Home</TableHead>
                      <TableHead>Shell</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((user) => (
                      <TableRow key={user.username}>
                        <TableCell className="font-medium">
                          {user.username}
                          {user.is_system && (
                            <Badge variant="outline" className="ml-2 text-xs">system</Badge>
                          )}
                        </TableCell>
                        <TableCell>{user.name || "-"}</TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-1 rounded">
                            {user.uid}:{user.gid}
                          </code>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {user.groups.slice(0, 3).map((group) => (
                              <Badge key={group} variant="secondary" className="text-xs">
                                {group}
                              </Badge>
                            ))}
                            {user.groups.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{user.groups.length - 3}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs truncate max-w-[200px]" title={user.home_dir}>
                          {user.home_dir}
                        </TableCell>
                        <TableCell className="font-mono text-xs truncate max-w-[150px]" title={user.shell}>
                          {user.shell.split('/').pop()}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleViewUser(user.username)}>
                                <Eye className="mr-2 h-4 w-4" />
                                View Details
                              </DropdownMenuItem>
                              {!user.is_system && user.username !== "root" && (
                                <>
                                  <DropdownMenuItem onClick={() => openEditDialog(user)}>
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Edit User
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => openDeleteDialog(user)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete User
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            {/* Pagination */}
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                Showing {filteredUsers.length} of {users.length} users
              </p>
            </div>
          </div>
        </main>
      </div>

      {/* User Details Dialog */}
      <Dialog open={selectedUser !== null} onOpenChange={() => setSelectedUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>User Details: {selectedUser?.username}</DialogTitle>
            <DialogDescription>
              System user information
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Username:</span>
                  <p className="font-medium">{selectedUser.username}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Full Name:</span>
                  <p className="font-medium">{selectedUser.name || "-"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">UID:</span>
                  <p className="font-mono">{selectedUser.uid}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">GID:</span>
                  <p className="font-mono">{selectedUser.gid}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Home Directory:</span>
                  <p className="font-mono text-xs break-all">{selectedUser.home_dir}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Shell:</span>
                  <p className="font-mono text-xs">{selectedUser.shell}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Groups:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedUser.groups.map((group) => (
                      <Badge key={group} variant="secondary" className="text-xs">
                        {group}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create User Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
            <DialogDescription>
              Create a new system user account
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="create-username">Username *</Label>
              <Input
                id="create-username"
                placeholder="username"
                value={createForm.username}
                onChange={(e) => setCreateForm({ ...createForm, username: e.target.value.toLowerCase() })}
              />
              <p className="text-xs text-muted-foreground">
                Lowercase letters, numbers, underscores, and hyphens only
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-password">Password *</Label>
              <Input
                id="create-password"
                type="password"
                placeholder="Password"
                value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-name">Full Name</Label>
              <Input
                id="create-name"
                placeholder="John Doe"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-shell">Shell</Label>
              <Select
                value={createForm.shell}
                onValueChange={(value) => setCreateForm({ ...createForm, shell: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select shell" />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_SHELLS.map((shell) => (
                    <SelectItem key={shell} value={shell}>
                      {shell}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Groups</Label>
              <div className="border rounded-md p-3 max-h-32 overflow-y-auto space-y-2">
                {groups.filter(g => g.gid >= 1000 || ["sudo", "wheel", "admin", "users", "docker"].includes(g.name)).map((group) => (
                  <label key={group.name} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={createForm.groups?.includes(group.name)}
                      onCheckedChange={() => toggleGroupInCreate(group.name)}
                    />
                    {group.name}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateUser} disabled={isCreating}>
              {isCreating ? "Creating..." : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User: {editingUser?.username}</DialogTitle>
            <DialogDescription>
              Modify user account settings
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-password">New Password</Label>
              <Input
                id="edit-password"
                type="password"
                placeholder="Leave blank to keep current"
                value={editForm.password || ""}
                onChange={(e) => setEditForm({ ...editForm, password: e.target.value || undefined })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-name">Full Name</Label>
              <Input
                id="edit-name"
                placeholder="John Doe"
                value={editForm.name || ""}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-shell">Shell</Label>
              <Select
                value={editForm.shell}
                onValueChange={(value) => setEditForm({ ...editForm, shell: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select shell" />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_SHELLS.map((shell) => (
                    <SelectItem key={shell} value={shell}>
                      {shell}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Groups</Label>
              <div className="border rounded-md p-3 max-h-32 overflow-y-auto space-y-2">
                {groups.filter(g => g.gid >= 1000 || ["sudo", "wheel", "admin", "users", "docker"].includes(g.name)).map((group) => (
                  <label key={group.name} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={editForm.groups?.includes(group.name)}
                      onCheckedChange={() => toggleGroupInEdit(group.name)}
                    />
                    {group.name}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditUser} disabled={isEditing}>
              {isEditing ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User: {deletingUser?.username}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this user? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={deleteRemoveHome}
                onCheckedChange={(checked) => setDeleteRemoveHome(checked === true)}
              />
              Also remove home directory ({deletingUser?.home_dir})
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete User"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Groups Dialog */}
      <Dialog open={showGroupsDialog} onOpenChange={setShowGroupsDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>System Groups</DialogTitle>
            <DialogDescription>
              All groups available on the system
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Group Name</TableHead>
                  <TableHead>GID</TableHead>
                  <TableHead>Members</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((group) => (
                  <TableRow key={group.name}>
                    <TableCell className="font-medium">{group.name}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1 rounded">{group.gid}</code>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {group.members.length > 0 ? (
                          group.members.slice(0, 5).map((member) => (
                            <Badge key={member} variant="outline" className="text-xs">
                              {member}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-muted-foreground text-xs">No explicit members</span>
                        )}
                        {group.members.length > 5 && (
                          <Badge variant="outline" className="text-xs">
                            +{group.members.length - 5}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
