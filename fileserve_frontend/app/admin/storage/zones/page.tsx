"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth-context";
import { poolsAPI, zonesAPI, usersAPI, systemUsersAPI, StoragePool, ShareZone, ZoneSMBOptions, ZoneNFSOptions, ZoneWebOptions } from "@/lib/api";
import { PageSkeleton } from "@/components/skeletons";
import { toast } from "sonner";
import {
  FolderTree,
  RefreshCw,
  Plus,
  Pencil,
  Trash2,
  Users,
  Globe,
  User,
  AlertTriangle,
  Network,
  Link2,
  Server,
  HardDrive,
  Shield,
  Settings,
  Eye,
} from "lucide-react";

const defaultSMBOptions: ZoneSMBOptions = {
  share_name: "",
  comment: "",
  valid_users: "",
  invalid_users: "",
  write_list: "",
  read_list: "",
  create_mask: "0644",
  directory_mask: "0755",
  force_user: "",
  force_group: "",
  veto_files: "",
  inherit: false,
};

const defaultNFSOptions: ZoneNFSOptions = {
  export_path: "",
  allowed_hosts: ["*"],
  root_squash: true,
  all_squash: false,
  anon_uid: 65534,
  anon_gid: 65534,
  sync: true,
  no_subtree_check: true,
  secure: true,
  fsid: "",
};

const defaultWebOptions: ZoneWebOptions = {
  public_enabled: false,
  max_link_expiry: 0,
  allow_download: true,
  allow_upload: false,
  allow_preview: true,
  allow_listing: true,
  require_auth: true,
};

