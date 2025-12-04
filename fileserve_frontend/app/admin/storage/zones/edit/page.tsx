"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth-context";
import {
  poolsAPI,
  zonesAPI,
  storageAPI,
  usersAPI,
  systemUsersAPI,
  StoragePool,
  DirectoryEntry,
  ShareZone,
  ZoneSMBOptions,
  ZoneNFSOptions,
  ZoneWebOptions,
} from "@/lib/api";
import { PageSkeleton } from "@/components/skeletons";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Users,
  Globe,
  User,
  Network,
  Link2,
  Shield,
  Folder,
  ChevronRight,
  Home,
  HardDrive,
  Server,
  Info,
  AlertCircle,
} from "lucide-react";

// Wrapper component to handle Suspense for useSearchParams
export default function EditZonePageWrapper() {
  return (
    <Suspense fallback={<PageSkeleton title="Edit Zone" />}>
      <EditZonePage />
    </Suspense>
  );
}

interface FormData {
  // Basic info
  pool_id: string;
  name: string;
  path: string;
  description: string;
  zone_type: "personal" | "group" | "public";
  enabled: boolean;
  auto_provision: boolean;

  // Access control
  allowed_users: string[];
  allowed_groups: string[];
  deny_users: string[];
  deny_groups: string[];
  allow_guest_access: boolean;
  read_only: boolean;
  browsable: boolean;

  // SMB config
  smb_enabled: boolean;
  smb_options: ZoneSMBOptions;

  // NFS config
  nfs_enabled: boolean;
  nfs_options: ZoneNFSOptions;

  // Web config
  web_enabled: boolean;
  web_options: ZoneWebOptions;

  // Quotas
  max_quota_per_user: number;
}

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

const STEPS = [
  { id: "basic", label: "Basic Info", icon: Info },
  { id: "access", label: "Access Control", icon: Shield },
  { id: "smb", label: "SMB Sharing", icon: Server },
  { id: "nfs", label: "NFS Sharing", icon: HardDrive },
  { id: "web", label: "Web Sharing", icon: Link2 },
  { id: "review", label: "Review", icon: Check },
];

function EditZonePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const zoneId = searchParams.get("id");

  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [pools, setPools] = useState<StoragePool[]>([]);
  const [systemUsers, setSystemUsers] = useState<string[]>([]);
  const [systemGroups, setSystemGroups] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [zone, setZone] = useState<ShareZone | null>(null);

  // Access control mode
  const [allowAllUsers, setAllowAllUsers] = useState(true);
  const [allowAllGroups, setAllowAllGroups] = useState(true);

  // Path browser state
  const [currentPath, setCurrentPath] = useState("");
  const [directories, setDirectories] = useState<DirectoryEntry[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);

  // Input states for user/group adding
  const [newAllowedUser, setNewAllowedUser] = useState("");
  const [newAllowedGroup, setNewAllowedGroup] = useState("");
  const [newDenyUser, setNewDenyUser] = useState("");
  const [newDenyGroup, setNewDenyGroup] = useState("");
  const [newNFSHost, setNewNFSHost] = useState("");

  const [formData, setFormData] = useState<FormData>({
    pool_id: "",
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
    allow_guest_access: false,
    read_only: false,
    browsable: true,
    smb_enabled: true,
    smb_options: { ...defaultSMBOptions },
    nfs_enabled: false,
    nfs_options: { ...defaultNFSOptions },
    web_enabled: true,
    web_options: { ...defaultWebOptions },
    max_quota_per_user: 0,
  });

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

  useEffect(() => {
    if (!zoneId) {
      toast.error("No zone ID provided");
      router.replace("/admin/storage/zones");
      return;
    }

    const fetchData = async () => {
      try {
        const [poolsData, internalUsersData, systemUsersData, groupsData, zoneData] = await Promise.all([
          poolsAPI.list(),
          usersAPI.list(),
          systemUsersAPI.list(true),
          systemUsersAPI.listGroups(),
          zonesAPI.get(zoneId),
        ]);

        setPools(poolsData || []);
        setZone(zoneData);

        // Combine internal users and system users (deduplicate by username)
        const internalUsernames = (internalUsersData || []).map(u => u.username);
        const systemUsernames = (systemUsersData || []).map(u => u.username);
        const allUsers = Array.from(new Set([...internalUsernames, ...systemUsernames])).sort();

        // Use system groups from the API
        const groups = (groupsData || []).map(g => g.name);
        setSystemUsers(allUsers);
        setSystemGroups(groups);

        // Populate form data from zone
        if (zoneData) {
          // Determine if "allow all" based on empty lists
          const hasAllowedUsers = zoneData.allowed_users && zoneData.allowed_users.length > 0;
          const hasAllowedGroups = zoneData.allowed_groups && zoneData.allowed_groups.length > 0;
          setAllowAllUsers(!hasAllowedUsers);
          setAllowAllGroups(!hasAllowedGroups);

          setFormData({
            pool_id: zoneData.pool_id,
            name: zoneData.name,
            path: zoneData.path,
            description: zoneData.description || "",
            zone_type: zoneData.zone_type as "personal" | "group" | "public",
            enabled: zoneData.enabled,
            auto_provision: zoneData.auto_provision || false,
            allowed_users: zoneData.allowed_users || [],
            allowed_groups: zoneData.allowed_groups || [],
            deny_users: zoneData.deny_users || [],
            deny_groups: zoneData.deny_groups || [],
            allow_guest_access: zoneData.allow_guest_access || false,
            read_only: zoneData.read_only || false,
            browsable: zoneData.browsable !== false,
            smb_enabled: zoneData.smb_enabled || false,
            smb_options: zoneData.smb_options || { ...defaultSMBOptions },
            nfs_enabled: zoneData.nfs_enabled || false,
            nfs_options: zoneData.nfs_options || { ...defaultNFSOptions },
            web_enabled: zoneData.allow_web_shares !== false,
            web_options: zoneData.web_options || { ...defaultWebOptions },
            max_quota_per_user: (zoneData.max_quota_per_user || 0) / 1024 / 1024 / 1024, // Convert bytes to GB
          });

          // Browse the zone's parent path
          const pool = poolsData?.find(p => p.id === zoneData.pool_id);
          if (pool) {
            browseDirectory(pool.path);
          }
        }
      } catch (error) {
        toast.error(`Failed to load zone data: ${error}`);
        router.replace("/admin/storage/zones");
      } finally {
        setIsLoading(false);
      }
    };

    if (isAuthenticated && user?.role === "admin") {
      fetchData();
    }
  }, [isAuthenticated, user, zoneId, router]);

  const browseDirectory = async (path: string) => {
    setBrowseLoading(true);
    try {
      const response = await storageAPI.browseDirectories(path);
      setCurrentPath(response.current_path);
      setDirectories(response.entries.filter(e => e.is_dir));
    } catch (error) {
      toast.error(`Failed to browse directory: ${error}`);
    } finally {
      setBrowseLoading(false);
    }
  };

  const handlePoolChange = (poolId: string) => {
    setFormData(prev => ({ ...prev, pool_id: poolId }));
    const pool = pools.find(p => p.id === poolId);
    if (pool) {
      browseDirectory(pool.path);
    }
  };

  const handlePathSelect = (dir: DirectoryEntry) => {
    const selectedPool = pools.find(p => p.id === formData.pool_id);
    if (selectedPool) {
      const relativePath = dir.path.replace(selectedPool.path, "").replace(/^\//, "");
      setFormData(prev => ({ ...prev, path: relativePath }));
    }
    browseDirectory(dir.path);
  };

  const handlePathInput = (value: string) => {
    setFormData(prev => ({ ...prev, path: value }));
  };

  const getFullPath = () => {
    const pool = pools.find(p => p.id === formData.pool_id);
    if (!pool) return "";
    return `${pool.path}/${formData.path}`.replace(/\/+/g, "/").replace(/\/$/, "");
  };

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

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return formData.pool_id && formData.name && formData.path;
      default:
        return true;
    }
  };

  const handleSubmit = async () => {
    if (!zoneId) return;

    setIsSubmitting(true);
    try {
      await zonesAPI.update(zoneId, {
        pool_id: formData.pool_id,
        name: formData.name,
        path: formData.path,
        description: formData.description,
        zone_type: formData.zone_type,
        enabled: formData.enabled,
        auto_provision: formData.auto_provision,
        allowed_users: formData.allowed_users,
        allowed_groups: formData.allowed_groups,
        deny_users: formData.deny_users,
        deny_groups: formData.deny_groups,
        allow_network_shares: formData.smb_enabled || formData.nfs_enabled,
        allow_web_shares: formData.web_enabled,
        allow_guest_access: formData.allow_guest_access,
        smb_enabled: formData.smb_enabled,
        nfs_enabled: formData.nfs_enabled,
        smb_options: formData.smb_enabled ? formData.smb_options : undefined,
        nfs_options: formData.nfs_enabled ? formData.nfs_options : undefined,
        web_options: formData.web_enabled ? formData.web_options : undefined,
        max_quota_per_user: formData.max_quota_per_user * 1024 * 1024 * 1024,
        read_only: formData.read_only,
        browsable: formData.browsable,
      });
      toast.success("Zone updated successfully!");
      router.push("/admin/storage/zones");
    } catch (error) {
      toast.error(`Failed to update zone: ${error}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading && !user) {
    return <PageSkeleton title="Edit Zone" />;
  }

  if (!isAuthenticated || (user && user.role !== "admin")) {
    return <PageSkeleton title="Edit Zone" />;
  }

  if (isLoading) {
    return <PageSkeleton title="Edit Zone" />;
  }

  const selectedPool = pools.find(p => p.id === formData.pool_id);

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => router.push("/admin/storage/zones")}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Zones
              </Button>
            </div>

            <div>
              <h1 className="text-2xl font-bold">Edit Share Zone</h1>
              <p className="text-muted-foreground">
                Modify zone configuration for {zone?.name || "..."}
              </p>
            </div>

            {/* Progress Steps */}
            <div className="flex items-center justify-between">
              {STEPS.map((step, index) => {
                const StepIcon = step.icon;
                const isActive = index === currentStep;
                const isCompleted = index < currentStep;
                return (
                  <div key={step.id} className="flex items-center">
                    <div
                      className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors cursor-pointer ${
                        isActive
                          ? "border-primary bg-primary text-primary-foreground"
                          : isCompleted
                          ? "border-primary bg-primary/20 text-primary"
                          : "border-muted bg-muted text-muted-foreground"
                      }`}
                      onClick={() => setCurrentStep(index)}
                    >
                      {isCompleted ? (
                        <Check className="h-5 w-5" />
                      ) : (
                        <StepIcon className="h-5 w-5" />
                      )}
                    </div>
                    <span
                      className={`ml-2 text-sm font-medium cursor-pointer ${isActive ? "text-foreground" : "text-muted-foreground"}`}
                      onClick={() => setCurrentStep(index)}
                    >
                      {step.label}
                    </span>
                    {index < STEPS.length - 1 && (
                      <ChevronRight className="h-4 w-4 mx-4 text-muted-foreground" />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Step Content */}
            <Card>
              <CardContent className="pt-6">
                {/* Step 1: Basic Info */}
                {currentStep === 0 && (
                  <div className="space-y-6">
                    <div className="grid gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="pool">Storage Pool *</Label>
                        <Select value={formData.pool_id} onValueChange={handlePoolChange}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a pool" />
                          </SelectTrigger>
                          <SelectContent>
                            {pools.map((pool) => (
                              <SelectItem key={pool.id} value={pool.id}>
                                <div className="flex items-center gap-2">
                                  <HardDrive className="h-4 w-4" />
                                  {pool.name} ({pool.path})
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="name">Zone Name *</Label>
                        <Input
                          id="name"
                          placeholder="Team Documents"
                          value={formData.name}
                          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="path">Zone Path *</Label>
                        <div className="flex gap-2">
                          <Input
                            id="path"
                            placeholder="team-docs"
                            value={formData.path}
                            onChange={(e) => handlePathInput(e.target.value)}
                            className="flex-1"
                          />
                        </div>
                        {selectedPool && (
                          <p className="text-sm text-muted-foreground">
                            Full path: <code className="bg-muted px-1 rounded">{getFullPath()}</code>
                          </p>
                        )}
                      </div>

                      {/* Path Browser */}
                      {selectedPool && (
                        <div className="border rounded-lg p-4">
                          <Label className="text-sm font-medium">Browse Existing Directories</Label>
                          <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                            <Home className="h-4 w-4" />
                            <span className="font-mono">{currentPath}</span>
                          </div>
                          <div className="mt-2 max-h-48 overflow-y-auto border rounded">
                            {browseLoading ? (
                              <div className="p-4 text-center text-muted-foreground">Loading...</div>
                            ) : directories.length === 0 ? (
                              <div className="p-4 text-center text-muted-foreground">No subdirectories</div>
                            ) : (
                              directories.map((dir) => (
                                <button
                                  key={dir.path}
                                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted text-left text-sm"
                                  onClick={() => handlePathSelect(dir)}
                                >
                                  <Folder className="h-4 w-4 text-blue-500" />
                                  <span>{dir.name}</span>
                                  {!dir.writable && (
                                    <Badge variant="outline" className="ml-auto text-xs">Read-only</Badge>
                                  )}
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      )}

                      <div className="grid gap-2">
                        <Label htmlFor="zone_type">Zone Type *</Label>
                        <Select
                          value={formData.zone_type}
                          onValueChange={(value: "personal" | "group" | "public") =>
                            setFormData(prev => ({ ...prev, zone_type: value }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="personal">
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4" />
                                Personal - User home directories
                              </div>
                            </SelectItem>
                            <SelectItem value="group">
                              <div className="flex items-center gap-2">
                                <Users className="h-4 w-4" />
                                Group - Team/department shares
                              </div>
                            </SelectItem>
                            <SelectItem value="public">
                              <div className="flex items-center gap-2">
                                <Globe className="h-4 w-4" />
                                Public - Publicly accessible shares
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                          id="description"
                          placeholder="Describe the purpose of this zone..."
                          value={formData.description}
                          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Enabled</Label>
                          <p className="text-sm text-muted-foreground">Zone is active and accessible</p>
                        </div>
                        <Switch
                          checked={formData.enabled}
                          onCheckedChange={(checked) => setFormData(prev => ({ ...prev, enabled: checked }))}
                        />
                      </div>

                      {formData.zone_type === "personal" && (
                        <div className="flex items-center justify-between">
                          <div>
                            <Label>Auto-Provision</Label>
                            <p className="text-sm text-muted-foreground">Automatically create directories for new users</p>
                          </div>
                          <Switch
                            checked={formData.auto_provision}
                            onCheckedChange={(checked) => setFormData(prev => ({ ...prev, auto_provision: checked }))}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Step 2: Access Control */}
                {currentStep === 1 && (
                  <div className="space-y-6">
                    <div className="grid gap-6">
                      {/* General permissions */}
                      <div className="space-y-4">
                        <h3 className="text-lg font-medium">General Permissions</h3>
                        <div className="flex items-center justify-between">
                          <div>
                            <Label>Read Only</Label>
                            <p className="text-sm text-muted-foreground">Prevent any write operations</p>
                          </div>
                          <Switch
                            checked={formData.read_only}
                            onCheckedChange={(checked) => setFormData(prev => ({ ...prev, read_only: checked }))}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <Label>Browsable</Label>
                            <p className="text-sm text-muted-foreground">Show in network browser</p>
                          </div>
                          <Switch
                            checked={formData.browsable}
                            onCheckedChange={(checked) => setFormData(prev => ({ ...prev, browsable: checked }))}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <Label>Guest Access</Label>
                            <p className="text-sm text-muted-foreground">Allow anonymous access</p>
                          </div>
                          <Switch
                            checked={formData.allow_guest_access}
                            onCheckedChange={(checked) => setFormData(prev => ({ ...prev, allow_guest_access: checked }))}
                          />
                        </div>
                      </div>

                      {/* Allowed Users */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <Label>Allow All Users</Label>
                            <p className="text-sm text-muted-foreground">Grant access to all authenticated users</p>
                          </div>
                          <Switch
                            checked={allowAllUsers}
                            onCheckedChange={(checked) => {
                              setAllowAllUsers(checked);
                              if (checked) {
                                setFormData(prev => ({ ...prev, allowed_users: [] }));
                              }
                            }}
                          />
                        </div>

                        {!allowAllUsers && (
                          <>
                            <Label>Allowed Users</Label>
                            <div className="flex gap-2">
                              <Select value={newAllowedUser} onValueChange={setNewAllowedUser}>
                                <SelectTrigger className="flex-1">
                                  <SelectValue placeholder="Select user" />
                                </SelectTrigger>
                                <SelectContent>
                                  {systemUsers
                                    .filter(u => !formData.allowed_users.includes(u))
                                    .map((u) => (
                                      <SelectItem key={u} value={u}>{u}</SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                              <Button
                                variant="outline"
                                onClick={() => addToList("allowed_users", newAllowedUser, setNewAllowedUser)}
                              >
                                Add
                              </Button>
                            </div>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {formData.allowed_users.map((u) => (
                                <Badge key={u} variant="secondary" className="cursor-pointer" onClick={() => removeFromList("allowed_users", u)}>
                                  <User className="h-3 w-3 mr-1" />
                                  {u}
                                  <span className="ml-1">&times;</span>
                                </Badge>
                              ))}
                              {formData.allowed_users.length === 0 && (
                                <span className="text-sm text-muted-foreground text-amber-600">
                                  <AlertCircle className="h-3 w-3 inline mr-1" />
                                  No users selected - no one will have access
                                </span>
                              )}
                            </div>
                          </>
                        )}
                      </div>

                      {/* Allowed Groups */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <Label>Allow All Groups</Label>
                            <p className="text-sm text-muted-foreground">No group restriction (access based on user settings)</p>
                          </div>
                          <Switch
                            checked={allowAllGroups}
                            onCheckedChange={(checked) => {
                              setAllowAllGroups(checked);
                              if (checked) {
                                setFormData(prev => ({ ...prev, allowed_groups: [] }));
                              }
                            }}
                          />
                        </div>

                        {!allowAllGroups && (
                          <>
                            <Label>Allowed Groups</Label>
                            <div className="flex gap-2">
                              <Select value={newAllowedGroup} onValueChange={setNewAllowedGroup}>
                                <SelectTrigger className="flex-1">
                                  <SelectValue placeholder="Select group" />
                                </SelectTrigger>
                                <SelectContent>
                                  {systemGroups
                                    .filter(g => !formData.allowed_groups.includes(g))
                                    .map((g) => (
                                      <SelectItem key={g} value={g}>{g}</SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                              <Button
                                variant="outline"
                                onClick={() => addToList("allowed_groups", newAllowedGroup, setNewAllowedGroup)}
                              >
                                Add
                              </Button>
                            </div>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {formData.allowed_groups.map((g) => (
                                <Badge key={g} variant="secondary" className="cursor-pointer" onClick={() => removeFromList("allowed_groups", g)}>
                                  <Users className="h-3 w-3 mr-1" />
                                  {g}
                                  <span className="ml-1">&times;</span>
                                </Badge>
                              ))}
                              {formData.allowed_groups.length === 0 && (
                                <span className="text-sm text-muted-foreground text-amber-600">
                                  <AlertCircle className="h-3 w-3 inline mr-1" />
                                  No groups selected
                                </span>
                              )}
                            </div>
                          </>
                        )}
                      </div>

                      {/* Denied Users */}
                      <div className="space-y-2">
                        <Label>Denied Users</Label>
                        <div className="flex gap-2">
                          <Select value={newDenyUser} onValueChange={setNewDenyUser}>
                            <SelectTrigger className="flex-1">
                              <SelectValue placeholder="Select user to deny" />
                            </SelectTrigger>
                            <SelectContent>
                              {systemUsers
                                .filter(u => !formData.deny_users.includes(u))
                                .map((u) => (
                                  <SelectItem key={u} value={u}>{u}</SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <Button
                            variant="outline"
                            onClick={() => addToList("deny_users", newDenyUser, setNewDenyUser)}
                          >
                            Add
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {formData.deny_users.map((u) => (
                            <Badge key={u} variant="destructive" className="cursor-pointer" onClick={() => removeFromList("deny_users", u)}>
                              <User className="h-3 w-3 mr-1" />
                              {u}
                              <span className="ml-1">&times;</span>
                            </Badge>
                          ))}
                          {formData.deny_users.length === 0 && (
                            <span className="text-sm text-muted-foreground">No users denied</span>
                          )}
                        </div>
                      </div>

                      {/* Denied Groups */}
                      <div className="space-y-2">
                        <Label>Denied Groups</Label>
                        <div className="flex gap-2">
                          <Select value={newDenyGroup} onValueChange={setNewDenyGroup}>
                            <SelectTrigger className="flex-1">
                              <SelectValue placeholder="Select group to deny" />
                            </SelectTrigger>
                            <SelectContent>
                              {systemGroups
                                .filter(g => !formData.deny_groups.includes(g))
                                .map((g) => (
                                  <SelectItem key={g} value={g}>{g}</SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <Button
                            variant="outline"
                            onClick={() => addToList("deny_groups", newDenyGroup, setNewDenyGroup)}
                          >
                            Add
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {formData.deny_groups.map((g) => (
                            <Badge key={g} variant="destructive" className="cursor-pointer" onClick={() => removeFromList("deny_groups", g)}>
                              <Users className="h-3 w-3 mr-1" />
                              {g}
                              <span className="ml-1">&times;</span>
                            </Badge>
                          ))}
                          {formData.deny_groups.length === 0 && (
                            <span className="text-sm text-muted-foreground">No groups denied</span>
                          )}
                        </div>
                      </div>

                      {/* Quota */}
                      <div className="space-y-2">
                        <Label htmlFor="quota">User Quota (GB)</Label>
                        <Input
                          id="quota"
                          type="number"
                          min="0"
                          placeholder="0 = unlimited"
                          value={formData.max_quota_per_user || ""}
                          onChange={(e) => setFormData(prev => ({ ...prev, max_quota_per_user: parseInt(e.target.value) || 0 }))}
                        />
                        <p className="text-sm text-muted-foreground">Maximum storage per user in this zone (0 = unlimited)</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 3: SMB Configuration */}
                {currentStep === 2 && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between pb-4 border-b">
                      <div>
                        <h3 className="text-lg font-medium flex items-center gap-2">
                          <Server className="h-5 w-5" />
                          SMB/CIFS Sharing
                        </h3>
                        <p className="text-sm text-muted-foreground">Configure Windows file sharing (Samba)</p>
                      </div>
                      <Switch
                        checked={formData.smb_enabled}
                        onCheckedChange={(checked) => setFormData(prev => ({ ...prev, smb_enabled: checked }))}
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
                              onChange={(e) => setFormData(prev => ({
                                ...prev,
                                smb_options: { ...prev.smb_options, share_name: e.target.value }
                              }))}
                            />
                            <p className="text-xs text-muted-foreground">Name shown in Windows network</p>
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="smb_comment">Comment</Label>
                            <Input
                              id="smb_comment"
                              placeholder="Team documents share"
                              value={formData.smb_options.comment}
                              onChange={(e) => setFormData(prev => ({
                                ...prev,
                                smb_options: { ...prev.smb_options, comment: e.target.value }
                              }))}
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
                              onChange={(e) => setFormData(prev => ({
                                ...prev,
                                smb_options: { ...prev.smb_options, create_mask: e.target.value }
                              }))}
                            />
                            <p className="text-xs text-muted-foreground">Permissions for new files</p>
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="smb_dir_mask">Directory Create Mask</Label>
                            <Input
                              id="smb_dir_mask"
                              placeholder="0755"
                              value={formData.smb_options.directory_mask}
                              onChange={(e) => setFormData(prev => ({
                                ...prev,
                                smb_options: { ...prev.smb_options, directory_mask: e.target.value }
                              }))}
                            />
                            <p className="text-xs text-muted-foreground">Permissions for new directories</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="grid gap-2">
                            <Label htmlFor="smb_force_user">Force User</Label>
                            <Input
                              id="smb_force_user"
                              placeholder="nobody"
                              value={formData.smb_options.force_user}
                              onChange={(e) => setFormData(prev => ({
                                ...prev,
                                smb_options: { ...prev.smb_options, force_user: e.target.value }
                              }))}
                            />
                            <p className="text-xs text-muted-foreground">Run all operations as this user</p>
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="smb_force_group">Force Group</Label>
                            <Input
                              id="smb_force_group"
                              placeholder="nogroup"
                              value={formData.smb_options.force_group}
                              onChange={(e) => setFormData(prev => ({
                                ...prev,
                                smb_options: { ...prev.smb_options, force_group: e.target.value }
                              }))}
                            />
                            <p className="text-xs text-muted-foreground">Run all operations as this group</p>
                          </div>
                        </div>

                        <div className="grid gap-2">
                          <Label htmlFor="smb_veto">Veto Files</Label>
                          <Input
                            id="smb_veto"
                            placeholder="/*.exe/*.bat/*.cmd/"
                            value={formData.smb_options.veto_files}
                            onChange={(e) => setFormData(prev => ({
                              ...prev,
                              smb_options: { ...prev.smb_options, veto_files: e.target.value }
                            }))}
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
                            onCheckedChange={(checked) => setFormData(prev => ({
                              ...prev,
                              smb_options: { ...prev.smb_options, inherit: checked }
                            }))}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Step 4: NFS Configuration */}
                {currentStep === 3 && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between pb-4 border-b">
                      <div>
                        <h3 className="text-lg font-medium flex items-center gap-2">
                          <HardDrive className="h-5 w-5" />
                          NFS Sharing
                        </h3>
                        <p className="text-sm text-muted-foreground">Configure Network File System exports</p>
                      </div>
                      <Switch
                        checked={formData.nfs_enabled}
                        onCheckedChange={(checked) => setFormData(prev => ({ ...prev, nfs_enabled: checked }))}
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
                          <div className="flex flex-wrap gap-2 mt-2">
                            {formData.nfs_options.allowed_hosts.map((host) => (
                              <Badge key={host} variant="secondary" className="cursor-pointer" onClick={() => removeNFSHost(host)}>
                                <Network className="h-3 w-3 mr-1" />
                                {host}
                                <span className="ml-1">&times;</span>
                              </Badge>
                            ))}
                          </div>
                          <p className="text-xs text-muted-foreground">Networks/hosts allowed to mount (use * for all)</p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <Label>Root Squash</Label>
                              <p className="text-xs text-muted-foreground">Map root to nobody</p>
                            </div>
                            <Switch
                              checked={formData.nfs_options.root_squash}
                              onCheckedChange={(checked) => setFormData(prev => ({
                                ...prev,
                                nfs_options: { ...prev.nfs_options, root_squash: checked }
                              }))}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <div>
                              <Label>All Squash</Label>
                              <p className="text-xs text-muted-foreground">Map all users to nobody</p>
                            </div>
                            <Switch
                              checked={formData.nfs_options.all_squash}
                              onCheckedChange={(checked) => setFormData(prev => ({
                                ...prev,
                                nfs_options: { ...prev.nfs_options, all_squash: checked }
                              }))}
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
                              onChange={(e) => setFormData(prev => ({
                                ...prev,
                                nfs_options: { ...prev.nfs_options, anon_uid: parseInt(e.target.value) || 65534 }
                              }))}
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="nfs_anon_gid">Anonymous GID</Label>
                            <Input
                              id="nfs_anon_gid"
                              type="number"
                              value={formData.nfs_options.anon_gid}
                              onChange={(e) => setFormData(prev => ({
                                ...prev,
                                nfs_options: { ...prev.nfs_options, anon_gid: parseInt(e.target.value) || 65534 }
                              }))}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <Label>Sync</Label>
                              <p className="text-xs text-muted-foreground">Sync writes immediately</p>
                            </div>
                            <Switch
                              checked={formData.nfs_options.sync}
                              onCheckedChange={(checked) => setFormData(prev => ({
                                ...prev,
                                nfs_options: { ...prev.nfs_options, sync: checked }
                              }))}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <div>
                              <Label>Secure</Label>
                              <p className="text-xs text-muted-foreground">Require privileged ports</p>
                            </div>
                            <Switch
                              checked={formData.nfs_options.secure}
                              onCheckedChange={(checked) => setFormData(prev => ({
                                ...prev,
                                nfs_options: { ...prev.nfs_options, secure: checked }
                              }))}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <div>
                              <Label>No Subtree Check</Label>
                              <p className="text-xs text-muted-foreground">Disable subtree checking</p>
                            </div>
                            <Switch
                              checked={formData.nfs_options.no_subtree_check}
                              onCheckedChange={(checked) => setFormData(prev => ({
                                ...prev,
                                nfs_options: { ...prev.nfs_options, no_subtree_check: checked }
                              }))}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Step 5: Web Sharing */}
                {currentStep === 4 && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between pb-4 border-b">
                      <div>
                        <h3 className="text-lg font-medium flex items-center gap-2">
                          <Link2 className="h-5 w-5" />
                          Web Sharing
                        </h3>
                        <p className="text-sm text-muted-foreground">Configure web-based file access and public links</p>
                      </div>
                      <Switch
                        checked={formData.web_enabled}
                        onCheckedChange={(checked) => setFormData(prev => ({ ...prev, web_enabled: checked }))}
                      />
                    </div>

                    {formData.web_enabled && (
                      <div className="grid gap-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <Label>Public Link Sharing</Label>
                            <p className="text-sm text-muted-foreground">Allow users to create shareable links</p>
                          </div>
                          <Switch
                            checked={formData.web_options.public_enabled}
                            onCheckedChange={(checked) => setFormData(prev => ({
                              ...prev,
                              web_options: { ...prev.web_options, public_enabled: checked }
                            }))}
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
                            onChange={(e) => setFormData(prev => ({
                              ...prev,
                              web_options: { ...prev.web_options, max_link_expiry: parseInt(e.target.value) || 0 }
                            }))}
                          />
                          <p className="text-xs text-muted-foreground">Maximum days before links expire (0 = unlimited)</p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <Label>Allow Download</Label>
                              <p className="text-xs text-muted-foreground">Users can download files</p>
                            </div>
                            <Switch
                              checked={formData.web_options.allow_download}
                              onCheckedChange={(checked) => setFormData(prev => ({
                                ...prev,
                                web_options: { ...prev.web_options, allow_download: checked }
                              }))}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <div>
                              <Label>Allow Upload</Label>
                              <p className="text-xs text-muted-foreground">Users can upload files</p>
                            </div>
                            <Switch
                              checked={formData.web_options.allow_upload}
                              onCheckedChange={(checked) => setFormData(prev => ({
                                ...prev,
                                web_options: { ...prev.web_options, allow_upload: checked }
                              }))}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <Label>Allow Preview</Label>
                              <p className="text-xs text-muted-foreground">Show file previews in browser</p>
                            </div>
                            <Switch
                              checked={formData.web_options.allow_preview}
                              onCheckedChange={(checked) => setFormData(prev => ({
                                ...prev,
                                web_options: { ...prev.web_options, allow_preview: checked }
                              }))}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <div>
                              <Label>Allow Listing</Label>
                              <p className="text-xs text-muted-foreground">Show folder contents</p>
                            </div>
                            <Switch
                              checked={formData.web_options.allow_listing}
                              onCheckedChange={(checked) => setFormData(prev => ({
                                ...prev,
                                web_options: { ...prev.web_options, allow_listing: checked }
                              }))}
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
                            onCheckedChange={(checked) => setFormData(prev => ({
                              ...prev,
                              web_options: { ...prev.web_options, require_auth: checked }
                            }))}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Step 6: Review */}
                {currentStep === 5 && (
                  <div className="space-y-6">
                    <h3 className="text-lg font-medium">Review Zone Configuration</h3>

                    <div className="grid gap-4">
                      {/* Basic Info */}
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Info className="h-4 w-4" />
                            Basic Information
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm space-y-1">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Name:</span>
                            <span className="font-medium">{formData.name}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Pool:</span>
                            <span className="font-medium">{selectedPool?.name}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Path:</span>
                            <span className="font-mono text-xs">{getFullPath()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Type:</span>
                            <Badge variant="outline">{formData.zone_type}</Badge>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Status:</span>
                            <Badge variant={formData.enabled ? "default" : "secondary"}>
                              {formData.enabled ? "Enabled" : "Disabled"}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Access Control */}
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Shield className="h-4 w-4" />
                            Access Control
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm space-y-2">
                          <div className="flex gap-2 flex-wrap">
                            {formData.read_only && <Badge variant="secondary">Read Only</Badge>}
                            {formData.browsable && <Badge variant="secondary">Browsable</Badge>}
                            {formData.allow_guest_access && <Badge variant="secondary">Guest Access</Badge>}
                            {allowAllUsers && <Badge variant="default">All Users Allowed</Badge>}
                            {allowAllGroups && <Badge variant="default">All Groups Allowed</Badge>}
                          </div>
                          {!allowAllUsers && formData.allowed_users.length > 0 && (
                            <div>
                              <span className="text-muted-foreground">Allowed Users: </span>
                              {formData.allowed_users.join(", ")}
                            </div>
                          )}
                          {!allowAllGroups && formData.allowed_groups.length > 0 && (
                            <div>
                              <span className="text-muted-foreground">Allowed Groups: </span>
                              {formData.allowed_groups.join(", ")}
                            </div>
                          )}
                          {formData.deny_users.length > 0 && (
                            <div>
                              <span className="text-muted-foreground">Denied Users: </span>
                              {formData.deny_users.join(", ")}
                            </div>
                          )}
                          {formData.deny_groups.length > 0 && (
                            <div>
                              <span className="text-muted-foreground">Denied Groups: </span>
                              {formData.deny_groups.join(", ")}
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      {/* Sharing Protocols */}
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Network className="h-4 w-4" />
                            Sharing Protocols
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm space-y-2">
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              <Server className="h-4 w-4" />
                              <span>SMB:</span>
                              <Badge variant={formData.smb_enabled ? "default" : "secondary"}>
                                {formData.smb_enabled ? "Enabled" : "Disabled"}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              <HardDrive className="h-4 w-4" />
                              <span>NFS:</span>
                              <Badge variant={formData.nfs_enabled ? "default" : "secondary"}>
                                {formData.nfs_enabled ? "Enabled" : "Disabled"}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              <Link2 className="h-4 w-4" />
                              <span>Web:</span>
                              <Badge variant={formData.web_enabled ? "default" : "secondary"}>
                                {formData.web_enabled ? "Enabled" : "Disabled"}
                              </Badge>
                            </div>
                          </div>
                          {formData.smb_enabled && formData.smb_options.share_name && (
                            <div>
                              <span className="text-muted-foreground">SMB Share Name: </span>
                              {formData.smb_options.share_name}
                            </div>
                          )}
                          {formData.nfs_enabled && formData.nfs_options.allowed_hosts.length > 0 && (
                            <div>
                              <span className="text-muted-foreground">NFS Allowed Hosts: </span>
                              {formData.nfs_options.allowed_hosts.join(", ")}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                )}

                {/* Navigation Buttons */}
                <div className="flex justify-between mt-8 pt-6 border-t">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentStep(prev => prev - 1)}
                    disabled={currentStep === 0}
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Previous
                  </Button>
                  {currentStep < STEPS.length - 1 ? (
                    <Button
                      onClick={() => setCurrentStep(prev => prev + 1)}
                      disabled={!canProceed()}
                    >
                      Next
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  ) : (
                    <Button onClick={handleSubmit} disabled={isSubmitting}>
                      {isSubmitting ? "Saving..." : "Save Changes"}
                      <Check className="h-4 w-4 ml-2" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}
