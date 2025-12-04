"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
import { useAuth } from "@/lib/auth-context";
import { systemAPI, SystemResources, ServiceInfo, NetworkInterface, Process, HardwareInfo } from "@/lib/api";
import { PageSkeleton } from "@/components/skeletons";
import { toast } from "sonner";
import {
  Server,
  Cpu,
  MemoryStick,
  HardDrive,
  Activity,
  RefreshCw,
  Play,
  Square,
  RotateCcw,
  Power,
  Network,
  Wifi,
  Clock,
  Thermometer,
  Zap,
  Box,
  XCircle,
  CheckCircle,
  AlertTriangle,
  Settings,
  Terminal,
} from "lucide-react";

export default function ServerControlPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [resources, setResources] = useState<SystemResources | null>(null);
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [interfaces, setInterfaces] = useState<NetworkInterface[]>([]);
  const [processes, setProcesses] = useState<Process[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [powerDialog, setPowerDialog] = useState<{ open: boolean; action?: 'reboot' | 'poweroff' | 'suspend' | 'hibernate' }>({ open: false });
  const [killProcessDialog, setKillProcessDialog] = useState<{ open: boolean; pid?: number }>({ open: false });
  const [processSort, setProcessSort] = useState<"cpu" | "memory">("cpu");

  useEffect(() => {
    if (!authLoading) {
      if (!isAuthenticated) {
        router.replace("/");
      } else if (user && user.role !== "admin") {
        router.replace("/dashboard");
      }
    }
  }, [authLoading, isAuthenticated, user, router]);

  const fetchData = async () => {
    try {
      const [resourceData, hardwareData, serviceData, networkData, processData] = await Promise.all([
        systemAPI.getResources(),
        systemAPI.getHardware(),
        systemAPI.getServices("storage"),
        systemAPI.getNetworkInterfaces(),
        systemAPI.getProcesses(processSort, 25),
      ]);
      setResources(resourceData);
      setHardware(hardwareData);
      setServices(serviceData);
      setInterfaces(networkData);
      setProcesses(processData);
    } catch (error) {
      console.error("Failed to fetch system data:", error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && user?.role === "admin") {
      fetchData();
      const interval = setInterval(fetchData, 10000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, user, processSort]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchData();
  };

  const handleServiceControl = async (service: string, action: "start" | "stop" | "restart") => {
    try {
      await systemAPI.controlService(service, action);
      toast.success(`Service ${action}ed successfully`);
      fetchData();
    } catch (error) {
      toast.error(`Failed to ${action} service: ${error}`);
    }
  };

  const handleKillProcess = (pid: number) => {
    setKillProcessDialog({ open: true, pid });
  };

  const confirmKillProcess = async () => {
    if (!killProcessDialog.pid) return;

    try {
      await systemAPI.killProcess(killProcessDialog.pid);
      toast.success("Process terminated");
      setKillProcessDialog({ open: false });
      fetchData();
    } catch (error) {
      toast.error(`Failed to kill process: ${error}`);
    }
  };

  const handlePowerAction = async () => {
    if (!powerDialog.action) return;

    try {
      await systemAPI.power(powerDialog.action);
      toast.success(`System ${powerDialog.action} initiated`);
      setPowerDialog({ open: false });
    } catch (error) {
      toast.error(`Failed to ${powerDialog.action} system: ${error}`);
    }
  };

  const getServiceStatusBadge = (status: string) => {
    switch (status) {
      case "running":
        return <Badge className="bg-green-500">Running</Badge>;
      case "stopped":
        return <Badge variant="secondary">Stopped</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Show skeleton during initial auth check (only if no cached user)
  if (authLoading && !user) {
    return <PageSkeleton title="Server Control" />;
  }

  // Not authenticated or not admin - will redirect, show skeleton in meantime
  if (!isAuthenticated || (user && user.role !== "admin")) {
    return <PageSkeleton title="Server Control" />;
  }

  // Data loading - show skeleton
  if (isLoading) {
    return <PageSkeleton title="Server Control" />;
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Server Control" />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">{resources?.hostname || "Server Control"}</h2>
                <p className="text-muted-foreground">
                  {resources?.os_release} • {resources?.kernel_version}
                </p>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleRefresh} disabled={isRefreshing} variant="outline">
                  <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setPowerDialog({ open: true, action: "reboot" })}
                >
                  <Power className="h-4 w-4 mr-2" />
                  Power
                </Button>
              </div>
            </div>

            {/* System Overview */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Cpu className="h-4 w-4" />
                    CPU Usage
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{resources?.cpu_usage?.toFixed(1) || 0}%</div>
                  <Progress value={resources?.cpu_usage || 0} className="mt-2" />
                  <p className="text-xs text-muted-foreground mt-1">
                    {resources?.cpu_cores} cores • Load: {resources?.load_avg_1?.toFixed(2)}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <MemoryStick className="h-4 w-4" />
                    Memory
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{resources?.memory_percent?.toFixed(1) || 0}%</div>
                  <Progress value={resources?.memory_percent || 0} className="mt-2" />
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatBytes(resources?.memory_used || 0)} / {formatBytes(resources?.memory_total || 0)}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <HardDrive className="h-4 w-4" />
                    Swap
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{resources?.swap_percent?.toFixed(1) || 0}%</div>
                  <Progress value={resources?.swap_percent || 0} className="mt-2" />
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatBytes(resources?.swap_used || 0)} / {formatBytes(resources?.swap_total || 0)}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Uptime
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{resources?.uptime_human || "N/A"}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Load: {resources?.load_avg_1?.toFixed(2)} / {resources?.load_avg_5?.toFixed(2)} / {resources?.load_avg_15?.toFixed(2)}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Hardware Info */}
            {hardware && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Server className="h-5 w-5" />
                    Hardware Information
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <h4 className="font-medium mb-2">CPU</h4>
                      <p className="text-sm text-muted-foreground">{hardware.cpu.model}</p>
                      <p className="text-sm">{hardware.cpu.cores} cores / {hardware.cpu.threads} threads</p>
                      {hardware.cpu.current_speed && (
                        <p className="text-sm">Current: {hardware.cpu.current_speed}</p>
                      )}
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">Memory</h4>
                      <p className="text-sm">{hardware.memory.total_human}</p>
                      {hardware.memory.type && <p className="text-sm text-muted-foreground">{hardware.memory.type}</p>}
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">System</h4>
                      <p className="text-sm">{hardware.system.manufacturer}</p>
                      <p className="text-sm text-muted-foreground">{hardware.system.product_name}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Tabs defaultValue="services">
              <TabsList>
                <TabsTrigger value="services">Services</TabsTrigger>
                <TabsTrigger value="network">Network</TabsTrigger>
                <TabsTrigger value="processes">Processes</TabsTrigger>
              </TabsList>

              {/* Services Tab */}
              <TabsContent value="services">
                <Card>
                  <CardHeader>
                    <CardTitle>Storage Services</CardTitle>
                    <CardDescription>Status of storage-related system services</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {services.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Service</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Enabled</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {services.filter(s => s.status).map((service) => (
                            <TableRow key={service.name}>
                              <TableCell className="font-medium">{service.name}</TableCell>
                              <TableCell>{getServiceStatusBadge(service.status)}</TableCell>
                              <TableCell>
                                {service.enabled ? (
                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                ) : (
                                  <XCircle className="h-4 w-4 text-muted-foreground" />
                                )}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                                {service.description}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  {service.status !== "running" && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleServiceControl(service.name, "start")}
                                    >
                                      <Play className="h-4 w-4" />
                                    </Button>
                                  )}
                                  {service.status === "running" && (
                                    <>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleServiceControl(service.name, "restart")}
                                      >
                                        <RotateCcw className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleServiceControl(service.name, "stop")}
                                      >
                                        <Square className="h-4 w-4" />
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="text-center py-8 text-muted-foreground">
                        No services found
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Network Tab */}
              <TabsContent value="network">
                <Card>
                  <CardHeader>
                    <CardTitle>Network Interfaces</CardTitle>
                    <CardDescription>Active network interfaces and statistics</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {interfaces.length > 0 ? (
                      <div className="space-y-4">
                        {interfaces.map((iface) => (
                          <div key={iface.name} className="p-4 rounded-lg border">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Network className="h-5 w-5" />
                                <span className="font-medium">{iface.name}</span>
                                <Badge variant={iface.state === "up" ? "default" : "secondary"}>
                                  {iface.state}
                                </Badge>
                                {iface.speed && <Badge variant="outline">{iface.speed}</Badge>}
                              </div>
                              <span className="font-mono text-sm text-muted-foreground">{iface.mac}</span>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div>
                                <span className="text-muted-foreground">IPv4:</span>
                                <div className="font-mono">
                                  {iface.ipv4_addresses.length > 0 ? iface.ipv4_addresses.join(", ") : "-"}
                                </div>
                              </div>
                              <div>
                                <span className="text-muted-foreground">MTU:</span>
                                <div>{iface.mtu}</div>
                              </div>
                              <div>
                                <span className="text-muted-foreground">RX:</span>
                                <div>{iface.rx_human} ({iface.rx_packets.toLocaleString()} pkts)</div>
                              </div>
                              <div>
                                <span className="text-muted-foreground">TX:</span>
                                <div>{iface.tx_human} ({iface.tx_packets.toLocaleString()} pkts)</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center py-8 text-muted-foreground">
                        No network interfaces found
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Processes Tab */}
              <TabsContent value="processes">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Top Processes</CardTitle>
                        <CardDescription>Processes sorted by resource usage</CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant={processSort === "cpu" ? "default" : "outline"}
                          size="sm"
                          onClick={() => setProcessSort("cpu")}
                        >
                          CPU
                        </Button>
                        <Button
                          variant={processSort === "memory" ? "default" : "outline"}
                          size="sm"
                          onClick={() => setProcessSort("memory")}
                        >
                          Memory
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>PID</TableHead>
                          <TableHead>User</TableHead>
                          <TableHead>CPU %</TableHead>
                          <TableHead>MEM %</TableHead>
                          <TableHead>RSS</TableHead>
                          <TableHead>Command</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {processes.map((proc) => (
                          <TableRow key={proc.pid}>
                            <TableCell className="font-mono">{proc.pid}</TableCell>
                            <TableCell>{proc.user}</TableCell>
                            <TableCell>
                              <span className={proc.cpu > 50 ? "text-red-600 font-medium" : ""}>
                                {proc.cpu.toFixed(1)}%
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className={proc.memory > 50 ? "text-red-600 font-medium" : ""}>
                                {proc.memory.toFixed(1)}%
                              </span>
                            </TableCell>
                            <TableCell>{formatBytes(proc.rss)}</TableCell>
                            <TableCell className="max-w-xs truncate font-mono text-xs">
                              {proc.command}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleKillProcess(proc.pid)}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>

      {/* Power Dialog */}
      <AlertDialog open={powerDialog.open} onOpenChange={(open) => setPowerDialog({ ...powerDialog, open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Power Control</AlertDialogTitle>
            <AlertDialogDescription>
              Select a power action for this server. This will affect all connected users.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid grid-cols-2 gap-2 py-4">
            <Button
              variant={powerDialog.action === "reboot" ? "default" : "outline"}
              onClick={() => setPowerDialog({ ...powerDialog, action: "reboot" })}
              className="h-20 flex-col"
            >
              <RotateCcw className="h-6 w-6 mb-1" />
              Reboot
            </Button>
            <Button
              variant={powerDialog.action === "poweroff" ? "destructive" : "outline"}
              onClick={() => setPowerDialog({ ...powerDialog, action: "poweroff" })}
              className="h-20 flex-col"
            >
              <Power className="h-6 w-6 mb-1" />
              Shutdown
            </Button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handlePowerAction}
              disabled={!powerDialog.action}
              className={powerDialog.action === "poweroff" ? "bg-red-600 hover:bg-red-700" : ""}
            >
              Confirm {powerDialog.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Kill Process Confirmation Dialog */}
      <AlertDialog open={killProcessDialog.open} onOpenChange={(open) => setKillProcessDialog({ ...killProcessDialog, open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kill Process</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to kill process {killProcessDialog.pid}? This may cause data loss if the process has unsaved work.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmKillProcess} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Kill Process
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
