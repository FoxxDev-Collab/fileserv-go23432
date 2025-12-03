"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { PageSkeleton } from "@/components/skeletons";
import { ArrowRight, FolderTree, Info } from "lucide-react";

export default function SharesRedirectPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

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

  if (authLoading && !user) {
    return <PageSkeleton title="Network Shares" />;
  }

  if (!isAuthenticated || (user && user.role !== "admin")) {
    return <PageSkeleton title="Network Shares" />;
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Info className="h-5 w-5 text-blue-500" />
                  Network Shares Have Moved
                </CardTitle>
                <CardDescription>
                  Network share management has been integrated into Share Zones
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">
                  SMB and NFS sharing configuration is now managed through Share Zones.
                  Each zone can be configured with:
                </p>
                <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                  <li>SMB/CIFS settings (share name, masks, veto files, etc.)</li>
                  <li>NFS export settings (allowed hosts, squash options, etc.)</li>
                  <li>Web sharing and public link settings</li>
                  <li>Access control (allowed/denied users and groups)</li>
                </ul>
                <div className="pt-4">
                  <Button onClick={() => router.push("/admin/storage/zones")}>
                    <FolderTree className="h-4 w-4 mr-2" />
                    Go to Share Zones
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}
