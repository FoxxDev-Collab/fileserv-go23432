"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { authAPI } from "@/lib/api";
import { toast } from "sonner";
import { PageSkeleton } from "@/components/skeletons";
import { User, Lock, Palette, Sun, Moon, Monitor, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Handle hydration mismatch for theme
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.replace("/");
    }
  }, [authLoading, isAuthenticated, router]);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }

    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }

    setIsChangingPassword(true);
    try {
      await authAPI.changePassword(currentPassword, newPassword);
      toast.success("Password changed successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to change password";
      toast.error(message);
    } finally {
      setIsChangingPassword(false);
    }
  };

  if (authLoading && !user) {
    return <PageSkeleton title="Settings" showTable={false} />;
  }

  if (!isAuthenticated) {
    return <PageSkeleton title="Settings" showTable={false} />;
  }

  const themeOptions = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ];

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Settings" />

        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto space-y-6">
            <p className="text-muted-foreground">
              Manage your account settings and preferences
            </p>

            {/* Profile Section */}
            <div className="border rounded-lg p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Profile</h2>
                  <p className="text-sm text-muted-foreground">Your account information</p>
                </div>
              </div>

              <div className="grid gap-4 pt-2">
                <div className="space-y-2">
                  <Label>Username</Label>
                  <Input value={user?.username || ""} disabled className="bg-muted" />
                  <p className="text-xs text-muted-foreground">
                    Your system username cannot be changed
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Groups</Label>
                  <div className="flex flex-wrap gap-2">
                    {user?.groups?.length ? (
                      user.groups.map((group) => (
                        <span
                          key={group}
                          className="px-2 py-1 bg-muted rounded-md text-sm"
                        >
                          {group}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">No groups</span>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Role</Label>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "px-2 py-1 rounded-md text-sm font-medium",
                      user?.role === "admin"
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground"
                    )}>
                      {user?.role === "admin" ? "Administrator" : "User"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Password Change Section */}
            <div className="border rounded-lg p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Lock className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Change Password</h2>
                  <p className="text-sm text-muted-foreground">Update your system password</p>
                </div>
              </div>

              <form onSubmit={handlePasswordChange} className="grid gap-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="current-password">Current Password</Label>
                  <div className="relative">
                    <Input
                      id="current-password"
                      type={showCurrentPassword ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    >
                      {showCurrentPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                      minLength={8}
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                    >
                      {showNewPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Must be at least 8 characters
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm New Password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    required
                  />
                </div>

                <Button
                  type="submit"
                  disabled={isChangingPassword || !currentPassword || !newPassword || !confirmPassword}
                  className="w-full sm:w-auto"
                >
                  {isChangingPassword ? "Changing..." : "Change Password"}
                </Button>
              </form>
            </div>

            {/* Theme Section */}
            <div className="border rounded-lg p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Palette className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Appearance</h2>
                  <p className="text-sm text-muted-foreground">Customize how the app looks</p>
                </div>
              </div>

              <div className="pt-2">
                <Label className="mb-3 block">Theme</Label>
                <div className="grid grid-cols-3 gap-3">
                  {themeOptions.map((option) => {
                    const Icon = option.icon;
                    const isActive = mounted && theme === option.value;
                    return (
                      <button
                        key={option.value}
                        onClick={() => setTheme(option.value)}
                        className={cn(
                          "flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors",
                          isActive
                            ? "border-primary bg-primary/5"
                            : "border-muted hover:border-muted-foreground/50"
                        )}
                      >
                        <Icon className={cn(
                          "h-5 w-5",
                          isActive ? "text-primary" : "text-muted-foreground"
                        )} />
                        <span className={cn(
                          "text-sm font-medium",
                          isActive ? "text-primary" : "text-muted-foreground"
                        )}>
                          {option.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {mounted && theme === "system" && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Currently using {resolvedTheme} mode based on your system preferences
                  </p>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
