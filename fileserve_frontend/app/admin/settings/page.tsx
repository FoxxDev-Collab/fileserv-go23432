"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { settingsAPI, Setting, SettingsUpdateRequest } from "@/lib/api";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Settings,
  Shield,
  Users,
  Clock,
  RefreshCw,
  Save,
  Loader2,
  AlertTriangle,
  Server
} from "lucide-react";

export default function SettingsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [settings, setSettings] = useState<Setting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Form state
  const [serverName, setServerName] = useState("");
  const [usePAM, setUsePAM] = useState(true);
  const [adminGroups, setAdminGroups] = useState<string[]>([]);
  const [adminGroupInput, setAdminGroupInput] = useState("");
  const [sessionExpiry, setSessionExpiry] = useState(24);

  // Redirect non-admins
  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) {
      router.push("/dashboard");
    }
  }, [user, authLoading, router]);

  // Load settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const data = await settingsAPI.getAll();
        setSettings(data);

        // Parse settings into form state
        for (const setting of data) {
          switch (setting.key) {
            case "server_name":
              setServerName(setting.value);
              break;
            case "use_pam":
              setUsePAM(setting.value === "true");
              break;
            case "admin_groups":
              try {
                setAdminGroups(JSON.parse(setting.value));
              } catch {
                setAdminGroups(setting.value.split(","));
              }
              break;
            case "session_expiry_hours":
              setSessionExpiry(parseInt(setting.value) || 24);
              break;
          }
        }
      } catch (error) {
        console.error("Failed to load settings:", error);
        toast.error("Failed to load settings");
      } finally {
        setIsLoading(false);
      }
    };

    if (user?.role === "admin") {
      loadSettings();
    }
  }, [user]);

  const handleAddGroup = () => {
    const group = adminGroupInput.trim();
    if (group && !adminGroups.includes(group)) {
      setAdminGroups([...adminGroups, group]);
      setAdminGroupInput("");
    }
  };

  const handleRemoveGroup = (group: string) => {
    setAdminGroups(adminGroups.filter((g) => g !== group));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const request: SettingsUpdateRequest = {
        server_name: serverName,
        admin_groups: adminGroups,
        use_pam: usePAM,
        session_expiry_hours: sessionExpiry,
      };

      await settingsAPI.update(request);
      toast.success("Settings saved successfully");
    } catch (error) {
      console.error("Failed to save settings:", error);
      toast.error("Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegenerateJWT = async () => {
    setIsRegenerating(true);
    try {
      await settingsAPI.regenerateJWT();
      toast.success("JWT secret regenerated. All sessions have been invalidated.");
      // Log out the user since their session is now invalid
      router.push("/login");
    } catch (error) {
      console.error("Failed to regenerate JWT:", error);
      toast.error("Failed to regenerate JWT secret");
    } finally {
      setIsRegenerating(false);
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header title="Server Settings" />
          <main className="flex-1 overflow-y-auto p-6">
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return null;
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Server Settings" />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Settings className="h-6 w-6" />
              Server Settings
            </h1>
            <p className="text-muted-foreground">
              Configure your FileServ instance
            </p>
          </div>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </div>

        <div className="grid gap-6">
          {/* General Settings */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Server className="h-5 w-5 text-primary" />
                <CardTitle>General Settings</CardTitle>
              </div>
              <CardDescription>Basic server configuration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="serverName">Server Name</Label>
                <Input
                  id="serverName"
                  value={serverName}
                  onChange={(e) => setServerName(e.target.value)}
                  placeholder="FileServ"
                />
                <p className="text-xs text-muted-foreground">
                  Displayed in the web interface and page titles
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sessionExpiry">Session Duration (hours)</Label>
                <Input
                  id="sessionExpiry"
                  type="number"
                  value={sessionExpiry}
                  onChange={(e) => setSessionExpiry(parseInt(e.target.value) || 24)}
                  min={1}
                  max={168}
                />
                <p className="text-xs text-muted-foreground">
                  How long user sessions remain valid (1-168 hours)
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Authentication Settings */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                <CardTitle>Authentication</CardTitle>
              </div>
              <CardDescription>User authentication configuration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="usePAM" className="text-base">PAM Authentication</Label>
                  <p className="text-sm text-muted-foreground">
                    Users authenticate with their Linux system credentials
                  </p>
                </div>
                <Switch
                  id="usePAM"
                  checked={usePAM}
                  onCheckedChange={setUsePAM}
                />
              </div>

              <div className="space-y-3">
                <Label>Admin Groups</Label>
                <p className="text-sm text-muted-foreground">
                  System users in these groups have administrator access
                </p>
                <div className="flex gap-2">
                  <Input
                    value={adminGroupInput}
                    onChange={(e) => setAdminGroupInput(e.target.value)}
                    placeholder="Add a group..."
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddGroup();
                      }
                    }}
                  />
                  <Button variant="outline" onClick={handleAddGroup}>
                    Add
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {adminGroups.map((group) => (
                    <Badge
                      key={group}
                      variant="secondary"
                      className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground transition-colors"
                      onClick={() => handleRemoveGroup(group)}
                    >
                      {group} ×
                    </Badge>
                  ))}
                  {adminGroups.length === 0 && (
                    <p className="text-sm text-muted-foreground">No admin groups configured</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Security Settings */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                <CardTitle>Security</CardTitle>
              </div>
              <CardDescription>Security and token management</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border p-4 space-y-4">
                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium">JWT Secret</p>
                    <p className="text-sm text-muted-foreground">
                      The JWT secret is used to sign authentication tokens.
                      Regenerating it will invalidate all active sessions.
                    </p>
                  </div>
                </div>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" disabled={isRegenerating}>
                      {isRegenerating ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Regenerating...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Regenerate JWT Secret
                        </>
                      )}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                        Regenerate JWT Secret?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This action will:
                        <ul className="list-disc list-inside mt-2 space-y-1">
                          <li>Generate a new secure JWT secret</li>
                          <li>Invalidate ALL active user sessions</li>
                          <li>Force all users to log in again</li>
                        </ul>
                        <p className="mt-2 font-medium">This action cannot be undone.</p>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleRegenerateJWT}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Regenerate
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>
        </div>
          </div>
        </main>
      </div>
    </div>
  );
}
