"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { PageSkeleton } from "@/components/skeletons";

export default function SettingsPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  useEffect(() => {
    // Wait for auth to finish loading before making any redirect decisions
    if (authLoading) return;

    // Not authenticated - redirect to login
    if (!isAuthenticated) {
      router.replace("/");
    }
  }, [authLoading, isAuthenticated, router]);

  const settings = {
    maxFileSize: 100,
    allowedFileTypes: '*',
    defaultStorageQuota: 10,
    registrationEnabled: true,
  };

  const handleSave = () => {
    toast.success("Settings saved successfully");
  };

  // Show skeleton during initial auth check (only if no cached user)
  if (authLoading && !user) {
    return <PageSkeleton title="Settings" showTable={false} />;
  }

  // Not authenticated - will redirect, show skeleton in meantime
  if (!isAuthenticated) {
    return <PageSkeleton title="Settings" showTable={false} />;
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Settings" />

        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto space-y-6">
            <p className="text-muted-foreground">
              Configure system and file management settings
            </p>

            {/* File Settings */}
            <div className="border rounded-lg p-6 space-y-6">
              <div>
                <h2 className="text-2xl font-semibold mb-4">File Settings</h2>
              </div>

              <div className="space-y-4">
                {/* Max File Size */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Maximum File Size (MB)
                  </label>
                  <input
                    type="number"
                    defaultValue={settings.maxFileSize}
                    className="w-full px-4 py-2 border rounded-lg bg-background"
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum size for individual file uploads
                  </p>
                </div>

                {/* Allowed File Types */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Allowed File Types
                  </label>
                  <input
                    type="text"
                    defaultValue={settings.allowedFileTypes}
                    placeholder="*.pdf, *.jpg, *.png or * for all"
                    className="w-full px-4 py-2 border rounded-lg bg-background"
                  />
                  <p className="text-xs text-muted-foreground">
                    Comma-separated list of allowed extensions or * for all types
                  </p>
                </div>

                {/* Default Storage Quota */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Default Storage Quota (GB)
                  </label>
                  <input
                    type="number"
                    defaultValue={settings.defaultStorageQuota}
                    className="w-full px-4 py-2 border rounded-lg bg-background"
                  />
                  <p className="text-xs text-muted-foreground">
                    Default storage limit for new users
                  </p>
                </div>
              </div>
            </div>

            {/* Permission Templates */}
            <div className="border rounded-lg p-6 space-y-6">
              <div>
                <h2 className="text-2xl font-semibold mb-4">
                  Permission Templates
                </h2>
                <p className="text-sm text-muted-foreground">
                  Create reusable permission templates for files and folders
                </p>
              </div>

              <div className="space-y-4">
                <div className="border rounded-lg p-4 flex justify-between items-center">
                  <div>
                    <p className="font-medium">Read Only</p>
                    <p className="text-sm text-muted-foreground">
                      Users can only view files
                    </p>
                  </div>
                  <button className="px-4 py-2 border rounded-lg hover:bg-accent transition-colors">
                    Edit
                  </button>
                </div>

                <div className="border rounded-lg p-4 flex justify-between items-center">
                  <div>
                    <p className="font-medium">Read & Write</p>
                    <p className="text-sm text-muted-foreground">
                      Users can view and modify files
                    </p>
                  </div>
                  <button className="px-4 py-2 border rounded-lg hover:bg-accent transition-colors">
                    Edit
                  </button>
                </div>

                <button className="w-full py-2 border border-dashed rounded-lg hover:bg-accent transition-colors">
                  + Add Template
                </button>
              </div>
            </div>

            {/* User Settings */}
            <div className="border rounded-lg p-6 space-y-6">
              <div>
                <h2 className="text-2xl font-semibold mb-4">User Settings</h2>
              </div>

              <div className="space-y-4">
                {/* Registration Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">User Registration</p>
                    <p className="text-sm text-muted-foreground">
                      Allow new users to create accounts
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      defaultChecked={settings.registrationEnabled}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end gap-4">
              <Button variant="outline">Cancel</Button>
              <Button onClick={handleSave}>Save Changes</Button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
