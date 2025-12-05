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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RefreshCw, Users, Plus, MoreVertical, Pencil, Trash2, UserPlus, UserMinus, Shield } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { systemUsersAPI, SystemUser, SystemGroup } from "@/lib/api";
import { PageSkeleton } from "@/components/skeletons";

// Critical system groups that cannot be modified/deleted
const CRITICAL_GROUPS = ["root", "wheel", "sudo", "adm", "bin", "daemon", "sys", "nobody", "users"];

export default function GroupsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [groups, setGroups] = useState<SystemGroup[]>([]);
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showSystemGroups, setShowSystemGroups] = useState(false);
  const { user: currentUser, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  // Create group dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", gid: "" });
  const [isCreating, setIsCreating] = useState(false);

  // Edit group dialog state
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingGroup, setEditingGroup] = useState<SystemGroup | null>(null);
  const [editForm, setEditForm] = useState({ new_name: "" });
  const [isEditing, setIsEditing] = useState(false);

  // Delete group dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState<SystemGroup | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Manage members dialog state
  const [showMembersDialog, setShowMembersDialog] = useState(false);
  const [managingGroup, setManagingGroup] = useState<SystemGroup | null>(null);
  const [isMemberLoading, setIsMemberLoading] = useState(false);

  // Redirect if not authenticated or not admin
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
    } else if (!authLoading && currentUser?.role !== "admin") {
      router.push("/dashboard");
      toast.error("Admin access required");
    }
  }, [authLoading, isAuthenticated, currentUser, router]);

  const loadGroups = async () => {
    setIsLoading(true);
    try {
      const data = await systemUsersAPI.listGroups();
      setGroups(data || []);
    } catch (error) {
      console.error("Failed to load groups:", error);
      toast.error("Failed to load groups");
    } finally {
      setIsLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const data = await systemUsersAPI.list(true);
      setUsers(data || []);
    } catch (error) {
      console.error("Failed to load users:", error);
    }
  };

  useEffect(() => {
    if (isAuthenticated && currentUser?.role === "admin") {
      loadGroups();
      loadUsers();
    }
  }, [isAuthenticated, currentUser]);

  // Filter groups - show user-created groups (GID >= 1000) unless system groups are enabled
  const filteredGroups = groups.filter((group) => {
    const matchesSearch = group.name.toLowerCase().includes(searchTerm.toLowerCase());
    const isSystemGroup = group.gid < 1000;
    return matchesSearch && (showSystemGroups || !isSystemGroup);
  });

  const isCriticalGroup = (name: string) => CRITICAL_GROUPS.includes(name);

  const handleCreateGroup = async () => {
    if (!createForm.name) {
      toast.error("Group name is required");
      return;
    }

    setIsCreating(true);
    try {
      const data: { name: string; gid?: number } = { name: createForm.name };
      if (createForm.gid) {
        data.gid = parseInt(createForm.gid, 10);
      }
      await systemUsersAPI.createGroup(data);
      toast.success(`Group "${createForm.name}" created successfully`);
      setShowCreateDialog(false);
      setCreateForm({ name: "", gid: "" });
      loadGroups();
    } catch (error: unknown) {
      console.error("Failed to create group:", error);
      const message = error instanceof Error ? error.message : "Failed to create group";
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleEditGroup = async () => {
    if (!editingGroup || !editForm.new_name) {
      toast.error("New group name is required");
      return;
    }

    setIsEditing(true);
    try {
      await systemUsersAPI.updateGroup(editingGroup.name, { new_name: editForm.new_name });
      toast.success(`Group renamed to "${editForm.new_name}" successfully`);
      setShowEditDialog(false);
      setEditingGroup(null);
      setEditForm({ new_name: "" });
      loadGroups();
    } catch (error: unknown) {
      console.error("Failed to rename group:", error);
      const message = error instanceof Error ? error.message : "Failed to rename group";
      toast.error(message);
    } finally {
      setIsEditing(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (!deletingGroup) return;

    setIsDeleting(true);
    try {
      await systemUsersAPI.deleteGroup(deletingGroup.name);
      toast.success(`Group "${deletingGroup.name}" deleted successfully`);
      setShowDeleteDialog(false);
      setDeletingGroup(null);
      loadGroups();
    } catch (error: unknown) {
      console.error("Failed to delete group:", error);
      const message = error instanceof Error ? error.message : "Failed to delete group";
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAddMember = async (username: string) => {
    if (!managingGroup) return;

    setIsMemberLoading(true);
    try {
      const updatedGroup = await systemUsersAPI.addGroupMember(managingGroup.name, username);
      setManagingGroup(updatedGroup);
      toast.success(`Added "${username}" to group "${managingGroup.name}"`);
      loadGroups();
    } catch (error: unknown) {
      console.error("Failed to add member:", error);
      const message = error instanceof Error ? error.message : "Failed to add member";
      toast.error(message);
    } finally {
      setIsMemberLoading(false);
    }
  };

  const handleRemoveMember = async (username: string) => {
    if (!managingGroup) return;

    setIsMemberLoading(true);
    try {
      const updatedGroup = await systemUsersAPI.removeGroupMember(managingGroup.name, username);
      setManagingGroup(updatedGroup);
      toast.success(`Removed "${username}" from group "${managingGroup.name}"`);
      loadGroups();
    } catch (error: unknown) {
      console.error("Failed to remove member:", error);
      const message = error instanceof Error ? error.message : "Failed to remove member";
      toast.error(message);
    } finally {
      setIsMemberLoading(false);
    }
  };

  const openEditDialog = (group: SystemGroup) => {
    setEditingGroup(group);
    setEditForm({ new_name: group.name });
    setShowEditDialog(true);
  };

  const openDeleteDialog = (group: SystemGroup) => {
    setDeletingGroup(group);
    setShowDeleteDialog(true);
  };

  const openMembersDialog = (group: SystemGroup) => {
    setManagingGroup(group);
    setShowMembersDialog(true);
  };

  // Get users who are not members of the current group
  const availableUsers = users.filter(
    (user) => !user.is_system && !managingGroup?.members.includes(user.username)
  );

  // Show skeleton during initial auth check (only if no cached user)
  if (authLoading && !currentUser) {
    return <PageSkeleton title="Group Management" />;
  }

  // Not authenticated or not admin - will redirect, show skeleton in meantime
  if (!isAuthenticated || (currentUser && currentUser.role !== "admin")) {
    return <PageSkeleton title="Group Management" />;
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Group Management" />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Page Header */}
            <div className="flex justify-between items-center">
              <p className="text-muted-foreground">
                Manage system groups for access control and permissions
              </p>
              <div className="flex gap-2">
                <Button onClick={() => setShowCreateDialog(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Group
                </Button>
                <Button variant="outline" size="icon" onClick={loadGroups} disabled={isLoading}>
                  <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>

            {/* Filters */}
            <div className="flex gap-4 items-center">
              <Input
                type="search"
                placeholder="Search groups by name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-md"
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showSystemGroups}
                  onChange={(e) => setShowSystemGroups(e.target.checked)}
                  className="rounded border-input"
                />
                Show system groups
              </label>
            </div>

            {/* Groups Table */}
            <div className="border rounded-lg">
              {isLoading ? (
                <div className="p-8 text-center text-muted-foreground">Loading groups...</div>
              ) : filteredGroups.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  {searchTerm ? "No groups match your search" : "No groups found"}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Group Name</TableHead>
                      <TableHead>GID</TableHead>
                      <TableHead>Members</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredGroups.map((group) => (
                      <TableRow key={group.name}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            {group.name}
                            {isCriticalGroup(group.name) && (
                              <span title="Critical system group">
                                <Shield className="h-4 w-4 text-orange-500" />
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-1 rounded">{group.gid}</code>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {group.members.length > 0 ? (
                              <>
                                {group.members.slice(0, 4).map((member) => (
                                  <Badge key={member} variant="outline" className="text-xs">
                                    {member}
                                  </Badge>
                                ))}
                                {group.members.length > 4 && (
                                  <Badge variant="secondary" className="text-xs">
                                    +{group.members.length - 4} more
                                  </Badge>
                                )}
                              </>
                            ) : (
                              <span className="text-muted-foreground text-xs">No members</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {group.gid < 1000 ? (
                            <Badge variant="outline" className="text-xs">System</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">User</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openMembersDialog(group)}>
                                <UserPlus className="mr-2 h-4 w-4" />
                                Manage Members
                              </DropdownMenuItem>
                              {!isCriticalGroup(group.name) && (
                                <>
                                  <DropdownMenuItem onClick={() => openEditDialog(group)}>
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Rename Group
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => openDeleteDialog(group)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete Group
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

            {/* Summary */}
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                Showing {filteredGroups.length} of {groups.length} groups
              </p>
            </div>
          </div>
        </main>
      </div>

      {/* Create Group Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Group</DialogTitle>
            <DialogDescription>
              Create a new system group for organizing users
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="create-name">Group Name *</Label>
              <Input
                id="create-name"
                placeholder="mygroup"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value.toLowerCase() })}
              />
              <p className="text-xs text-muted-foreground">
                Lowercase letters, numbers, underscores, and hyphens only
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-gid">GID (optional)</Label>
              <Input
                id="create-gid"
                type="number"
                placeholder="Auto-assigned if empty"
                value={createForm.gid}
                onChange={(e) => setCreateForm({ ...createForm, gid: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty for automatic assignment
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateGroup} disabled={isCreating}>
              {isCreating ? "Creating..." : "Create Group"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Group Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rename Group: {editingGroup?.name}</DialogTitle>
            <DialogDescription>
              Change the group name
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">New Group Name *</Label>
              <Input
                id="edit-name"
                placeholder="newgroupname"
                value={editForm.new_name}
                onChange={(e) => setEditForm({ ...editForm, new_name: e.target.value.toLowerCase() })}
              />
              <p className="text-xs text-muted-foreground">
                Lowercase letters, numbers, underscores, and hyphens only
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditGroup} disabled={isEditing}>
              {isEditing ? "Renaming..." : "Rename Group"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Group Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Group: {deletingGroup?.name}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this group? Users in this group will lose their membership.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deletingGroup && deletingGroup.members.length > 0 && (
            <div className="py-2">
              <p className="text-sm text-muted-foreground mb-2">
                This group has {deletingGroup.members.length} member(s):
              </p>
              <div className="flex flex-wrap gap-1">
                {deletingGroup.members.slice(0, 8).map((member) => (
                  <Badge key={member} variant="outline" className="text-xs">
                    {member}
                  </Badge>
                ))}
                {deletingGroup.members.length > 8 && (
                  <Badge variant="secondary" className="text-xs">
                    +{deletingGroup.members.length - 8} more
                  </Badge>
                )}
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteGroup}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete Group"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Manage Members Dialog */}
      <Dialog open={showMembersDialog} onOpenChange={setShowMembersDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Manage Members: {managingGroup?.name}</DialogTitle>
            <DialogDescription>
              Add or remove users from this group
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4">
            {/* Current Members */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Current Members ({managingGroup?.members.length || 0})</Label>
              <div className="border rounded-md p-3 max-h-40 overflow-y-auto">
                {managingGroup?.members.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No members in this group</p>
                ) : (
                  <div className="space-y-2">
                    {managingGroup?.members.map((member) => (
                      <div key={member} className="flex items-center justify-between py-1">
                        <span className="text-sm">{member}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveMember(member)}
                          disabled={isMemberLoading}
                          className="h-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <UserMinus className="h-4 w-4 mr-1" />
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Add Members */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Add Members</Label>
              <div className="border rounded-md p-3 max-h-48 overflow-y-auto">
                {availableUsers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    All users are already members of this group
                  </p>
                ) : (
                  <div className="space-y-2">
                    {availableUsers.map((user) => (
                      <div key={user.username} className="flex items-center justify-between py-1">
                        <div>
                          <span className="text-sm font-medium">{user.username}</span>
                          {user.name && (
                            <span className="text-sm text-muted-foreground ml-2">({user.name})</span>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleAddMember(user.username)}
                          disabled={isMemberLoading}
                          className="h-7"
                        >
                          <UserPlus className="h-4 w-4 mr-1" />
                          Add
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMembersDialog(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
