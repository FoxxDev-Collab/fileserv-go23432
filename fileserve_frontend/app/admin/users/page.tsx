"use client";

import { useState, useEffect } from "react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Label } from "@/components/ui/label";
import { MoreVertical, UserPlus, Edit, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { usersAPI, User } from "@/lib/api";
import { PageSkeleton } from "@/components/skeletons";

export default function UsersPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user: currentUser, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  // New user form state
  const [newUsername, setNewUsername] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newIsAdmin, setNewIsAdmin] = useState(false);

  // Delete confirmation dialog state
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; user?: User }>({ open: false });

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
      const data = await usersAPI.list();
      setUsers(data);
    } catch (error) {
      console.error("Failed to load users:", error);
      toast.error("Failed to load users");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && currentUser?.role === "admin") {
      loadUsers();
    }
  }, [isAuthenticated, currentUser]);

  const filteredUsers = users.filter(
    (user) =>
      user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.email && user.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleAddUser = async () => {
    if (!newUsername || !newPassword) {
      toast.error("Username and password are required");
      return;
    }

    try {
      await usersAPI.create({
        username: newUsername,
        password: newPassword,
        email: newEmail,
        is_admin: newIsAdmin,
      });
      toast.success("User created successfully");
      setIsAddDialogOpen(false);
      setNewUsername("");
      setNewEmail("");
      setNewPassword("");
      setNewIsAdmin(false);
      loadUsers();
    } catch (error) {
      console.error("Failed to create user:", error);
      toast.error("Failed to create user");
    }
  };

  const handleDeleteUser = (user: User) => {
    if (user.id === currentUser?.id) {
      toast.error("Cannot delete your own account");
      return;
    }
    setDeleteDialog({ open: true, user });
  };

  const confirmDeleteUser = async () => {
    if (!deleteDialog.user) return;

    try {
      await usersAPI.delete(deleteDialog.user.id);
      toast.success(`Deleted user: ${deleteDialog.user.username}`);
      setDeleteDialog({ open: false });
      loadUsers();
    } catch (error) {
      console.error("Failed to delete user:", error);
      toast.error("Failed to delete user");
    }
  };

  const handleToggleAdmin = async (user: User) => {
    if (user.id === currentUser?.id) {
      toast.error("Cannot modify your own admin status");
      return;
    }

    try {
      await usersAPI.update(user.id, { is_admin: !user.is_admin });
      toast.success(`Updated ${user.username}'s admin status`);
      loadUsers();
    } catch (error) {
      console.error("Failed to update user:", error);
      toast.error("Failed to update user");
    }
  };

  // Show skeleton during initial auth check (only if no cached user)
  if (authLoading && !currentUser) {
    return <PageSkeleton title="User Management" />;
  }

  // Not authenticated or not admin - will redirect, show skeleton in meantime
  if (!isAuthenticated || (currentUser && currentUser.role !== "admin")) {
    return <PageSkeleton title="User Management" />;
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="User Management" />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Page Header */}
            <div className="flex justify-between items-center">
              <p className="text-muted-foreground">
                Manage user accounts and permissions
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="icon" onClick={loadUsers} disabled={isLoading}>
                  <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                </Button>
                <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <UserPlus className="mr-2 h-4 w-4" />
                      Add User
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add New User</DialogTitle>
                      <DialogDescription>
                        Create a new user account with access to the file server.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="new-username">Username</Label>
                        <Input
                          id="new-username"
                          placeholder="Enter username"
                          value={newUsername}
                          onChange={(e) => setNewUsername(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="new-email">Email (optional)</Label>
                        <Input
                          id="new-email"
                          type="email"
                          placeholder="user@example.com"
                          value={newEmail}
                          onChange={(e) => setNewEmail(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="new-password">Password</Label>
                        <Input
                          id="new-password"
                          type="password"
                          placeholder="Enter password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          id="new-is-admin"
                          type="checkbox"
                          checked={newIsAdmin}
                          onChange={(e) => setNewIsAdmin(e.target.checked)}
                          className="rounded border-input"
                        />
                        <Label htmlFor="new-is-admin">Admin user</Label>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleAddUser}>Create User</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {/* Search */}
            <div>
              <Input
                type="search"
                placeholder="Search users by username or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-md"
              />
            </div>

            {/* Users Table */}
            <div className="border rounded-lg">
              {isLoading ? (
                <div className="p-8 text-center text-muted-foreground">Loading users...</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Username</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Groups</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.username}</TableCell>
                        <TableCell>{user.email || "-"}</TableCell>
                        <TableCell>
                          <Badge variant={user.is_admin ? "default" : "secondary"}>
                            {user.is_admin ? "admin" : "user"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {user.groups && user.groups.length > 0
                            ? user.groups.join(", ")
                            : "-"}
                        </TableCell>
                        <TableCell>
                          {new Date(user.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleToggleAdmin(user)}>
                                <Edit className="mr-2 h-4 w-4" />
                                {user.is_admin ? "Remove Admin" : "Make Admin"}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDeleteUser(user)}
                                className="text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
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

      {/* Delete User Confirmation Dialog */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete user &quot;{deleteDialog.user?.username}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteUser} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
