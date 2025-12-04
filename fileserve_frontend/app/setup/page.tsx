"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { setupAPI, SetupRequest } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Server,
  Shield,
  Users,
  Clock,
  CheckCircle2,
  Loader2,
  ArrowRight,
  ArrowLeft,
  HardDrive
} from "lucide-react";

type Step = "welcome" | "server" | "auth" | "complete";

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("welcome");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);

  // Form state
  const [serverName, setServerName] = useState("FileServ");
  const [usePAM, setUsePAM] = useState(true);
  const [adminGroups, setAdminGroups] = useState<string[]>(["sudo", "wheel", "admin", "root"]);
  const [adminGroupInput, setAdminGroupInput] = useState("");
  const [sessionExpiry, setSessionExpiry] = useState(24);

  // Check if setup is already complete
  useEffect(() => {
    const checkSetup = async () => {
      try {
        const status = await setupAPI.getStatus();
        if (status.setup_complete) {
          setSetupComplete(true);
          router.push("/login");
        }
      } catch (error) {
        console.error("Failed to check setup status:", error);
      } finally {
        setIsLoading(false);
      }
    };
    checkSetup();
  }, [router]);

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

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const request: SetupRequest = {
        server_name: serverName,
        admin_groups: adminGroups,
        use_pam: usePAM,
        session_expiry_hours: sessionExpiry,
      };

      await setupAPI.complete(request);
      toast.success("Setup completed successfully!");
      setStep("complete");
    } catch (error) {
      console.error("Setup failed:", error);
      toast.error("Setup failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const nextStep = () => {
    switch (step) {
      case "welcome":
        setStep("server");
        break;
      case "server":
        setStep("auth");
        break;
      case "auth":
        handleSubmit();
        break;
    }
  };

  const prevStep = () => {
    switch (step) {
      case "server":
        setStep("welcome");
        break;
      case "auth":
        setStep("server");
        break;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (setupComplete) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <div className="w-full max-w-2xl">
        {/* Progress indicator */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-2">
            {["welcome", "server", "auth", "complete"].map((s, i) => (
              <div key={s} className="flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                    step === s
                      ? "bg-primary text-primary-foreground"
                      : ["welcome", "server", "auth", "complete"].indexOf(step) > i
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {i + 1}
                </div>
                {i < 3 && (
                  <div
                    className={`w-8 h-0.5 ${
                      ["welcome", "server", "auth", "complete"].indexOf(step) > i
                        ? "bg-primary/40"
                        : "bg-muted"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Welcome Step */}
        {step === "welcome" && (
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <HardDrive className="h-8 w-8 text-primary" />
              </div>
              <CardTitle className="text-3xl">Welcome to FileServ</CardTitle>
              <CardDescription className="text-lg">
                Let&apos;s get your file server configured in just a few steps.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 text-sm">
                <div className="flex items-start gap-3">
                  <Server className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium">Server Configuration</p>
                    <p className="text-muted-foreground">Name your server and configure basic settings</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Shield className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium">Automatic Security</p>
                    <p className="text-muted-foreground">
                      A secure JWT secret will be automatically generated
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Users className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium">PAM Authentication</p>
                    <p className="text-muted-foreground">
                      Users authenticate with their Linux system credentials
                    </p>
                  </div>
                </div>
              </div>

              <Button onClick={nextStep} className="w-full" size="lg">
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Server Configuration Step */}
        {step === "server" && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Server className="h-5 w-5 text-primary" />
                <CardTitle>Server Configuration</CardTitle>
              </div>
              <CardDescription>Configure your server name and basic settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="serverName">Server Name</Label>
                <Input
                  id="serverName"
                  value={serverName}
                  onChange={(e) => setServerName(e.target.value)}
                  placeholder="FileServ"
                />
                <p className="text-xs text-muted-foreground">
                  This name will be displayed in the web interface
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
                  How long users stay logged in (1-168 hours)
                </p>
              </div>

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={prevStep}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button onClick={nextStep}>
                  Continue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Authentication Step */}
        {step === "auth" && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                <CardTitle>Authentication Settings</CardTitle>
              </div>
              <CardDescription>Configure how users authenticate to the system</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="usePAM" className="text-base">Use PAM Authentication</Label>
                  <p className="text-sm text-muted-foreground">
                    Users log in with their Linux system credentials
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
                  Users in these system groups will have administrator privileges
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
                      className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
                      onClick={() => handleRemoveGroup(group)}
                    >
                      {group} ×
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="rounded-lg bg-muted p-4">
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4" />
                  <span className="font-medium">Security Note</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  A secure JWT secret will be automatically generated and stored in the database.
                  You can regenerate it later from the admin settings page.
                </p>
              </div>

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={prevStep}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button onClick={nextStep} disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Setting up...
                    </>
                  ) : (
                    <>
                      Complete Setup
                      <CheckCircle2 className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Complete Step */}
        {step === "complete" && (
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              </div>
              <CardTitle className="text-3xl">Setup Complete!</CardTitle>
              <CardDescription className="text-lg">
                Your FileServ instance is ready to use.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-lg bg-muted p-4 space-y-2">
                <p className="text-sm">
                  <span className="font-medium">Server Name:</span> {serverName}
                </p>
                <p className="text-sm">
                  <span className="font-medium">Authentication:</span>{" "}
                  {usePAM ? "PAM (System Users)" : "Internal"}
                </p>
                <p className="text-sm">
                  <span className="font-medium">Admin Groups:</span> {adminGroups.join(", ")}
                </p>
                <p className="text-sm">
                  <span className="font-medium">Session Duration:</span> {sessionExpiry} hours
                </p>
              </div>

              <div className="text-center text-sm text-muted-foreground">
                <p>Log in with your system credentials to get started.</p>
                <p>Users in the admin groups listed above will have full access.</p>
              </div>

              <Button onClick={() => router.push("/login")} className="w-full" size="lg">
                Go to Login
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
