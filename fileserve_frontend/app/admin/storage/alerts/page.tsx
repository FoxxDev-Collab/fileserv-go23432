"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { PageSkeleton } from "@/components/skeletons";
import {
  Bell,
  Mail,
  AlertTriangle,
  HardDrive,
  Thermometer,
  Database,
  Server,
  Clock,
  Settings,
} from "lucide-react";

export default function AlertsPlaceholderPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [authLoading, isAuthenticated, router]);

  if (authLoading) {
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
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-muted mb-6">
                <Bell className="h-10 w-10 text-muted-foreground" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight mb-2">Email Alerts</h1>
              <Badge variant="secondary" className="mb-4">Coming Soon</Badge>
              <p className="text-muted-foreground max-w-md mx-auto">
                Email notifications for critical storage events are planned for a future release.
              </p>
            </div>

            {/* Planned Features */}
            <Card>
              <CardHeader>
                <CardTitle>Planned Features</CardTitle>
                <CardDescription>
                  The following alert capabilities are planned for implementation
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="flex items-start gap-3 p-4 border rounded-lg">
                    <Mail className="h-5 w-5 text-blue-500 mt-0.5" />
                    <div>
                      <h3 className="font-medium">SMTP Configuration</h3>
                      <p className="text-sm text-muted-foreground">
                        Configure email server settings for sending notifications
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-4 border rounded-lg">
                    <HardDrive className="h-5 w-5 text-red-500 mt-0.5" />
                    <div>
                      <h3 className="font-medium">Disk Failure Alerts</h3>
                      <p className="text-sm text-muted-foreground">
                        Immediate notification when SMART detects disk issues
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-4 border rounded-lg">
                    <Database className="h-5 w-5 text-orange-500 mt-0.5" />
                    <div>
                      <h3 className="font-medium">RAID/ZFS Degraded</h3>
                      <p className="text-sm text-muted-foreground">
                        Alert when storage arrays enter degraded state
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-4 border rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
                    <div>
                      <h3 className="font-medium">Space Low Warnings</h3>
                      <p className="text-sm text-muted-foreground">
                        Notification when storage reaches threshold (e.g., 80%, 90%)
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-4 border rounded-lg">
                    <Thermometer className="h-5 w-5 text-red-500 mt-0.5" />
                    <div>
                      <h3 className="font-medium">Temperature Alerts</h3>
                      <p className="text-sm text-muted-foreground">
                        Warning when drives exceed safe operating temperatures
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-4 border rounded-lg">
                    <Server className="h-5 w-5 text-purple-500 mt-0.5" />
                    <div>
                      <h3 className="font-medium">Service Status</h3>
                      <p className="text-sm text-muted-foreground">
                        Alerts when SMB/NFS services stop unexpectedly
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-4 border rounded-lg">
                    <Clock className="h-5 w-5 text-green-500 mt-0.5" />
                    <div>
                      <h3 className="font-medium">Scrub/Sync Reports</h3>
                      <p className="text-sm text-muted-foreground">
                        Summary emails after ZFS scrubs or RAID rebuilds
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-4 border rounded-lg">
                    <Settings className="h-5 w-5 text-gray-500 mt-0.5" />
                    <div>
                      <h3 className="font-medium">Alert Configuration</h3>
                      <p className="text-sm text-muted-foreground">
                        Customize which alerts to receive and their severity
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Current Status */}
            <Card>
              <CardHeader>
                <CardTitle>Current Monitoring Status</CardTitle>
                <CardDescription>
                  While email alerts are not yet available, the system is actively monitoring
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <span className="flex items-center gap-2">
                      <HardDrive className="h-4 w-4" />
                      SMART Monitoring
                    </span>
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                      Active
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <span className="flex items-center gap-2">
                      <Database className="h-4 w-4" />
                      ZFS Health Checks
                    </span>
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                      Active
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <span className="flex items-center gap-2">
                      <Server className="h-4 w-4" />
                      Service Monitoring
                    </span>
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                      Active
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <span className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      Email Notifications
                    </span>
                    <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200">
                      Not Configured
                    </Badge>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-4">
                  Check the dashboard and storage pages regularly for system health information.
                  Critical issues will be displayed in the UI even without email alerts configured.
                </p>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}
