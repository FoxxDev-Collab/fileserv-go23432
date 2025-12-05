"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth-context";
import {
  zfsAPI,
  SnapshotPolicy,
  SnapshotPolicySnapshot,
  ZFSDataset,
} from "@/lib/api";
import { PageSkeleton } from "@/components/skeletons";
import { toast } from "sonner";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Clock,
  Calendar,
  RefreshCw,
  Plus,
  Trash2,
  Play,
  Pause,
  MoreVertical,
  Camera,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  History,
  Settings2,
} from "lucide-react";

function formatDate(dateStr?: string): string {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  return date.toLocaleString();
}

function getScheduleDescription(schedule: string): string {
  switch (schedule) {
    case "hourly":
      return "Every hour at :00";
    case "daily":
      return "Every day at 00:00";
    case "weekly":
      return "Every Sunday at 00:00";
    case "monthly":
      return "1st of each month at 00:00";
    default:
      return schedule;
  }
}

function getScheduleIcon(schedule: string) {
  switch (schedule) {
    case "hourly":
      return <Clock className="h-4 w-4" />;
    case "daily":
    case "weekly":
    case "monthly":
      return <Calendar className="h-4 w-4" />;
    default:
      return <Clock className="h-4 w-4" />;
  }
}

export default function SnapshotSchedulingPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [policies, setPolicies] = useState<SnapshotPolicy[]>([]);
  const [datasets, setDatasets] = useState<ZFSDataset[]>([]);
  const [schedulerStatus, setSchedulerStatus] = useState<{
    running: boolean;
    total_policies: number;
    enabled_policies: number;
  } | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showSnapshotsDialog, setShowSnapshotsDialog] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<SnapshotPolicy | null>(null);
  const [policySnapshots, setPolicySnapshots] = useState<SnapshotPolicySnapshot[]>([]);
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState(false);

  // Form states
  const [formName, setFormName] = useState("");
  const [formDataset, setFormDataset] = useState("");
  const [formSchedule, setFormSchedule] = useState("daily");
  const [formRetention, setFormRetention] = useState("7");
  const [formPrefix, setFormPrefix] = useState("auto");
  const [formRecursive, setFormRecursive] = useState(false);
  const [formEnabled, setFormEnabled] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (isAuthenticated && user?.role === "admin") {
      loadData();
    }
  }, [isAuthenticated, user]);

  const loadData = async () => {
    try {
      const [policiesData, datasetsData, statusData] = await Promise.all([
        zfsAPI.listSnapshotPolicies(),
        zfsAPI.listDatasets(),
        zfsAPI.getSchedulerStatus(),
      ]);

      if (policiesData) setPolicies(policiesData);
      if (datasetsData) setDatasets(datasetsData);
      if (statusData) setSchedulerStatus(statusData);
    } catch (error) {
      console.error("Failed to load data:", error);
      toast.error("Failed to load snapshot policies");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadData();
  };

  const handleCreatePolicy = async () => {
    if (!formName || !formDataset) {
      toast.error("Name and dataset are required");
      return;
    }

    setIsSubmitting(true);
    try {
      await zfsAPI.createSnapshotPolicy({
        name: formName,
        dataset: formDataset,
        schedule: formSchedule,
        retention: parseInt(formRetention) || 7,
        prefix: formPrefix || "auto",
        recursive: formRecursive,
        enabled: formEnabled,
      });
      toast.success("Snapshot policy created");
      setShowCreateDialog(false);
      resetForm();
      loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create policy");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePolicy = async () => {
    if (!selectedPolicy) return;

    setIsSubmitting(true);
    try {
      await zfsAPI.deleteSnapshotPolicy(selectedPolicy.id);
      toast.success("Policy deleted");
      setShowDeleteDialog(false);
      setSelectedPolicy(null);
      loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete policy");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleEnabled = async (policy: SnapshotPolicy) => {
    try {
      await zfsAPI.updateSnapshotPolicy(policy.id, {
        enabled: !policy.enabled,
      });
      toast.success(policy.enabled ? "Policy disabled" : "Policy enabled");
      loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update policy");
    }
  };

  const handleRunPolicy = async (policy: SnapshotPolicy) => {
    try {
      toast.info("Running snapshot policy...");
      await zfsAPI.runSnapshotPolicy(policy.id);
      toast.success("Snapshot created successfully");
      loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to run policy");
    }
  };

  const handleViewSnapshots = async (policy: SnapshotPolicy) => {
    setSelectedPolicy(policy);
    setShowSnapshotsDialog(true);
    setIsLoadingSnapshots(true);

    try {
      const snapshots = await zfsAPI.getSnapshotPolicySnapshots(policy.id);
      if (snapshots) {
        setPolicySnapshots(snapshots);
      }
    } catch (error) {
      toast.error("Failed to load snapshots");
    } finally {
      setIsLoadingSnapshots(false);
    }
  };

  const resetForm = () => {
    setFormName("");
    setFormDataset("");
    setFormSchedule("daily");
    setFormRetention("7");
    setFormPrefix("auto");
    setFormRecursive(false);
    setFormEnabled(true);
  };

  if (authLoading || isLoading) {
    return <PageSkeleton />;
  }

  if (user?.role !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              You need administrator privileges to access this page.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Snapshot Scheduling</h1>
                <p className="text-muted-foreground">
                  Automate ZFS snapshots with configurable retention policies
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
                <Button onClick={() => setShowCreateDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  New Policy
                </Button>
              </div>
            </div>

            {/* Status Cards */}
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Scheduler Status</CardTitle>
                  <Settings2 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    {schedulerStatus?.running ? (
                      <>
                        <CheckCircle className="h-5 w-5 text-green-500" />
                        <span className="text-2xl font-bold text-green-600">Running</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-5 w-5 text-red-500" />
                        <span className="text-2xl font-bold text-red-600">Stopped</span>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Policies</CardTitle>
                  <Camera className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{schedulerStatus?.total_policies || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    snapshot policies configured
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Policies</CardTitle>
                  <Play className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{schedulerStatus?.enabled_policies || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    policies currently enabled
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Policies Table */}
            <Card>
              <CardHeader>
                <CardTitle>Snapshot Policies</CardTitle>
                <CardDescription>
                  Configure automated snapshot schedules for your ZFS datasets
                </CardDescription>
              </CardHeader>
              <CardContent>
                {policies.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Camera className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">No snapshot policies configured</p>
                    <p className="text-sm">Create a policy to automate ZFS snapshots</p>
                    <Button
                      className="mt-4"
                      onClick={() => setShowCreateDialog(true)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Create First Policy
                    </Button>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Dataset</TableHead>
                        <TableHead>Schedule</TableHead>
                        <TableHead>Retention</TableHead>
                        <TableHead>Snapshots</TableHead>
                        <TableHead>Last Run</TableHead>
                        <TableHead>Next Run</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {policies.map((policy) => (
                        <TableRow key={policy.id}>
                          <TableCell className="font-medium">{policy.name}</TableCell>
                          <TableCell className="font-mono text-sm">{policy.dataset}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getScheduleIcon(policy.schedule)}
                              <span className="capitalize">{policy.schedule}</span>
                            </div>
                          </TableCell>
                          <TableCell>{policy.retention} snapshots</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-auto p-1"
                              onClick={() => handleViewSnapshots(policy)}
                            >
                              <History className="h-4 w-4 mr-1" />
                              {policy.snapshot_count}
                            </Button>
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatDate(policy.last_run)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatDate(policy.next_run)}
                          </TableCell>
                          <TableCell>
                            {policy.last_error ? (
                              <Badge variant="destructive" className="gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                Error
                              </Badge>
                            ) : policy.enabled ? (
                              <Badge variant="default" className="gap-1 bg-green-600">
                                <CheckCircle className="h-3 w-3" />
                                Active
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="gap-1">
                                <Pause className="h-3 w-3" />
                                Paused
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleRunPolicy(policy)}>
                                  <Play className="h-4 w-4 mr-2" />
                                  Run Now
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleViewSnapshots(policy)}>
                                  <History className="h-4 w-4 mr-2" />
                                  View Snapshots
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleToggleEnabled(policy)}>
                                  {policy.enabled ? (
                                    <>
                                      <Pause className="h-4 w-4 mr-2" />
                                      Disable
                                    </>
                                  ) : (
                                    <>
                                      <Play className="h-4 w-4 mr-2" />
                                      Enable
                                    </>
                                  )}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-red-600"
                                  onClick={() => {
                                    setSelectedPolicy(policy);
                                    setShowDeleteDialog(true);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
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
              </CardContent>
            </Card>

            {/* Schedule Reference */}
            <Card>
              <CardHeader>
                <CardTitle>Schedule Reference</CardTitle>
                <CardDescription>
                  Understanding snapshot schedules and retention
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="h-5 w-5 text-blue-500" />
                      <span className="font-medium">Hourly</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Creates a snapshot every hour at :00. Good for frequently changing data.
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="h-5 w-5 text-green-500" />
                      <span className="font-medium">Daily</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Creates a snapshot every day at midnight. Recommended for most use cases.
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="h-5 w-5 text-orange-500" />
                      <span className="font-medium">Weekly</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Creates a snapshot every Sunday at midnight. Good for archival purposes.
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="h-5 w-5 text-purple-500" />
                      <span className="font-medium">Monthly</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Creates a snapshot on the 1st of each month. Best for long-term retention.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>

      {/* Create Policy Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Snapshot Policy</DialogTitle>
            <DialogDescription>
              Configure an automated snapshot schedule for a ZFS dataset
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Policy Name</Label>
              <Input
                id="name"
                placeholder="e.g., daily-backups"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dataset">Dataset</Label>
              <Select value={formDataset} onValueChange={setFormDataset}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a dataset" />
                </SelectTrigger>
                <SelectContent>
                  {datasets.map((ds) => (
                    <SelectItem key={ds.name} value={ds.name}>
                      {ds.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="schedule">Schedule</Label>
              <Select value={formSchedule} onValueChange={setFormSchedule}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hourly">Hourly</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {getScheduleDescription(formSchedule)}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="retention">Retention (snapshots to keep)</Label>
              <Input
                id="retention"
                type="number"
                min="1"
                max="1000"
                value={formRetention}
                onChange={(e) => setFormRetention(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Older snapshots will be automatically deleted
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="prefix">Snapshot Prefix</Label>
              <Input
                id="prefix"
                placeholder="auto"
                value={formPrefix}
                onChange={(e) => setFormPrefix(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Snapshots will be named: {formPrefix || "auto"}-{formSchedule}-TIMESTAMP
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Recursive Snapshots</Label>
                <p className="text-xs text-muted-foreground">
                  Include all child datasets
                </p>
              </div>
              <Switch
                checked={formRecursive}
                onCheckedChange={setFormRecursive}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Enable Policy</Label>
                <p className="text-xs text-muted-foreground">
                  Start scheduling immediately
                </p>
              </div>
              <Switch
                checked={formEnabled}
                onCheckedChange={setFormEnabled}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreatePolicy} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Policy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Snapshot Policy</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the policy &quot;{selectedPolicy?.name}&quot;?
              This will stop automatic snapshots but will not delete existing snapshots.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeletePolicy}
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete Policy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Snapshots Dialog */}
      <Dialog open={showSnapshotsDialog} onOpenChange={setShowSnapshotsDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Policy Snapshots</DialogTitle>
            <DialogDescription>
              Snapshots created by policy &quot;{selectedPolicy?.name}&quot;
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {isLoadingSnapshots ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : policySnapshots.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Camera className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No snapshots created by this policy yet</p>
              </div>
            ) : (
              <div className="max-h-96 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Snapshot Name</TableHead>
                      <TableHead>Used</TableHead>
                      <TableHead>Referenced</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {policySnapshots.map((snap) => (
                      <TableRow key={snap.name}>
                        <TableCell className="font-mono text-sm">{snap.name}</TableCell>
                        <TableCell>{snap.used}</TableCell>
                        <TableCell>{snap.referenced}</TableCell>
                        <TableCell>{snap.creation}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSnapshotsDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
