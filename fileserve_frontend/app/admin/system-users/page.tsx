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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RefreshCw, Eye, Users } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { systemUsersAPI, SystemUser, SystemGroup } from "@/lib/api";
import { PageSkeleton } from "@/components/skeletons";

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
      setUsers(data);
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
      setGroups(data);
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
                View and manage local system users for file share access
              </p>
              <div className="flex gap-2">
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
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleViewUser(user.username)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
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
