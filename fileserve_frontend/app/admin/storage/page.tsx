"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/lib/auth-context";
import { storageAPI, StorageOverview, MountPoint } from "@/lib/api";
import { PageSkeleton } from "@/components/skeletons";
import {
  HardDrive,
  Database,
  Server,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  ArrowRight,
  Layers,
  Box,
  Gauge,
  Thermometer,
} from "lucide-react";

export default function StorageOverviewPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [overview, setOverview] = useState<StorageOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (!authLoading) {
      if (!isAuthenticated) {
        router.replace("/");
      } else if (user && user.role !== "admin") {
        router.replace("/dashboard");
      }
    }
  }, [authLoading, isAuthenticated, user, router]);

  const fetchOverview = async () => {
    try {
      const data = await storageAPI.getOverview();
      setOverview(data);
    } catch (error) {
      console.error("Failed to fetch storage overview:", error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && user?.role === "admin") {
      fetchOverview();
      // Refresh every 30 seconds
      const interval = setInterval(fetchOverview, 30000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, user]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchOverview();
  };

  const getHealthIcon = (health: string) => {
    switch (health) {
      case "healthy":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case "critical":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <CheckCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getAlertBadge = (level: string) => {
    switch (level) {
      case "critical":
        return <Badge variant="destructive">Critical</Badge>;
      case "warning":
        return <Badge variant="secondary" className="bg-yellow-500 text-white">Warning</Badge>;
      default:
        return <Badge variant="outline">Info</Badge>;
    }
  };

  const getUsageColor = (percent: number) => {
    if (percent >= 90) return "bg-red-500";
    if (percent >= 80) return "bg-yellow-500";
    return "bg-green-500";
  };

  // Show skeleton during initial auth check (only if no cached user)
  if (authLoading && !user) {
    return <PageSkeleton title="Storage Management" showCards={4} />;
  }

  // Not authenticated or not admin - will redirect, show skeleton in meantime
  if (!isAuthenticated || (user && user.role !== "admin")) {
    return <PageSkeleton title="Storage Management" showCards={4} />;
  }

  // Data loading - show skeleton
  if (isLoading) {
    return <PageSkeleton title="Storage Management" showCards={4} />;
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Storage Management" />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Header with Refresh */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Storage Overview</h2>
                <p className="text-muted-foreground">Enterprise storage management dashboard</p>
              </div>
              <Button onClick={handleRefresh} disabled={isRefreshing} variant="outline">
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>

            {/* Alerts Section */}
            {overview?.alerts && overview.alerts.length > 0 && (
              <Card className="border-yellow-500">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <AlertTriangle className="h-5 w-5 text-yellow-500" />
                    Storage Alerts
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {overview.alerts.map((alert, index) => (
                      <div key={index} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                        <div className="flex items-center gap-3">
                          {getAlertBadge(alert.level)}
                          <span className="font-medium">{alert.message}</span>
                        </div>
                        <span className="text-sm text-muted-foreground">{alert.resource}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Main Stats Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Capacity</CardTitle>
                  <HardDrive className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{overview?.capacity_human || "0 B"}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {overview?.total_disks || 0} physical disk(s)
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Used Storage</CardTitle>
                  <Database className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{overview?.used_human || "0 B"}</div>
                  <Progress
                    value={overview?.used_percent || 0}
                    className={`mt-2 ${getUsageColor(overview?.used_percent || 0)}`}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {overview?.used_percent?.toFixed(1) || 0}% utilized
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Free Space</CardTitle>
                  <Gauge className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">{overview?.free_human || "0 B"}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Available for use
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Storage Features</CardTitle>
                  <Server className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {(overview?.volume_groups || 0) > 0 && (
                      <Badge variant="outline">LVM: {overview?.volume_groups}</Badge>
                    )}
                    {(overview?.raid_arrays || 0) > 0 && (
                      <Badge variant="outline">RAID: {overview?.raid_arrays}</Badge>
                    )}
                    {(overview?.zfs_pools || 0) > 0 && (
                      <Badge variant="outline">ZFS: {overview?.zfs_pools}</Badge>
                    )}
                    {overview?.quotas_enabled && (
                      <Badge variant="outline" className="bg-blue-100">Quotas</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Disk Health */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Thermometer className="h-5 w-5" />
                  Disk Health Status
                </CardTitle>
                <CardDescription>Real-time health monitoring for all storage devices</CardDescription>
              </CardHeader>
              <CardContent>
                {overview?.disk_health && overview.disk_health.length > 0 ? (
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {overview.disk_health.map((disk, index) => (
                      <div key={index} className="flex items-center justify-between p-3 rounded-lg border">
                        <div className="flex items-center gap-3">
                          {getHealthIcon(disk.health)}
                          <div>
                            <p className="font-medium">{disk.name}</p>
                            <p className="text-xs text-muted-foreground">{disk.path}</p>
                          </div>
                        </div>
                        {disk.temperature && (
                          <span className="text-sm font-mono">{disk.temperature}°C</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No disk health information available</p>
                )}
              </CardContent>
            </Card>

            {/* Mount Points */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Layers className="h-5 w-5" />
                      Mounted Filesystems
                    </CardTitle>
                    <CardDescription>Active mount points and usage statistics</CardDescription>
                  </div>
                  <Link href="/admin/storage/filesystems">
                    <Button variant="outline" size="sm">
                      Manage <ArrowRight className="h-4 w-4 ml-1" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {overview?.mount_points?.filter(m =>
                    !m.mount_path.startsWith('/sys') &&
                    !m.mount_path.startsWith('/proc') &&
                    !m.mount_path.startsWith('/run') &&
                    !m.mount_path.startsWith('/dev') &&
                    m.fstype !== 'tmpfs' &&
                    m.fstype !== 'devtmpfs'
                  ).slice(0, 6).map((mount, index) => (
                    <div key={index} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Box className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{mount.mount_path}</span>
                          <Badge variant="outline" className="text-xs">{mount.fstype}</Badge>
                        </div>
                        <span className="text-sm font-mono">
                          {mount.used_human} / {mount.total_human}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress
                          value={mount.used_percent}
                          className={`flex-1 h-2 ${getUsageColor(mount.used_percent)}`}
                        />
                        <span className="text-xs text-muted-foreground w-12 text-right">
                          {mount.used_percent.toFixed(1)}%
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{mount.device}</p>
                    </div>
                  )) || (
                    <p className="text-muted-foreground">No mount points available</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Link href="/admin/storage/disks">
                <Card className="hover:bg-accent transition-colors cursor-pointer h-full">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between text-base">
                      <span>Disks & Partitions</span>
                      <ArrowRight className="h-4 w-4" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Manage physical disks, create and format partitions
                    </p>
                  </CardContent>
                </Card>
              </Link>

              <Link href="/admin/storage/volumes">
                <Card className="hover:bg-accent transition-colors cursor-pointer h-full">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between text-base">
                      <span>Volume Management</span>
                      <ArrowRight className="h-4 w-4" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      LVM, RAID arrays, and ZFS pool management
                    </p>
                  </CardContent>
                </Card>
              </Link>

              <Link href="/admin/storage/quotas">
                <Card className="hover:bg-accent transition-colors cursor-pointer h-full">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between text-base">
                      <span>Quota Management</span>
                      <ArrowRight className="h-4 w-4" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Set and manage user and group storage quotas
                    </p>
                  </CardContent>
                </Card>
              </Link>

              <Link href="/admin/storage/server">
                <Card className="hover:bg-accent transition-colors cursor-pointer h-full">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between text-base">
                      <span>Server Control</span>
                      <ArrowRight className="h-4 w-4" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      System resources, services, and server management
                    </p>
                  </CardContent>
                </Card>
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
