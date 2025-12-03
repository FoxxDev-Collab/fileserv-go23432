"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth-context";
import {
  adminAPI,
  storageAPI,
  systemAPI,
  poolsAPI,
  zonesAPI,
  shareLinksAPI,
  usersAPI,
  AdminStats,
  StorageOverview,
  SystemResources,
  StoragePool,
  ShareZone,
  ShareLink,
  User,
  StorageAlert,
} from "@/lib/api";
import {
  Users,
  Files,
  HardDrive,
  Activity,
  ArrowRight,
  Server,
  Cpu,
  MemoryStick,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Container,
  FolderTree,
  Link2,
  Shield,
  TrendingUp,
  Database,
  Gauge,
  Zap,
  AlertCircle,
  Info,
} from "lucide-react";

interface DashboardData {
  stats: AdminStats | null;
  storage: StorageOverview | null;
  system: SystemResources | null;
  pools: StoragePool[];
  zones: ShareZone[];
  shareLinks: ShareLink[];
  users: User[];
}

export default function AdminPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [data, setData] = useState<DashboardData>({
    stats: null,
    storage: null,
    system: null,
    pools: [],
    zones: [],
    shareLinks: [],
    users: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Redirect if not authenticated or not admin
  useEffect(() => {
    if (!authLoading) {
      if (!isAuthenticated) {
        router.replace("/");
      } else if (user && user.role !== "admin") {
        router.replace("/dashboard");
      }
    }
  }, [authLoading, isAuthenticated, user, router]);

  const fetchDashboardData = useCallback(async () => {
    try {
      const [statsRes, storageRes, systemRes, poolsRes, zonesRes, linksRes, usersRes] = await Promise.allSettled([
        adminAPI.getStats(),
        storageAPI.getOverview(),
        systemAPI.getResources(),
        poolsAPI.list(),
        zonesAPI.list(),
        shareLinksAPI.listAll(),
        usersAPI.list(),
      ]);

      setData({
        stats: statsRes.status === "fulfilled" ? statsRes.value : null,
        storage: storageRes.status === "fulfilled" ? storageRes.value : null,
        system: systemRes.status === "fulfilled" ? systemRes.value : null,
        pools: poolsRes.status === "fulfilled" ? poolsRes.value || [] : [],
        zones: zonesRes.status === "fulfilled" ? zonesRes.value || [] : [],
        shareLinks: linksRes.status === "fulfilled" ? linksRes.value || [] : [],
        users: usersRes.status === "fulfilled" ? usersRes.value || [] : [],
      });
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Fetch dashboard data
  useEffect(() => {
    if (isAuthenticated && user?.role === "admin") {
      fetchDashboardData();
      // Auto-refresh every 30 seconds
      const interval = setInterval(fetchDashboardData, 30000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, user, fetchDashboardData]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchDashboardData();
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getHealthBadge = (health: string) => {
    switch (health?.toLowerCase()) {
      case "healthy":
      case "online":
        return <Badge className="bg-green-500 hover:bg-green-600">Healthy</Badge>;
      case "warning":
      case "degraded":
        return <Badge className="bg-yellow-500 hover:bg-yellow-600">Warning</Badge>;
      case "critical":
      case "offline":
        return <Badge variant="destructive">Critical</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const getAlertIcon = (level: string) => {
    switch (level) {
      case "critical":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getSystemStatus = () => {
    const alerts = data.storage?.alerts || [];
    const criticalAlerts = alerts.filter((a) => a.level === "critical").length;
    const warningAlerts = alerts.filter((a) => a.level === "warning").length;

    if (criticalAlerts > 0) {
      return { status: "Critical", color: "bg-red-500", icon: XCircle };
    }
    if (warningAlerts > 0) {
      return { status: "Warning", color: "bg-yellow-500", icon: AlertTriangle };
    }
    return { status: "Operational", color: "bg-green-500", icon: CheckCircle2 };
  };

  const activeShareLinks = data.shareLinks.filter((l) => l.enabled && (!l.expires_at || new Date(l.expires_at) > new Date()));
  const enabledPools = data.pools.filter((p) => p.enabled);
  const enabledZones = data.zones.filter((z) => z.enabled);
  const adminUsers = data.users.filter((u) => u.is_admin);

  const systemStatus = getSystemStatus();
  const StatusIcon = systemStatus.icon;

  if (authLoading || (isAuthenticated && user?.role === "admin" && isLoading)) {
    return (
      <div className="flex h-screen bg-background">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header title="Admin Dashboard" />
          <main className="flex-1 overflow-y-auto p-6">
            <div className="max-w-7xl mx-auto">
              <div className="flex items-center justify-center h-64">
                <div className="flex flex-col items-center space-y-4">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                  <p className="text-muted-foreground">Loading dashboard data...</p>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Admin Dashboard" />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Header with refresh */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">System Overview</h1>
                {lastUpdated && (
                  <p className="text-sm text-muted-foreground">
                    Last updated: {lastUpdated.toLocaleTimeString()}
                  </p>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>

            {/* System Status Banner */}
            <Card className={`border-l-4 ${systemStatus.status === "Critical" ? "border-l-red-500" : systemStatus.status === "Warning" ? "border-l-yellow-500" : "border-l-green-500"}`}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <StatusIcon className={`h-6 w-6 ${systemStatus.status === "Critical" ? "text-red-500" : systemStatus.status === "Warning" ? "text-yellow-500" : "text-green-500"}`} />
                    <div>
                      <h3 className="font-semibold">System Status: {systemStatus.status}</h3>
                      <p className="text-sm text-muted-foreground">
                        {data.storage?.alerts?.length || 0} active alerts
                        {data.system?.uptime_human && ` • Uptime: ${data.system.uptime_human}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {data.system && (
                      <>
                        <Badge variant="outline" className="flex items-center gap-1">
                          <Cpu className="h-3 w-3" />
                          {data.system.cpu_usage?.toFixed(1) || 0}%
                        </Badge>
                        <Badge variant="outline" className="flex items-center gap-1">
                          <MemoryStick className="h-3 w-3" />
                          {data.system.memory_percent?.toFixed(1) || 0}%
                        </Badge>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Primary Stats Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Internal Users</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{data.users.length}</div>
                  <p className="text-xs text-muted-foreground">
                    {adminUsers.length} admin{adminUsers.length !== 1 ? "s" : ""}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Files Managed</CardTitle>
                  <Files className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{(data.stats?.total_files || 0).toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground">
                    {(data.stats?.total_folders || 0).toLocaleString()} folders
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Storage Pools</CardTitle>
                  <Container className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{data.pools.length}</div>
                  <p className="text-xs text-muted-foreground">
                    {enabledPools.length} active
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Share Zones</CardTitle>
                  <FolderTree className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{data.zones.length}</div>
                  <p className="text-xs text-muted-foreground">
                    {enabledZones.length} enabled
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Storage Overview */}
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <HardDrive className="h-5 w-5" />
                    Storage Capacity
                  </CardTitle>
                  <CardDescription>
                    System-wide storage utilization
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {data.storage ? (
                    <>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Used: {data.storage.used_human || formatBytes(data.storage.total_used)}</span>
                          <span>Total: {data.storage.capacity_human || formatBytes(data.storage.total_capacity)}</span>
                        </div>
                        <Progress value={data.storage.used_percent || 0} className="h-3" />
                        <p className="text-xs text-muted-foreground text-right">
                          {data.storage.free_human || formatBytes(data.storage.total_free)} available ({(100 - (data.storage.used_percent || 0)).toFixed(1)}%)
                        </p>
                      </div>
                      <Separator />
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                          <p className="text-2xl font-bold">{data.storage.total_disks || 0}</p>
                          <p className="text-xs text-muted-foreground">Disks</p>
                        </div>
                        <div>
                          <p className="text-2xl font-bold">{data.storage.volume_groups || 0}</p>
                          <p className="text-xs text-muted-foreground">Volume Groups</p>
                        </div>
                        <div>
                          <p className="text-2xl font-bold">{data.storage.mount_points?.length || 0}</p>
                          <p className="text-xs text-muted-foreground">Mount Points</p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <HardDrive className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>Storage data unavailable</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Server className="h-5 w-5" />
                    System Resources
                  </CardTitle>
                  <CardDescription>
                    {data.system?.hostname || "Server"} • {data.system?.os_release || "Linux"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {data.system ? (
                    <>
                      <div className="space-y-3">
                        <div>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="flex items-center gap-1">
                              <Cpu className="h-3 w-3" /> CPU
                            </span>
                            <span>{data.system.cpu_usage?.toFixed(1) || 0}%</span>
                          </div>
                          <Progress value={data.system.cpu_usage || 0} className="h-2" />
                        </div>
                        <div>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="flex items-center gap-1">
                              <MemoryStick className="h-3 w-3" /> Memory
                            </span>
                            <span>{data.system.memory_percent?.toFixed(1) || 0}%</span>
                          </div>
                          <Progress value={data.system.memory_percent || 0} className="h-2" />
                        </div>
                        {data.system.swap_total > 0 && (
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="flex items-center gap-1">
                                <Database className="h-3 w-3" /> Swap
                              </span>
                              <span>{data.system.swap_percent?.toFixed(1) || 0}%</span>
                            </div>
                            <Progress value={data.system.swap_percent || 0} className="h-2" />
                          </div>
                        )}
                      </div>
                      <Separator />
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">CPU</p>
                          <p className="font-medium truncate">{data.system.cpu_model || `${data.system.cpu_cores} cores`}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Memory</p>
                          <p className="font-medium">{formatBytes(data.system.memory_total)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Load Average</p>
                          <p className="font-medium">
                            {data.system.load_avg_1?.toFixed(2)} / {data.system.load_avg_5?.toFixed(2)} / {data.system.load_avg_15?.toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Uptime</p>
                          <p className="font-medium">{data.system.uptime_human || "N/A"}</p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Server className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>System data unavailable</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Share Links & Disk Health */}
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Link2 className="h-5 w-5" />
                    Share Links
                  </CardTitle>
                  <CardDescription>
                    Public file sharing statistics
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold">{data.shareLinks.length}</p>
                      <p className="text-xs text-muted-foreground">Total Links</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-green-600">{activeShareLinks.length}</p>
                      <p className="text-xs text-muted-foreground">Active</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-blue-600">
                        {data.shareLinks.reduce((sum, l) => sum + (l.download_count || 0), 0)}
                      </p>
                      <p className="text-xs text-muted-foreground">Downloads</p>
                    </div>
                  </div>
                  <Separator className="my-4" />
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>File shares</span>
                      <span>{data.shareLinks.filter((l) => l.target_type === "file").length}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Folder shares</span>
                      <span>{data.shareLinks.filter((l) => l.target_type === "folder").length}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Password protected</span>
                      <span>{data.shareLinks.filter((l) => l.password_hash).length}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Gauge className="h-5 w-5" />
                    Disk Health
                  </CardTitle>
                  <CardDescription>
                    SMART status and disk health monitoring
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {data.storage?.disk_health && data.storage.disk_health.length > 0 ? (
                    <div className="space-y-3">
                      {data.storage.disk_health.slice(0, 4).map((disk, i) => (
                        <div key={i} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <HardDrive className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">{disk.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {disk.temperature && (
                              <span className="text-xs text-muted-foreground">{disk.temperature}°C</span>
                            )}
                            {getHealthBadge(disk.health)}
                          </div>
                        </div>
                      ))}
                      {data.storage.disk_health.length > 4 && (
                        <p className="text-xs text-muted-foreground text-center">
                          +{data.storage.disk_health.length - 4} more disks
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-muted-foreground">
                      <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                      <p>All disks healthy</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Alerts Section */}
            {data.storage?.alerts && data.storage.alerts.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5" />
                    Active Alerts
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {data.storage.alerts.slice(0, 5).map((alert, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 rounded-lg border">
                        {getAlertIcon(alert.level)}
                        <div className="flex-1">
                          <p className="font-medium">{alert.message}</p>
                          <p className="text-xs text-muted-foreground">
                            {alert.resource} • {new Date(alert.timestamp).toLocaleString()}
                          </p>
                        </div>
                        <Badge variant={alert.level === "critical" ? "destructive" : alert.level === "warning" ? "default" : "secondary"}>
                          {alert.level}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Quick Actions */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Link href="/admin/system-users">
                <Card className="hover:bg-accent transition-colors cursor-pointer h-full">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between text-base">
                      <span className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Manage Users
                      </span>
                      <ArrowRight className="h-4 w-4" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Create and manage internal user accounts
                    </p>
                  </CardContent>
                </Card>
              </Link>

              <Link href="/admin/storage/pools">
                <Card className="hover:bg-accent transition-colors cursor-pointer h-full">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between text-base">
                      <span className="flex items-center gap-2">
                        <Container className="h-4 w-4" />
                        Storage Pools
                      </span>
                      <ArrowRight className="h-4 w-4" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Configure storage pools and quotas
                    </p>
                  </CardContent>
                </Card>
              </Link>

              <Link href="/admin/storage/zones">
                <Card className="hover:bg-accent transition-colors cursor-pointer h-full">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between text-base">
                      <span className="flex items-center gap-2">
                        <FolderTree className="h-4 w-4" />
                        Share Zones
                      </span>
                      <ArrowRight className="h-4 w-4" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Manage zones and network shares
                    </p>
                  </CardContent>
                </Card>
              </Link>

              <Link href="/admin/storage/server">
                <Card className="hover:bg-accent transition-colors cursor-pointer h-full">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between text-base">
                      <span className="flex items-center gap-2">
                        <Server className="h-4 w-4" />
                        Server Status
                      </span>
                      <ArrowRight className="h-4 w-4" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Monitor services and system logs
                    </p>
                  </CardContent>
                </Card>
              </Link>
            </div>

            {/* Zone Type Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Zone Configuration Overview</CardTitle>
                <CardDescription>
                  Distribution of share zones by type and features
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  <div className="text-center p-4 rounded-lg bg-muted/50">
                    <p className="text-2xl font-bold">{data.zones.filter((z) => z.zone_type === "personal").length}</p>
                    <p className="text-xs text-muted-foreground">Personal</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-muted/50">
                    <p className="text-2xl font-bold">{data.zones.filter((z) => z.zone_type === "group").length}</p>
                    <p className="text-xs text-muted-foreground">Group</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-muted/50">
                    <p className="text-2xl font-bold">{data.zones.filter((z) => z.zone_type === "public").length}</p>
                    <p className="text-xs text-muted-foreground">Public</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-muted/50">
                    <p className="text-2xl font-bold">{data.zones.filter((z) => z.smb_enabled).length}</p>
                    <p className="text-xs text-muted-foreground">SMB Enabled</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-muted/50">
                    <p className="text-2xl font-bold">{data.zones.filter((z) => z.nfs_enabled).length}</p>
                    <p className="text-xs text-muted-foreground">NFS Enabled</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-muted/50">
                    <p className="text-2xl font-bold">{data.zones.filter((z) => z.allow_web_shares).length}</p>
                    <p className="text-xs text-muted-foreground">Web Sharing</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}
