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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useAuth } from "@/lib/auth-context";
import {
  storageAPI,
  poolsAPI,
  BrowseResponse,
  DirectoryEntry,
  AvailableDevice,
} from "@/lib/api";
import { PageSkeleton } from "@/components/skeletons";
import { toast } from "sonner";
import {
  Database,
  FolderOpen,
  HardDrive,
  ChevronRight,
  ChevronLeft,
  Check,
  ArrowLeft,
  Folder,
  RefreshCw,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  XCircle,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

type SourceType = "existing" | "new_device";
type Step = 1 | 2 | 3 | 4;

interface PoolFormData {
  name: string;
  path: string;
  description: string;
  enabled: boolean;
  reserved: number;
  max_file_size: number;
  default_user_quota: number;
  default_group_quota: number;
  allowed_types: string;
  denied_types: string;
}

interface DeviceSetupData {
  device: string;
  fstype: string;
  label: string;
  mount_point: string;
  persistent: boolean;
}

const initialFormData: PoolFormData = {
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
};

const initialDeviceSetup: DeviceSetupData = {
  device: "",
  fstype: "ext4",
  label: "",
  mount_point: "",
  persistent: true,
};

export default function CreatePoolPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  // Wizard state
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [sourceType, setSourceType] = useState<SourceType | null>(null);

  // Form data
  const [formData, setFormData] = useState<PoolFormData>(initialFormData);
  const [deviceSetup, setDeviceSetup] = useState<DeviceSetupData>(initialDeviceSetup);

  // Path browser state
  const [browseData, setBrowseData] = useState<BrowseResponse | null>(null);
  const [isLoadingBrowse, setIsLoadingBrowse] = useState(false);
  const [pathInput, setPathInput] = useState("");

  // Device list state
  const [devices, setDevices] = useState<AvailableDevice[]>([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

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

  // Load initial directory listing
  useEffect(() => {
    if (currentStep === 2 && sourceType === "existing") {
      browseDirectory("/");
    }
  }, [currentStep, sourceType]);

  // Load devices when on device step
  useEffect(() => {
    if (currentStep === 2 && sourceType === "new_device") {
      loadDevices();
    }
  }, [currentStep, sourceType]);

  const browseDirectory = async (path: string) => {
    setIsLoadingBrowse(true);
    try {
      const data = await storageAPI.browseDirectories(path);
      setBrowseData(data);
      setPathInput(data.current_path);
    } catch (error) {
      toast.error(`Failed to browse directory: ${error}`);
    } finally {
      setIsLoadingBrowse(false);
    }
  };

  const loadDevices = async () => {
    setIsLoadingDevices(true);
    try {
      const data = await storageAPI.getAvailableDevices();
      setDevices(data || []);
    } catch (error) {
      toast.error(`Failed to load devices: ${error}`);
    } finally {
      setIsLoadingDevices(false);
    }
  };

  const handlePathInputSubmit = () => {
    if (pathInput) {
      browseDirectory(pathInput);
    }
  };

  const handleSelectDirectory = (entry: DirectoryEntry) => {
    if (entry.name === "..") {
      browseDirectory(entry.path);
    } else {
      browseDirectory(entry.path);
    }
  };

  const handleUsePath = (path: string) => {
    setFormData({ ...formData, path });
    setCurrentStep(3);
  };

  const handleSelectDevice = (device: AvailableDevice) => {
    setDeviceSetup({
      ...deviceSetup,
      device: device.path,
      label: formData.name || device.name,
    });
  };

  const handleDeviceSetupComplete = async () => {
    if (!deviceSetup.device || !deviceSetup.mount_point) {
      toast.error("Please select a device and specify a mount point");
      return;
    }

    setShowConfirmDialog(true);
  };

  const executeDeviceSetup = async () => {
    setShowConfirmDialog(false);
    setIsProcessing(true);

    try {
      await storageAPI.setupDevice({
        device: deviceSetup.device,
        fstype: deviceSetup.fstype,
        label: deviceSetup.label,
        mount_point: deviceSetup.mount_point,
        persistent: deviceSetup.persistent,
        force: true,
      });

      toast.success("Device formatted and mounted successfully");
      setFormData({ ...formData, path: deviceSetup.mount_point });
      setCurrentStep(3);
    } catch (error) {
      toast.error(`Failed to setup device: ${error}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreatePool = async () => {
    setIsProcessing(true);

    try {
      await poolsAPI.create({
        name: formData.name,
        path: formData.path,
        description: formData.description,
        enabled: formData.enabled,
        reserved: formData.reserved * 1024 * 1024 * 1024,
        max_file_size: formData.max_file_size * 1024 * 1024,
        default_user_quota: formData.default_user_quota * 1024 * 1024 * 1024,
        default_group_quota: formData.default_group_quota * 1024 * 1024 * 1024,
        allowed_types: formData.allowed_types ? formData.allowed_types.split(",").map(s => s.trim()) : [],
        denied_types: formData.denied_types ? formData.denied_types.split(",").map(s => s.trim()) : [],
      });

      toast.success("Storage pool created successfully");
      router.push("/admin/storage/pools");
    } catch (error) {
      toast.error(`Failed to create pool: ${error}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return sourceType !== null;
      case 2:
        if (sourceType === "existing") {
          return formData.path !== "";
        } else {
          return deviceSetup.device !== "" && deviceSetup.mount_point !== "";
        }
      case 3:
        return formData.name !== "" && formData.path !== "";
      case 4:
        return true;
      default:
        return false;
    }
  };

  const goToNextStep = () => {
    if (currentStep === 2 && sourceType === "new_device") {
      handleDeviceSetupComplete();
    } else if (currentStep < 4) {
      setCurrentStep((currentStep + 1) as Step);
    }
  };

  const goToPreviousStep = () => {
    if (currentStep > 1) {
      setCurrentStep((currentStep - 1) as Step);
    }
  };

  // Show skeleton during initial auth check
  if (authLoading && !user) {
    return <PageSkeleton title="Create Storage Pool" />;
  }

  if (!isAuthenticated || (user && user.role !== "admin")) {
    return <PageSkeleton title="Create Storage Pool" />;
  }

  const steps = [
    { number: 1, title: "Choose Source", description: "Select storage source" },
    { number: 2, title: "Configure Source", description: "Set up the storage location" },
    { number: 3, title: "Pool Settings", description: "Configure pool options" },
    { number: 4, title: "Review", description: "Confirm and create" },
  ];

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push("/admin/storage/pools")}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Pools
              </Button>
            </div>

            <div>
              <h1 className="text-2xl font-bold">Create Storage Pool</h1>
              <p className="text-muted-foreground">
                Set up a new storage location for shares and user data
              </p>
            </div>

            {/* Progress Steps */}
            <div className="flex items-center justify-between">
              {steps.map((step, index) => (
                <div key={step.number} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors",
                        currentStep === step.number
                          ? "border-primary bg-primary text-primary-foreground"
                          : currentStep > step.number
                          ? "border-primary bg-primary/20 text-primary"
                          : "border-muted-foreground/30 text-muted-foreground"
                      )}
                    >
                      {currentStep > step.number ? (
                        <Check className="h-5 w-5" />
                      ) : (
                        step.number
                      )}
                    </div>
                    <div className="mt-2 text-center">
                      <p className={cn(
                        "text-sm font-medium",
                        currentStep >= step.number ? "text-foreground" : "text-muted-foreground"
                      )}>
                        {step.title}
                      </p>
                      <p className="text-xs text-muted-foreground hidden sm:block">
                        {step.description}
                      </p>
                    </div>
                  </div>
                  {index < steps.length - 1 && (
                    <div
                      className={cn(
                        "h-0.5 w-16 sm:w-24 mx-2",
                        currentStep > step.number ? "bg-primary" : "bg-muted-foreground/30"
                      )}
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Step Content */}
            <Card>
              <CardContent className="pt-6">
                {/* Step 1: Choose Source */}
                {currentStep === 1 && (
                  <div className="space-y-6">
                    <div className="text-center mb-8">
                      <h2 className="text-xl font-semibold mb-2">Choose Your Storage Source</h2>
                      <p className="text-muted-foreground">
                        Select how you want to set up the storage for this pool
                      </p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                      {/* Existing Path Option */}
                      <Card
                        className={cn(
                          "cursor-pointer transition-all hover:border-primary",
                          sourceType === "existing" && "border-primary ring-2 ring-primary/20"
                        )}
                        onClick={() => setSourceType("existing")}
                      >
                        <CardContent className="pt-6">
                          <div className="flex flex-col items-center text-center space-y-4">
                            <div className="p-4 rounded-full bg-blue-500/10">
                              <FolderOpen className="h-10 w-10 text-blue-500" />
                            </div>
                            <div>
                              <h3 className="text-lg font-semibold">Use Existing Path</h3>
                              <p className="text-sm text-muted-foreground mt-2">
                                Select an existing directory on a mounted filesystem.
                                Best for already configured storage.
                              </p>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                              <span>No formatting required</span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* New Device Option */}
                      <Card
                        className={cn(
                          "cursor-pointer transition-all hover:border-primary",
                          sourceType === "new_device" && "border-primary ring-2 ring-primary/20"
                        )}
                        onClick={() => setSourceType("new_device")}
                      >
                        <CardContent className="pt-6">
                          <div className="flex flex-col items-center text-center space-y-4">
                            <div className="p-4 rounded-full bg-orange-500/10">
                              <HardDrive className="h-10 w-10 text-orange-500" />
                            </div>
                            <div>
                              <h3 className="text-lg font-semibold">Setup New Device</h3>
                              <p className="text-sm text-muted-foreground mt-2">
                                Format and mount a new storage device.
                                Ideal for adding new drives.
                              </p>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <AlertTriangle className="h-4 w-4 text-yellow-500" />
                              <span>Will format and erase device</span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                )}

                {/* Step 2: Configure Source */}
                {currentStep === 2 && sourceType === "existing" && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-xl font-semibold mb-2">Select Storage Path</h2>
                      <p className="text-muted-foreground">
                        Browse and select a directory for your storage pool
                      </p>
                    </div>

                    {/* Path Input */}
                    <div className="flex gap-2">
                      <Input
                        placeholder="/path/to/storage"
                        value={pathInput}
                        onChange={(e) => setPathInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handlePathInputSubmit()}
                        className="font-mono"
                      />
                      <Button variant="secondary" onClick={handlePathInputSubmit}>
                        Go
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => browseDirectory(browseData?.current_path || "/")}
                        disabled={isLoadingBrowse}
                      >
                        <RefreshCw className={cn("h-4 w-4", isLoadingBrowse && "animate-spin")} />
                      </Button>
                    </div>

                    {/* Current Path Display */}
                    {browseData && (
                      <div className="flex items-center justify-between bg-muted/50 rounded-lg p-3">
                        <div className="flex items-center gap-2">
                          <Folder className="h-5 w-5 text-blue-500" />
                          <span className="font-mono text-sm">{browseData.current_path}</span>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleUsePath(browseData.current_path)}
                        >
                          Use This Path
                        </Button>
                      </div>
                    )}

                    {/* Directory Listing */}
                    <div className="border rounded-lg divide-y max-h-80 overflow-y-auto">
                      {isLoadingBrowse ? (
                        <div className="p-8 text-center">
                          <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                          <p className="text-sm text-muted-foreground mt-2">Loading...</p>
                        </div>
                      ) : browseData?.entries.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">
                          <Folder className="h-8 w-8 mx-auto mb-2" />
                          <p>This directory is empty</p>
                        </div>
                      ) : (
                        browseData?.entries.map((entry) => (
                          <div
                            key={entry.path}
                            className="flex items-center justify-between p-3 hover:bg-muted/50 cursor-pointer"
                            onClick={() => handleSelectDirectory(entry)}
                          >
                            <div className="flex items-center gap-3">
                              <Folder className={cn(
                                "h-5 w-5",
                                entry.name === ".." ? "text-muted-foreground" : "text-blue-500"
                              )} />
                              <span className={cn(
                                "font-mono text-sm",
                                entry.name === ".." && "text-muted-foreground"
                              )}>
                                {entry.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {entry.writable ? (
                                <Badge variant="outline" className="text-green-600 border-green-600">
                                  Writable
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-red-600 border-red-600">
                                  Read-only
                                </Badge>
                              )}
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Selected Path */}
                    {formData.path && (
                      <div className="flex items-center gap-2 p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                        <span className="text-sm">
                          Selected: <span className="font-mono font-medium">{formData.path}</span>
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Step 2: New Device Setup */}
                {currentStep === 2 && sourceType === "new_device" && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-xl font-semibold mb-2">Setup New Storage Device</h2>
                      <p className="text-muted-foreground">
                        Select a device to format and mount for storage
                      </p>
                    </div>

                    {/* Warning */}
                    <div className="flex items-start gap-3 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                      <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
                      <div>
                        <p className="font-medium text-yellow-600 dark:text-yellow-400">
                          Data Loss Warning
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Formatting a device will permanently erase all data on it.
                          Make sure you have selected the correct device and have backed up any important data.
                        </p>
                      </div>
                    </div>

                    {/* Device Selection */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Available Devices</Label>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={loadDevices}
                          disabled={isLoadingDevices}
                        >
                          <RefreshCw className={cn("h-4 w-4 mr-2", isLoadingDevices && "animate-spin")} />
                          Refresh
                        </Button>
                      </div>

                      <div className="border rounded-lg divide-y max-h-60 overflow-y-auto">
                        {isLoadingDevices ? (
                          <div className="p-8 text-center">
                            <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                            <p className="text-sm text-muted-foreground mt-2">Scanning devices...</p>
                          </div>
                        ) : devices.filter(d => !d.is_mounted).length === 0 ? (
                          <div className="p-8 text-center text-muted-foreground">
                            <HardDrive className="h-8 w-8 mx-auto mb-2" />
                            <p>No unmounted devices available</p>
                            <p className="text-xs mt-1">
                              All devices are either mounted or in use
                            </p>
                          </div>
                        ) : (
                          devices
                            .filter(d => !d.is_mounted)
                            .map((device) => (
                              <div
                                key={device.path}
                                className={cn(
                                  "flex items-center justify-between p-3 cursor-pointer transition-colors",
                                  deviceSetup.device === device.path
                                    ? "bg-primary/10"
                                    : "hover:bg-muted/50"
                                )}
                                onClick={() => handleSelectDevice(device)}
                              >
                                <div className="flex items-center gap-3">
                                  <HardDrive className={cn(
                                    "h-5 w-5",
                                    device.is_whole_disk ? "text-orange-500" : "text-blue-500"
                                  )} />
                                  <div>
                                    <p className="font-mono text-sm font-medium">{device.path}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {device.size_human}
                                      {device.model && ` - ${device.model}`}
                                      {device.fstype && ` (${device.fstype})`}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline">
                                    {device.type}
                                  </Badge>
                                  {deviceSetup.device === device.path && (
                                    <CheckCircle2 className="h-5 w-5 text-primary" />
                                  )}
                                </div>
                              </div>
                            ))
                        )}
                      </div>
                    </div>

                    {/* Device Configuration */}
                    {deviceSetup.device && (
                      <div className="space-y-4 pt-4 border-t">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="fstype">Filesystem Type</Label>
                            <Select
                              value={deviceSetup.fstype}
                              onValueChange={(value) =>
                                setDeviceSetup({ ...deviceSetup, fstype: value })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="ext4">ext4 (Recommended)</SelectItem>
                                <SelectItem value="xfs">XFS (High Performance)</SelectItem>
                                <SelectItem value="btrfs">Btrfs (Advanced Features)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="label">Volume Label (Optional)</Label>
                            <Input
                              id="label"
                              placeholder="storage"
                              value={deviceSetup.label}
                              onChange={(e) =>
                                setDeviceSetup({ ...deviceSetup, label: e.target.value })
                              }
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="mount_point">Mount Point</Label>
                          <Input
                            id="mount_point"
                            placeholder="/mnt/storage"
                            value={deviceSetup.mount_point}
                            onChange={(e) =>
                              setDeviceSetup({ ...deviceSetup, mount_point: e.target.value })
                            }
                            className="font-mono"
                          />
                          <p className="text-xs text-muted-foreground">
                            The directory where this device will be mounted
                          </p>
                        </div>

                        <div className="flex items-center justify-between">
                          <div>
                            <Label htmlFor="persistent">Persistent Mount</Label>
                            <p className="text-xs text-muted-foreground">
                              Add to /etc/fstab for automatic mounting on boot
                            </p>
                          </div>
                          <Switch
                            id="persistent"
                            checked={deviceSetup.persistent}
                            onCheckedChange={(checked) =>
                              setDeviceSetup({ ...deviceSetup, persistent: checked })
                            }
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Step 3: Pool Settings */}
                {currentStep === 3 && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-xl font-semibold mb-2">Configure Pool Settings</h2>
                      <p className="text-muted-foreground">
                        Set up the name, quotas, and other options for your storage pool
                      </p>
                    </div>

                    <div className="grid gap-6">
                      {/* Basic Info */}
                      <div className="grid gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="name">Pool Name *</Label>
                          <Input
                            id="name"
                            placeholder="Primary Storage"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          />
                        </div>

                        <div className="grid gap-2">
                          <Label>Storage Path</Label>
                          <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                            <Folder className="h-4 w-4 text-blue-500" />
                            <span className="font-mono text-sm">{formData.path}</span>
                          </div>
                        </div>

                        <div className="grid gap-2">
                          <Label htmlFor="description">Description</Label>
                          <Textarea
                            id="description"
                            placeholder="Main storage pool for user data and shares"
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                          />
                        </div>
                      </div>

                      <Separator />

                      {/* Status */}
                      <div className="flex items-center justify-between">
                        <div>
                          <Label htmlFor="enabled">Enable Pool</Label>
                          <p className="text-sm text-muted-foreground">
                            Allow shares and zones to be created in this pool
                          </p>
                        </div>
                        <Switch
                          id="enabled"
                          checked={formData.enabled}
                          onCheckedChange={(checked) =>
                            setFormData({ ...formData, enabled: checked })
                          }
                        />
                      </div>

                      <Separator />

                      {/* Capacity Settings */}
                      <div className="space-y-4">
                        <h3 className="font-medium">Capacity Settings</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="grid gap-2">
                            <Label htmlFor="reserved">Reserved Space (GB)</Label>
                            <Input
                              id="reserved"
                              type="number"
                              min="0"
                              placeholder="0"
                              value={formData.reserved || ""}
                              onChange={(e) =>
                                setFormData({ ...formData, reserved: Number(e.target.value) })
                              }
                            />
                            <p className="text-xs text-muted-foreground">
                              Space reserved for system use
                            </p>
                          </div>

                          <div className="grid gap-2">
                            <Label htmlFor="max_file_size">Max File Size (MB)</Label>
                            <Input
                              id="max_file_size"
                              type="number"
                              min="0"
                              placeholder="0 = unlimited"
                              value={formData.max_file_size || ""}
                              onChange={(e) =>
                                setFormData({ ...formData, max_file_size: Number(e.target.value) })
                              }
                            />
                            <p className="text-xs text-muted-foreground">
                              0 for no limit
                            </p>
                          </div>
                        </div>
                      </div>

                      <Separator />

                      {/* Quota Settings */}
                      <div className="space-y-4">
                        <h3 className="font-medium">Default Quotas</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="grid gap-2">
                            <Label htmlFor="default_user_quota">User Quota (GB)</Label>
                            <Input
                              id="default_user_quota"
                              type="number"
                              min="0"
                              placeholder="0 = unlimited"
                              value={formData.default_user_quota || ""}
                              onChange={(e) =>
                                setFormData({ ...formData, default_user_quota: Number(e.target.value) })
                              }
                            />
                          </div>

                          <div className="grid gap-2">
                            <Label htmlFor="default_group_quota">Group Quota (GB)</Label>
                            <Input
                              id="default_group_quota"
                              type="number"
                              min="0"
                              placeholder="0 = unlimited"
                              value={formData.default_group_quota || ""}
                              onChange={(e) =>
                                setFormData({ ...formData, default_group_quota: Number(e.target.value) })
                              }
                            />
                          </div>
                        </div>
                      </div>

                      <Separator />

                      {/* File Type Restrictions */}
                      <div className="space-y-4">
                        <h3 className="font-medium">File Type Restrictions (Optional)</h3>
                        <div className="grid gap-4">
                          <div className="grid gap-2">
                            <Label htmlFor="allowed_types">Allowed Types</Label>
                            <Input
                              id="allowed_types"
                              placeholder="jpg, png, pdf, doc (leave empty to allow all)"
                              value={formData.allowed_types}
                              onChange={(e) =>
                                setFormData({ ...formData, allowed_types: e.target.value })
                              }
                            />
                            <p className="text-xs text-muted-foreground">
                              Comma-separated list of allowed file extensions
                            </p>
                          </div>

                          <div className="grid gap-2">
                            <Label htmlFor="denied_types">Denied Types</Label>
                            <Input
                              id="denied_types"
                              placeholder="exe, bat, sh"
                              value={formData.denied_types}
                              onChange={(e) =>
                                setFormData({ ...formData, denied_types: e.target.value })
                              }
                            />
                            <p className="text-xs text-muted-foreground">
                              Comma-separated list of blocked file extensions
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 4: Review */}
                {currentStep === 4 && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-xl font-semibold mb-2">Review & Create</h2>
                      <p className="text-muted-foreground">
                        Review your storage pool configuration before creating
                      </p>
                    </div>

                    <div className="space-y-4">
                      {/* Basic Info */}
                      <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                        <h3 className="font-medium flex items-center gap-2">
                          <Database className="h-4 w-4" />
                          Basic Information
                        </h3>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Name:</span>
                            <p className="font-medium">{formData.name}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Status:</span>
                            <p>
                              <Badge variant={formData.enabled ? "default" : "secondary"}>
                                {formData.enabled ? "Enabled" : "Disabled"}
                              </Badge>
                            </p>
                          </div>
                          <div className="col-span-2">
                            <span className="text-muted-foreground">Path:</span>
                            <p className="font-mono">{formData.path}</p>
                          </div>
                          {formData.description && (
                            <div className="col-span-2">
                              <span className="text-muted-foreground">Description:</span>
                              <p>{formData.description}</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Capacity Settings */}
                      <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                        <h3 className="font-medium flex items-center gap-2">
                          <HardDrive className="h-4 w-4" />
                          Capacity Settings
                        </h3>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Reserved Space:</span>
                            <p className="font-medium">
                              {formData.reserved > 0 ? `${formData.reserved} GB` : "None"}
                            </p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Max File Size:</span>
                            <p className="font-medium">
                              {formData.max_file_size > 0 ? `${formData.max_file_size} MB` : "Unlimited"}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Quotas */}
                      <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                        <h3 className="font-medium flex items-center gap-2">
                          <Info className="h-4 w-4" />
                          Default Quotas
                        </h3>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">User Quota:</span>
                            <p className="font-medium">
                              {formData.default_user_quota > 0
                                ? `${formData.default_user_quota} GB`
                                : "Unlimited"}
                            </p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Group Quota:</span>
                            <p className="font-medium">
                              {formData.default_group_quota > 0
                                ? `${formData.default_group_quota} GB`
                                : "Unlimited"}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* File Type Restrictions */}
                      {(formData.allowed_types || formData.denied_types) && (
                        <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                          <h3 className="font-medium">File Type Restrictions</h3>
                          <div className="grid gap-2 text-sm">
                            {formData.allowed_types && (
                              <div>
                                <span className="text-muted-foreground">Allowed:</span>
                                <p className="font-mono">{formData.allowed_types}</p>
                              </div>
                            )}
                            {formData.denied_types && (
                              <div>
                                <span className="text-muted-foreground">Denied:</span>
                                <p className="font-mono">{formData.denied_types}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Navigation Buttons */}
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                onClick={goToPreviousStep}
                disabled={currentStep === 1 || isProcessing}
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                Back
              </Button>

              <div className="flex items-center gap-2">
                {currentStep === 4 ? (
                  <Button
                    onClick={handleCreatePool}
                    disabled={!canProceed() || isProcessing}
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Create Pool
                      </>
                    )}
                  </Button>
                ) : (
                  <Button
                    onClick={goToNextStep}
                    disabled={!canProceed() || isProcessing}
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        Next
                        <ChevronRight className="h-4 w-4 ml-2" />
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Confirmation Dialog for Device Setup */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Confirm Device Format
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                You are about to format <span className="font-mono font-bold">{deviceSetup.device}</span>.
              </p>
              <p className="text-red-600 dark:text-red-400 font-medium">
                This will permanently erase all data on this device!
              </p>
              <div className="mt-4 p-3 bg-muted rounded-lg text-sm space-y-1">
                <p><strong>Device:</strong> {deviceSetup.device}</p>
                <p><strong>Filesystem:</strong> {deviceSetup.fstype}</p>
                <p><strong>Mount Point:</strong> {deviceSetup.mount_point}</p>
                <p><strong>Persistent:</strong> {deviceSetup.persistent ? "Yes" : "No"}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeDeviceSetup}
              className="bg-red-600 hover:bg-red-700"
            >
              Format Device
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