export default function ShareZonesPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [zones, setZones] = useState<ShareZone[]>([]);
  const [pools, setPools] = useState<StoragePool[]>([]);
  const [systemUsers, setSystemUsers] = useState<string[]>([]);
  const [systemGroups, setSystemGroups] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Dialog states
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedZone, setSelectedZone] = useState<ShareZone | null>(null);
  const [editTab, setEditTab] = useState("basic");

  // Input states for adding users/groups
  const [newAllowedUser, setNewAllowedUser] = useState("");
  const [newAllowedGroup, setNewAllowedGroup] = useState("");
  const [newDenyUser, setNewDenyUser] = useState("");
  const [newDenyGroup, setNewDenyGroup] = useState("");
  const [newNFSHost, setNewNFSHost] = useState("");

  // Form state with all new fields
  const [formData, setFormData] = useState({
    pool_id: "",
    name: "",
    path: "",
    description: "",
    zone_type: "group" as "personal" | "group" | "public",
    enabled: true,
    auto_provision: false,
    allowed_users: [] as string[],
    allowed_groups: [] as string[],
    deny_users: [] as string[],
    deny_groups: [] as string[],
    allow_network_shares: true,
    allow_web_shares: true,
    allow_guest_access: false,
    smb_enabled: true,
    nfs_enabled: false,
    smb_options: { ...defaultSMBOptions } as ZoneSMBOptions,
    nfs_options: { ...defaultNFSOptions } as ZoneNFSOptions,
    web_options: { ...defaultWebOptions } as ZoneWebOptions,
    max_quota_per_user: 0,
    read_only: false,
    browsable: true,
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

  const fetchData = async () => {
    try {
      const [zonesData, poolsData, usersData, groupsData] = await Promise.all([
        zonesAPI.list(),
        poolsAPI.list(),
        usersAPI.list(),
        systemUsersAPI.listGroups(),
      ]);
      setZones(zonesData || []);
      setPools(poolsData || []);
      // Extract usernames from internal users
      const users = (usersData || []).map(u => u.username);
      // Use system groups from the API
      const groups = (groupsData || []).map(g => g.name);
      setSystemUsers(users);
      setSystemGroups(groups);
    } catch (error) {
      toast.error(`Failed to load data: ${error}`);
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

  const resetForm = () => {
    setFormData({
      pool_id: pools[0]?.id || "",
      name: "",
      path: "",
      description: "",
      zone_type: "group",
      enabled: true,
      auto_provision: false,
      allowed_users: [],
      allowed_groups: [],
      deny_users: [],
      deny_groups: [],
      allow_network_shares: true,
      allow_web_shares: true,
      allow_guest_access: false,
      smb_enabled: true,
      nfs_enabled: false,
      smb_options: { ...defaultSMBOptions },
      nfs_options: { ...defaultNFSOptions },
      web_options: { ...defaultWebOptions },
      max_quota_per_user: 0,
      read_only: false,
      browsable: true,
    });
    setEditTab("basic");
  };

  // Helper functions for managing lists
  const addToList = (
    list: "allowed_users" | "allowed_groups" | "deny_users" | "deny_groups",
    value: string,
    setter: (v: string) => void
  ) => {
    if (value && !formData[list].includes(value)) {
      setFormData(prev => ({
        ...prev,
        [list]: [...prev[list], value],
      }));
      setter("");
    }
  };

  const removeFromList = (
    list: "allowed_users" | "allowed_groups" | "deny_users" | "deny_groups",
    value: string
  ) => {
    setFormData(prev => ({
      ...prev,
      [list]: prev[list].filter(v => v !== value),
    }));
  };

  const addNFSHost = () => {
    if (newNFSHost && !formData.nfs_options.allowed_hosts.includes(newNFSHost)) {
      setFormData(prev => ({
        ...prev,
        nfs_options: {
          ...prev.nfs_options,
          allowed_hosts: [...prev.nfs_options.allowed_hosts, newNFSHost],
        },
      }));
      setNewNFSHost("");
    }
  };

  const removeNFSHost = (host: string) => {
    setFormData(prev => ({
      ...prev,
      nfs_options: {
        ...prev.nfs_options,
        allowed_hosts: prev.nfs_options.allowed_hosts.filter(h => h !== host),
      },
    }));
  };

  const handleEdit = (zone: ShareZone) => {
    setSelectedZone(zone);
    setFormData({
      pool_id: zone.pool_id,
      name: zone.name,
      path: zone.path,
      description: zone.description,
      zone_type: zone.zone_type,
      enabled: zone.enabled,
      auto_provision: zone.auto_provision,
      allowed_users: zone.allowed_users || [],
      allowed_groups: zone.allowed_groups || [],
      deny_users: zone.deny_users || [],
      deny_groups: zone.deny_groups || [],
      allow_network_shares: zone.allow_network_shares,
      allow_web_shares: zone.allow_web_shares,
      allow_guest_access: zone.allow_guest_access,
      smb_enabled: zone.smb_enabled ?? true,
      nfs_enabled: zone.nfs_enabled ?? false,
      smb_options: zone.smb_options || { ...defaultSMBOptions },
      nfs_options: zone.nfs_options || { ...defaultNFSOptions },
      web_options: zone.web_options || { ...defaultWebOptions },
      max_quota_per_user: zone.max_quota_per_user / 1024 / 1024 / 1024,
      read_only: zone.read_only ?? false,
      browsable: zone.browsable ?? true,
    });
    setEditTab("basic");
    setEditDialogOpen(true);
  };

  const handleViewDetails = (zone: ShareZone) => {
    setSelectedZone(zone);
    setDetailsDialogOpen(true);
  };

  const handleUpdate = async () => {
    if (!selectedZone) return;

    try {
      await zonesAPI.update(selectedZone.id, {
        name: formData.name,
        description: formData.description,
        zone_type: formData.zone_type,
        enabled: formData.enabled,
        auto_provision: formData.auto_provision,
        allowed_users: formData.allowed_users,
        allowed_groups: formData.allowed_groups,
        deny_users: formData.deny_users,
        deny_groups: formData.deny_groups,
        allow_network_shares: formData.smb_enabled || formData.nfs_enabled,
        allow_web_shares: formData.web_options.public_enabled || formData.allow_web_shares,
        allow_guest_access: formData.allow_guest_access,
        smb_enabled: formData.smb_enabled,
        nfs_enabled: formData.nfs_enabled,
        smb_options: formData.smb_enabled ? formData.smb_options : undefined,
        nfs_options: formData.nfs_enabled ? formData.nfs_options : undefined,
        web_options: formData.web_options,
        max_quota_per_user: formData.max_quota_per_user * 1024 * 1024 * 1024,
        read_only: formData.read_only,
        browsable: formData.browsable,
      });
      toast.success("Share zone updated successfully");
      setEditDialogOpen(false);
      resetForm();
      setSelectedZone(null);
      fetchData();
    } catch (error) {
      toast.error(`Failed to update zone: ${error}`);
    }
  };

  const handleDelete = async () => {
    if (!selectedZone) return;

    try {
      await zonesAPI.delete(selectedZone.id);
      toast.success("Share zone deleted successfully");
      setDeleteDialogOpen(false);
      setSelectedZone(null);
      fetchData();
    } catch (error) {
      toast.error(`Failed to delete zone: ${error}`);
    }
  };

  const getPoolName = (poolId: string) => {
    const pool = pools.find(p => p.id === poolId);
    return pool?.name || "Unknown";
  };

  const getZoneTypeIcon = (type: string) => {
    switch (type) {
      case "personal":
        return <User className="h-4 w-4" />;
      case "group":
        return <Users className="h-4 w-4" />;
      case "public":
        return <Globe className="h-4 w-4" />;
      default:
        return <FolderTree className="h-4 w-4" />;
    }
  };

  const getZoneTypeBadge = (type: string) => {
    switch (type) {
      case "personal":
        return <Badge variant="secondary"><User className="h-3 w-3 mr-1" />Personal</Badge>;
      case "group":
        return <Badge variant="default"><Users className="h-3 w-3 mr-1" />Group</Badge>;
      case "public":
        return <Badge variant="outline"><Globe className="h-3 w-3 mr-1" />Public</Badge>;
      default:
        return <Badge>{type}</Badge>;
    }
  };

  // Show skeleton during initial auth check (only if no cached user)
  if (authLoading && !user) {
    return <PageSkeleton title="Storage Zones" />;
  }

  // Not authenticated or not admin - will redirect, show skeleton in meantime
  if (!isAuthenticated || (user && user.role !== "admin")) {
    return <PageSkeleton title="Storage Zones" />;
  }

  // Data loading - show skeleton
  if (isLoading) {
    return <PageSkeleton title="Storage Zones" />;
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
                <h1 className="text-2xl font-bold">Share Zones</h1>
                <p className="text-muted-foreground">
                  Configure zones within storage pools for different types of shares
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
                <Button
                  size="sm"
                  onClick={() => router.push("/admin/storage/zones/create")}
                  disabled={pools.length === 0}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Zone
                </Button>
              </div>
            </div>

            {/* No Pools Warning */}
            {pools.length === 0 && (
              <Card className="border-yellow-500/50 bg-yellow-500/10">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-yellow-600">
                    <AlertTriangle className="h-5 w-5" />
                    No Storage Pools Configured
                  </CardTitle>
                  <CardDescription>
                    You need to create a storage pool before you can create share zones.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button onClick={() => router.push("/admin/storage/pools")}>
                    Go to Storage Pools
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Overview Cards */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Zones</CardTitle>
                  <FolderTree className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{zones.length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Personal Zones</CardTitle>
                  <User className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {zones.filter(z => z.zone_type === "personal").length}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Group Zones</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {zones.filter(z => z.zone_type === "group").length}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Public Zones</CardTitle>
                  <Globe className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {zones.filter(z => z.zone_type === "public").length}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Zones Table */}
            <Card>
              <CardHeader>
                <CardTitle>Share Zones</CardTitle>
                <CardDescription>
                  Manage share zone configurations within your storage pools
                </CardDescription>
              </CardHeader>
              <CardContent>
                {zones.length === 0 ? (
                  <div className="text-center py-8">
                    <FolderTree className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium">No Share Zones</h3>
                    <p className="text-muted-foreground mb-4">
                      Create share zones to organize where shares can be created
                    </p>
                    {pools.length > 0 && (
                      <Button onClick={() => router.push("/admin/storage/zones/create")}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Zone
                      </Button>
                    )}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Pool</TableHead>
                        <TableHead>Path</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Protocols</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {zones.map((zone) => (
                        <TableRow key={zone.id}>
                          <TableCell className="font-medium">
                            <div>
                              {zone.name}
                              {zone.description && (
                                <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                                  {zone.description}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{getPoolName(zone.pool_id)}</TableCell>
                          <TableCell className="font-mono text-sm">{zone.path}</TableCell>
                          <TableCell>{getZoneTypeBadge(zone.zone_type)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {zone.smb_enabled && (
                                <Badge variant="outline" className="text-xs px-1.5">
                                  <Server className="h-3 w-3 mr-1" />
                                  SMB
                                </Badge>
                              )}
                              {zone.nfs_enabled && (
                                <Badge variant="outline" className="text-xs px-1.5">
                                  <HardDrive className="h-3 w-3 mr-1" />
                                  NFS
                                </Badge>
                              )}
                              {zone.allow_web_shares && (
                                <Badge variant="outline" className="text-xs px-1.5">
                                  <Link2 className="h-3 w-3 mr-1" />
                                  Web
                                </Badge>
                              )}
                              {zone.allow_guest_access && (
                                <span title="Guest Access">
                                  <Globe className="h-4 w-4 text-yellow-500" />
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={zone.enabled ? "default" : "secondary"}>
                              {zone.enabled ? "Active" : "Disabled"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleViewDetails(zone)}
                                title="View Details"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEdit(zone)}
                                title="Edit"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedZone(zone);
                                  setDeleteDialogOpen(true);
                                }}
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>

      {/* Edit Zone Dialog with Tabs */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit Share Zone: {selectedZone?.name}</DialogTitle>
            <DialogDescription>
              Configure zone settings, access control, and sharing protocols
            </DialogDescription>
          </DialogHeader>
          <Tabs value={editTab} onValueChange={setEditTab} className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="basic">Basic</TabsTrigger>
              <TabsTrigger value="access">Access</TabsTrigger>
              <TabsTrigger value="smb">SMB</TabsTrigger>
              <TabsTrigger value="nfs">NFS</TabsTrigger>
              <TabsTrigger value="web">Web</TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto py-4">
              {/* Basic Tab */}
              <TabsContent value="basic" className="mt-0 space-y-4">
                <div className="grid gap-2">
                  <Label>Storage Pool</Label>
                  <Input value={getPoolName(formData.pool_id)} disabled className="bg-muted" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-name">Zone Name</Label>
                  <Input
                    id="edit-name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Path</Label>
                  <Input value={formData.path} disabled className="bg-muted" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-zone_type">Zone Type</Label>
                  <Select
                    value={formData.zone_type}
                    onValueChange={(value: "personal" | "group" | "public") =>
                      setFormData({ ...formData, zone_type: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="personal">Personal</SelectItem>
                      <SelectItem value="group">Group</SelectItem>
                      <SelectItem value="public">Public</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-description">Description</Label>
                  <Textarea
                    id="edit-description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Enabled</Label>
                      <p className="text-sm text-muted-foreground">Zone is active</p>
                    </div>
                    <Switch
                      checked={formData.enabled}
                      onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Read Only</Label>
                      <p className="text-sm text-muted-foreground">Prevent write operations</p>
                    </div>
                    <Switch
                      checked={formData.read_only}
                      onCheckedChange={(checked) => setFormData({ ...formData, read_only: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Browsable</Label>
                      <p className="text-sm text-muted-foreground">Show in network browser</p>
                    </div>
                    <Switch
                      checked={formData.browsable}
                      onCheckedChange={(checked) => setFormData({ ...formData, browsable: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Auto-Provision</Label>
                      <p className="text-sm text-muted-foreground">Auto-create directories for users</p>
                    </div>
                    <Switch
                      checked={formData.auto_provision}
                      onCheckedChange={(checked) => setFormData({ ...formData, auto_provision: checked })}
                    />
                  </div>
                </div>
              </TabsContent>

              {/* Access Tab */}
              <TabsContent value="access" className="mt-0 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Guest Access</Label>
                    <p className="text-sm text-muted-foreground">Allow anonymous access</p>
                  </div>
                  <Switch
                    checked={formData.allow_guest_access}
                    onCheckedChange={(checked) => setFormData({ ...formData, allow_guest_access: checked })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Allowed Users</Label>
                  <div className="flex gap-2">
                    <Select value={newAllowedUser} onValueChange={setNewAllowedUser}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select user" />
                      </SelectTrigger>
                      <SelectContent>
                        {systemUsers.filter(u => !formData.allowed_users.includes(u)).map((u) => (
                          <SelectItem key={u} value={u}>{u}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" onClick={() => addToList("allowed_users", newAllowedUser, setNewAllowedUser)}>Add</Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {formData.allowed_users.map((u) => (
                      <Badge key={u} variant="secondary" className="cursor-pointer" onClick={() => removeFromList("allowed_users", u)}>
                        <User className="h-3 w-3 mr-1" />{u}<span className="ml-1">&times;</span>
                      </Badge>
                    ))}
                    {formData.allowed_users.length === 0 && <span className="text-sm text-muted-foreground">No users specified (all users allowed)</span>}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Allowed Groups</Label>
                  <div className="flex gap-2">
                    <Select value={newAllowedGroup} onValueChange={setNewAllowedGroup}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select group" />
                      </SelectTrigger>
                      <SelectContent>
                        {systemGroups.filter(g => !formData.allowed_groups.includes(g)).map((g) => (
                          <SelectItem key={g} value={g}>{g}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" onClick={() => addToList("allowed_groups", newAllowedGroup, setNewAllowedGroup)}>Add</Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {formData.allowed_groups.map((g) => (
                      <Badge key={g} variant="secondary" className="cursor-pointer" onClick={() => removeFromList("allowed_groups", g)}>
                        <Users className="h-3 w-3 mr-1" />{g}<span className="ml-1">&times;</span>
                      </Badge>
                    ))}
                    {formData.allowed_groups.length === 0 && <span className="text-sm text-muted-foreground">No groups specified</span>}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Denied Users</Label>
                  <div className="flex gap-2">
                    <Select value={newDenyUser} onValueChange={setNewDenyUser}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select user to deny" />
                      </SelectTrigger>
                      <SelectContent>
                        {systemUsers.filter(u => !formData.deny_users.includes(u)).map((u) => (
                          <SelectItem key={u} value={u}>{u}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" onClick={() => addToList("deny_users", newDenyUser, setNewDenyUser)}>Add</Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {formData.deny_users.map((u) => (
                      <Badge key={u} variant="destructive" className="cursor-pointer" onClick={() => removeFromList("deny_users", u)}>
                        <User className="h-3 w-3 mr-1" />{u}<span className="ml-1">&times;</span>
                      </Badge>
                    ))}
                    {formData.deny_users.length === 0 && <span className="text-sm text-muted-foreground">No users denied</span>}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Denied Groups</Label>
                  <div className="flex gap-2">
                    <Select value={newDenyGroup} onValueChange={setNewDenyGroup}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select group to deny" />
                      </SelectTrigger>
                      <SelectContent>
                        {systemGroups.filter(g => !formData.deny_groups.includes(g)).map((g) => (
                          <SelectItem key={g} value={g}>{g}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" onClick={() => addToList("deny_groups", newDenyGroup, setNewDenyGroup)}>Add</Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {formData.deny_groups.map((g) => (
                      <Badge key={g} variant="destructive" className="cursor-pointer" onClick={() => removeFromList("deny_groups", g)}>
                        <Users className="h-3 w-3 mr-1" />{g}<span className="ml-1">&times;</span>
                      </Badge>
                    ))}
                    {formData.deny_groups.length === 0 && <span className="text-sm text-muted-foreground">No groups denied</span>}
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="quota">User Quota (GB)</Label>
                  <Input
                    id="quota"
                    type="number"
                    min="0"
                    placeholder="0 = unlimited"
                    value={formData.max_quota_per_user || ""}
                    onChange={(e) => setFormData({ ...formData, max_quota_per_user: parseInt(e.target.value) || 0 })}
                  />
                  <p className="text-sm text-muted-foreground">Maximum storage per user (0 = unlimited)</p>
                </div>
              </TabsContent>

              {/* SMB Tab */}
              <TabsContent value="smb" className="mt-0 space-y-4">
                <div className="flex items-center justify-between pb-4 border-b">
                  <div>
                    <h3 className="text-sm font-medium flex items-center gap-2">
                      <Server className="h-4 w-4" />
                      SMB/CIFS Sharing
                    </h3>
                    <p className="text-sm text-muted-foreground">Windows file sharing (Samba)</p>
                  </div>
                  <Switch
                    checked={formData.smb_enabled}
                    onCheckedChange={(checked) => setFormData({ ...formData, smb_enabled: checked })}
                  />
                </div>

                {formData.smb_enabled && (
                  <div className="grid gap-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="smb_share_name">Share Name</Label>
                        <Input
                          id="smb_share_name"
                          placeholder={formData.name || "share-name"}
                          value={formData.smb_options.share_name}
                          onChange={(e) => setFormData({
                            ...formData,
                            smb_options: { ...formData.smb_options, share_name: e.target.value }
                          })}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="smb_comment">Comment</Label>
                        <Input
                          id="smb_comment"
                          placeholder="Share description"
                          value={formData.smb_options.comment}
                          onChange={(e) => setFormData({
                            ...formData,
                            smb_options: { ...formData.smb_options, comment: e.target.value }
                          })}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="smb_create_mask">File Create Mask</Label>
                        <Input
                          id="smb_create_mask"
                          placeholder="0644"
                          value={formData.smb_options.create_mask}
                          onChange={(e) => setFormData({
                            ...formData,
                            smb_options: { ...formData.smb_options, create_mask: e.target.value }
                          })}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="smb_dir_mask">Directory Create Mask</Label>
                        <Input
                          id="smb_dir_mask"
                          placeholder="0755"
                          value={formData.smb_options.directory_mask}
                          onChange={(e) => setFormData({
                            ...formData,
                            smb_options: { ...formData.smb_options, directory_mask: e.target.value }
                          })}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="smb_force_user">Force User</Label>
                        <Input
                          id="smb_force_user"
                          placeholder="nobody"
                          value={formData.smb_options.force_user}
                          onChange={(e) => setFormData({
                            ...formData,
                            smb_options: { ...formData.smb_options, force_user: e.target.value }
                          })}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="smb_force_group">Force Group</Label>
                        <Input
                          id="smb_force_group"
                          placeholder="nogroup"
                          value={formData.smb_options.force_group}
                          onChange={(e) => setFormData({
                            ...formData,
                            smb_options: { ...formData.smb_options, force_group: e.target.value }
                          })}
                        />
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="smb_veto">Veto Files</Label>
                      <Input
                        id="smb_veto"
                        placeholder="/*.exe/*.bat/*.cmd/"
                        value={formData.smb_options.veto_files}
                        onChange={(e) => setFormData({
                          ...formData,
                          smb_options: { ...formData.smb_options, veto_files: e.target.value }
                        })}
                      />
                      <p className="text-xs text-muted-foreground">Files to hide/block (Samba veto pattern)</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Inherit Permissions</Label>
                        <p className="text-sm text-muted-foreground">New files inherit parent permissions</p>
                      </div>
                      <Switch
                        checked={formData.smb_options.inherit}
                        onCheckedChange={(checked) => setFormData({
                          ...formData,
                          smb_options: { ...formData.smb_options, inherit: checked }
                        })}
                      />
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* NFS Tab */}
              <TabsContent value="nfs" className="mt-0 space-y-4">
                <div className="flex items-center justify-between pb-4 border-b">
                  <div>
                    <h3 className="text-sm font-medium flex items-center gap-2">
                      <HardDrive className="h-4 w-4" />
                      NFS Sharing
                    </h3>
                    <p className="text-sm text-muted-foreground">Network File System exports</p>
                  </div>
                  <Switch
                    checked={formData.nfs_enabled}
                    onCheckedChange={(checked) => setFormData({ ...formData, nfs_enabled: checked })}
                  />
                </div>

                {formData.nfs_enabled && (
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <Label>Allowed Hosts</Label>
                      <div className="flex gap-2">
                        <Input
                          placeholder="192.168.1.0/24 or hostname"
                          value={newNFSHost}
                          onChange={(e) => setNewNFSHost(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && addNFSHost()}
                        />
                        <Button variant="outline" onClick={addNFSHost}>Add</Button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {formData.nfs_options.allowed_hosts.map((host) => (
                          <Badge key={host} variant="secondary" className="cursor-pointer" onClick={() => removeNFSHost(host)}>
                            <Network className="h-3 w-3 mr-1" />{host}<span className="ml-1">&times;</span>
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Root Squash</Label>
                          <p className="text-xs text-muted-foreground">Map root to nobody</p>
                        </div>
                        <Switch
                          checked={formData.nfs_options.root_squash}
                          onCheckedChange={(checked) => setFormData({
                            ...formData,
                            nfs_options: { ...formData.nfs_options, root_squash: checked }
                          })}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>All Squash</Label>
                          <p className="text-xs text-muted-foreground">Map all users to nobody</p>
                        </div>
                        <Switch
                          checked={formData.nfs_options.all_squash}
                          onCheckedChange={(checked) => setFormData({
                            ...formData,
                            nfs_options: { ...formData.nfs_options, all_squash: checked }
                          })}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="nfs_anon_uid">Anonymous UID</Label>
                        <Input
                          id="nfs_anon_uid"
                          type="number"
                          value={formData.nfs_options.anon_uid}
                          onChange={(e) => setFormData({
                            ...formData,
                            nfs_options: { ...formData.nfs_options, anon_uid: parseInt(e.target.value) || 65534 }
                          })}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="nfs_anon_gid">Anonymous GID</Label>
                        <Input
                          id="nfs_anon_gid"
                          type="number"
                          value={formData.nfs_options.anon_gid}
                          onChange={(e) => setFormData({
                            ...formData,
                            nfs_options: { ...formData.nfs_options, anon_gid: parseInt(e.target.value) || 65534 }
                          })}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Sync</Label>
                          <p className="text-xs text-muted-foreground">Sync writes</p>
                        </div>
                        <Switch
                          checked={formData.nfs_options.sync}
                          onCheckedChange={(checked) => setFormData({
                            ...formData,
                            nfs_options: { ...formData.nfs_options, sync: checked }
                          })}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Secure</Label>
                          <p className="text-xs text-muted-foreground">Privileged ports</p>
                        </div>
                        <Switch
                          checked={formData.nfs_options.secure}
                          onCheckedChange={(checked) => setFormData({
                            ...formData,
                            nfs_options: { ...formData.nfs_options, secure: checked }
                          })}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>No Subtree</Label>
                          <p className="text-xs text-muted-foreground">Disable check</p>
                        </div>
                        <Switch
                          checked={formData.nfs_options.no_subtree_check}
                          onCheckedChange={(checked) => setFormData({
                            ...formData,
                            nfs_options: { ...formData.nfs_options, no_subtree_check: checked }
                          })}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* Web Tab */}
              <TabsContent value="web" className="mt-0 space-y-4">
                <div className="flex items-center justify-between pb-4 border-b">
                  <div>
                    <h3 className="text-sm font-medium flex items-center gap-2">
                      <Link2 className="h-4 w-4" />
                      Web Sharing
                    </h3>
                    <p className="text-sm text-muted-foreground">Web-based file access and public links</p>
                  </div>
                  <Switch
                    checked={formData.allow_web_shares}
                    onCheckedChange={(checked) => setFormData({ ...formData, allow_web_shares: checked })}
                  />
                </div>

                {formData.allow_web_shares && (
                  <div className="grid gap-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Public Link Sharing</Label>
                        <p className="text-sm text-muted-foreground">Allow users to create shareable links</p>
                      </div>
                      <Switch
                        checked={formData.web_options.public_enabled}
                        onCheckedChange={(checked) => setFormData({
                          ...formData,
                          web_options: { ...formData.web_options, public_enabled: checked }
                        })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="web_max_expiry">Max Link Expiry (days)</Label>
                      <Input
                        id="web_max_expiry"
                        type="number"
                        min="0"
                        placeholder="0 = no limit"
                        value={formData.web_options.max_link_expiry || ""}
                        onChange={(e) => setFormData({
                          ...formData,
                          web_options: { ...formData.web_options, max_link_expiry: parseInt(e.target.value) || 0 }
                        })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Allow Download</Label>
                        </div>
                        <Switch
                          checked={formData.web_options.allow_download}
                          onCheckedChange={(checked) => setFormData({
                            ...formData,
                            web_options: { ...formData.web_options, allow_download: checked }
                          })}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Allow Upload</Label>
                        </div>
                        <Switch
                          checked={formData.web_options.allow_upload}
                          onCheckedChange={(checked) => setFormData({
                            ...formData,
                            web_options: { ...formData.web_options, allow_upload: checked }
                          })}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Allow Preview</Label>
                        </div>
                        <Switch
                          checked={formData.web_options.allow_preview}
                          onCheckedChange={(checked) => setFormData({
                            ...formData,
                            web_options: { ...formData.web_options, allow_preview: checked }
                          })}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Allow Listing</Label>
                        </div>
                        <Switch
                          checked={formData.web_options.allow_listing}
                          onCheckedChange={(checked) => setFormData({
                            ...formData,
                            web_options: { ...formData.web_options, allow_listing: checked }
                          })}
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Require Authentication</Label>
                        <p className="text-sm text-muted-foreground">Users must log in for web access</p>
                      </div>
                      <Switch
                        checked={formData.web_options.require_auth}
                        onCheckedChange={(checked) => setFormData({
                          ...formData,
                          web_options: { ...formData.web_options, require_auth: checked }
                        })}
                      />
                    </div>
                  </div>
                )}
              </TabsContent>
            </div>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Zone Details Dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderTree className="h-5 w-5" />
              Zone Details: {selectedZone?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedZone && (
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Pool</Label>
                  <p className="font-medium">{getPoolName(selectedZone.pool_id)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Path</Label>
                  <p className="font-mono text-sm">{selectedZone.path}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Type</Label>
                  <div className="mt-1">{getZoneTypeBadge(selectedZone.zone_type)}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <div className="mt-1">
                    <Badge variant={selectedZone.enabled ? "default" : "secondary"}>
                      {selectedZone.enabled ? "Active" : "Disabled"}
                    </Badge>
                  </div>
                </div>
              </div>
              {selectedZone.description && (
                <div>
                  <Label className="text-muted-foreground">Description</Label>
                  <p className="text-sm">{selectedZone.description}</p>
                </div>
              )}
              <div>
                <Label className="text-muted-foreground">Sharing Protocols</Label>
                <div className="flex items-center gap-2 mt-1">
                  {selectedZone.smb_enabled && (
                    <Badge variant="outline"><Server className="h-3 w-3 mr-1" />SMB</Badge>
                  )}
                  {selectedZone.nfs_enabled && (
                    <Badge variant="outline"><HardDrive className="h-3 w-3 mr-1" />NFS</Badge>
                  )}
                  {selectedZone.allow_web_shares && (
                    <Badge variant="outline"><Link2 className="h-3 w-3 mr-1" />Web</Badge>
                  )}
                  {selectedZone.allow_guest_access && (
                    <Badge variant="outline"><Globe className="h-3 w-3 mr-1" />Guest</Badge>
                  )}
                  {!selectedZone.smb_enabled && !selectedZone.nfs_enabled && !selectedZone.allow_web_shares && (
                    <span className="text-muted-foreground text-sm">No sharing enabled</span>
                  )}
                </div>
              </div>
              {(selectedZone.allowed_users?.length > 0 || selectedZone.allowed_groups?.length > 0) && (
                <div>
                  <Label className="text-muted-foreground">Access Control</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {selectedZone.allowed_users?.map(u => (
                      <Badge key={u} variant="secondary"><User className="h-3 w-3 mr-1" />{u}</Badge>
                    ))}
                    {selectedZone.allowed_groups?.map(g => (
                      <Badge key={g} variant="secondary"><Users className="h-3 w-3 mr-1" />{g}</Badge>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <Label className="text-muted-foreground">Created</Label>
                  <p>{new Date(selectedZone.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Updated</Label>
                  <p>{new Date(selectedZone.updated_at).toLocaleString()}</p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsDialogOpen(false)}>Close</Button>
            <Button onClick={() => { setDetailsDialogOpen(false); if (selectedZone) handleEdit(selectedZone); }}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit Zone
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Delete Share Zone
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the share zone &quot;{selectedZone?.name}&quot;?
              This action cannot be undone. All shares in this zone must be deleted first.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete Zone
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
