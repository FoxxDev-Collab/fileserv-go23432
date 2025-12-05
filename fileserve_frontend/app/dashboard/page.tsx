"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useDashboardStats } from "@/lib/hooks/use-queries";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { UploadButton } from "@/components/files/upload-button";
import { HardDrive, Files, Clock, Folder, Database, Upload, ArrowRight } from "lucide-react";
import { DashboardSkeleton } from "@/components/skeletons";
import { Button } from "@/components/ui/button";

export default function DashboardPage() {
  const { user, isAuthenticated, isLoading: authLoading, hasCheckedAuth } = useAuth();
  const router = useRouter();

  // Use React Query for data fetching with caching
  const { data, isLoading: dataLoading } = useDashboardStats();

  // Redirect if not authenticated (only after auth check completes)
  useEffect(() => {
    if (hasCheckedAuth && !isAuthenticated) {
      router.replace("/");
    }
  }, [hasCheckedAuth, isAuthenticated, router]);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
    return date.toLocaleDateString();
  };

  // Show skeleton while auth check hasn't completed
  if (!hasCheckedAuth) {
    return <DashboardSkeleton />;
  }

  // Not authenticated - will redirect, show skeleton in meantime
  if (!isAuthenticated) {
    return <DashboardSkeleton />;
  }

  const stats = data?.stats ?? { fileCount: 0, folderCount: 0, totalSize: 0, zoneCount: 0 };
  const recentFiles = data?.recentFiles ?? [];
  const primaryZone = data?.primaryZone ?? null;
  const isLoading = dataLoading && !data;
  const hasZones = stats.zoneCount > 0;

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Dashboard" />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Welcome Message */}
            <div>
              <h2 className="text-3xl font-bold">Welcome back, {user?.username}!</h2>
              <p className="text-muted-foreground mt-1">
                Here&apos;s an overview of your files and storage.
              </p>
            </div>

            {/* No zones warning */}
            {!isLoading && !hasZones && (
              <Card className="border-yellow-500/50 bg-yellow-500/5">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-full bg-yellow-500/10">
                      <Database className="h-6 w-6 text-yellow-500" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold">No Storage Zones Available</h3>
                      <p className="text-sm text-muted-foreground">
                        {user?.role === "admin"
                          ? "Create a storage pool and zone to start storing files."
                          : "Contact an administrator to get access to a storage zone."}
                      </p>
                    </div>
                    {user?.role === "admin" && (
                      <Button asChild>
                        <Link href="/admin/storage/pools">
                          Create Storage Pool
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Storage Zones</CardTitle>
                  <Database className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-8 w-12" />
                  ) : (
                    <div className="text-2xl font-bold">{stats.zoneCount}</div>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    zones accessible to you
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Storage Used</CardTitle>
                  <HardDrive className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-8 w-20" />
                  ) : (
                    <div className="text-2xl font-bold">{formatFileSize(stats.totalSize)}</div>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    {primaryZone ? `in ${primaryZone.zone_name}` : "no zone selected"}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Files</CardTitle>
                  <Files className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-8 w-12" />
                  ) : (
                    <div className="text-2xl font-bold">{stats.fileCount.toLocaleString()}</div>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    total files in zone
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Folders</CardTitle>
                  <Folder className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-8 w-12" />
                  ) : (
                    <div className="text-2xl font-bold">{stats.folderCount.toLocaleString()}</div>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    total folders in zone
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Quick Actions */}
            {hasZones && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="h-5 w-5" />
                    Quick Actions
                  </CardTitle>
                  <CardDescription>
                    {primaryZone && (
                      <>
                        Current zone: <Badge variant="secondary">{primaryZone.zone_name}</Badge>
                        {primaryZone.zone_type === "personal" && (
                          <span className="text-muted-foreground ml-2">(Personal)</span>
                        )}
                      </>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    {primaryZone && primaryZone.can_upload ? (
                      <UploadButton currentPath="/" zoneId={primaryZone.zone_id} />
                    ) : primaryZone ? (
                      <span className="text-sm text-muted-foreground">This zone is read-only</span>
                    ) : null}
                    <Button variant="outline" asChild>
                      <Link href="/files">
                        <Files className="h-4 w-4 mr-2" />
                        Browse Files
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Recent Files */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      Recent Files
                    </CardTitle>
                    {primaryZone && (
                      <CardDescription>
                        From {primaryZone.zone_name}
                      </CardDescription>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/files">
                      View all
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-3">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-lg border">
                        <div className="flex items-center space-x-3">
                          <Skeleton className="h-5 w-5" />
                          <div>
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-16 mt-1" />
                          </div>
                        </div>
                        <Skeleton className="h-4 w-20" />
                      </div>
                    ))}
                  </div>
                ) : !hasZones ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <Files className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p>No storage zones configured</p>
                    <p className="text-sm">Set up a storage zone to start uploading files</p>
                  </div>
                ) : recentFiles.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <Files className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p>No files yet</p>
                    <p className="text-sm">Upload some files to get started</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {recentFiles.map((file, index) => (
                      <div
                        key={`${file.path}-${index}`}
                        className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors cursor-pointer"
                      >
                        <div className="flex items-center space-x-3">
                          <Files className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{file.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {formatFileSize(file.size)}
                            </p>
                          </div>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {formatRelativeTime(file.mod_time)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}
