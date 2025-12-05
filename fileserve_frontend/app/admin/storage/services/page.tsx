"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/lib/auth-context";
import { TerminalOutput } from "@/components/terminal-output";
import {
  sharingServicesAPI,
  SharingServicesResponse,
  SharingServiceStatus,
  SMBStatusResponse,
  NFSStatusResponse,
} from "@/lib/api";
import { PageSkeleton } from "@/components/skeletons";
import { toast } from "sonner";
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
  Server,
  HardDrive,
  RefreshCw,
  Play,
  Square,
  RotateCw,
  Power,
  PowerOff,
  Download,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  Network,
  Info,
  Shield,
  Users,
  FolderOpen,
  MonitorSmartphone,
  FileText,
  Globe,
  Disc,
  Clock,
} from "lucide-react";

export default function SharingServicesPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [services, setServices] = useState<SharingServicesResponse | null>(null);
  const [smbStatus, setSmbStatus] = useState<SMBStatusResponse | null>(null);
  const [nfsStatus, setNfsStatus] = useState<NFSStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [installingService, setInstallingService] = useState<"smb" | "nfs" | null>(null);
  const [showInstallTerminal, setShowInstallTerminal] = useState(false);
  const [controllingService, setControllingService] = useState<string | null>(null);

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

  const fetchServices = async () => {
    try {
      const data = await sharingServicesAPI.getStatus();
      setServices(data);

      // Fetch detailed status if services are running
      if (data.smb.installed && data.smb.running) {
        try {
          const smbData = await sharingServicesAPI.getSMBStatus();
          setSmbStatus(smbData);
        } catch {
          // Ignore errors for detailed status
        }
      }

      if (data.nfs.installed && data.nfs.running) {
        try {
          const nfsData = await sharingServicesAPI.getNFSStatus();
          setNfsStatus(nfsData);
        } catch {
          // Ignore errors for detailed status
        }
      }
    } catch (error) {
      toast.error(`Failed to load services: ${error}`);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && user?.role === "admin") {
      fetchServices();
    }
  }, [isAuthenticated, user]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchServices();
  };

  const handleInstall = (service: "smb" | "nfs") => {
    setInstallingService(service);
    setShowInstallTerminal(true);
  };

  const handleInstallComplete = useCallback((success: boolean) => {
    const service = installingService;
    if (success) {
      toast.success(`${service?.toUpperCase()} installed successfully`);
      fetchServices();
    } else {
      toast.error(`Failed to install ${service?.toUpperCase()} - check the output above for details`);
    }
  }, [installingService]);

  const handleCloseTerminal = () => {
    setShowInstallTerminal(false);
    setInstallingService(null);
    fetchServices();
  };

  const handleControl = async (
    service: "smb" | "nfs",
    action: "start" | "stop" | "restart" | "enable" | "disable"
  ) => {
    setControllingService(`${service}-${action}`);
    try {
      await sharingServicesAPI.control(service, action);
      toast.success(`${service.toUpperCase()} ${action} successful`);
      fetchServices();
    } catch (error) {
      toast.error(`Failed to ${action} ${service}: ${error}`);
    } finally {
      setControllingService(null);
    }
  };

  if (authLoading && !user) {
    return <PageSkeleton title="Sharing Services" />;
  }

  if (!isAuthenticated || (user && user.role !== "admin")) {
    return <PageSkeleton title="Sharing Services" />;
  }

  if (isLoading) {
    return <PageSkeleton title="Sharing Services" />;
  }

  const getStatusBadge = (status: SharingServiceStatus) => {
    if (!status.installed) {
      return <Badge variant="secondary">Not Installed</Badge>;
    }
    if (status.running) {
      return <Badge variant="default" className="bg-green-600">Running</Badge>;
    }
    if (status.enabled) {
      return <Badge variant="outline" className="text-yellow-600 border-yellow-600">Stopped (Enabled)</Badge>;
    }
    return <Badge variant="destructive">Stopped</Badge>;
  };

  const getStatusIcon = (status: SharingServiceStatus) => {
    if (!status.installed) {
      return <XCircle className="h-8 w-8 text-muted-foreground" />;
    }
    if (status.running) {
      return <CheckCircle className="h-8 w-8 text-green-500" />;
    }
    return <AlertTriangle className="h-8 w-8 text-yellow-500" />;
  };

  const renderServiceCard = (
    status: SharingServiceStatus,
    serviceKey: "smb" | "nfs",
    icon: React.ReactNode,
    description: string
  ) => {
    const isInstalling = installingService === serviceKey;
    const isControlling = controllingService?.startsWith(serviceKey);

    return (
      <Card className="flex-1">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              {icon}
              <div>
                <CardTitle className="text-lg">{status.display_name}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </div>
            </div>
            {getStatusIcon(status)}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            {getStatusBadge(status)}
            {status.version && (
              <Badge variant="outline">v{status.version}</Badge>
            )}
            {status.installed && status.active_shares > 0 && (
              <Badge variant="secondary">{status.active_shares} active shares</Badge>
            )}
          </div>

          <p className="text-sm text-muted-foreground">{status.message}</p>

          {!status.installed ? (
            <div className="pt-2">
              {services?.can_install ? (
                <Button
                  onClick={() => handleInstall(serviceKey)}
                  disabled={isInstalling}
                  className="w-full"
                >
                  {isInstalling ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Installing...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Install {status.package_name}
                    </>
                  )}
                </Button>
              ) : (
                <Alert>
                  <Shield className="h-4 w-4" />
                  <AlertTitle>Installation Required</AlertTitle>
                  <AlertDescription>
                    Run the following command as root to install:
                    <code className="block mt-2 p-2 bg-muted rounded text-xs">
                      {services?.package_manager === "apt"
                        ? `sudo apt install ${status.package_name}`
                        : `sudo dnf install ${status.package_name}`}
                    </code>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          ) : (
            <div className="pt-2 space-y-3">
              {/* Service Controls */}
              <div className="flex flex-wrap gap-2">
                {status.running ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleControl(serviceKey, "stop")}
                      disabled={isControlling}
                    >
                      {controllingService === `${serviceKey}-stop` ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Square className="h-4 w-4 mr-1" />
                      )}
                      Stop
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleControl(serviceKey, "restart")}
                      disabled={isControlling}
                    >
                      {controllingService === `${serviceKey}-restart` ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <RotateCw className="h-4 w-4 mr-1" />
                      )}
                      Restart
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => handleControl(serviceKey, "start")}
                    disabled={isControlling}
                  >
                    {controllingService === `${serviceKey}-start` ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 mr-1" />
                    )}
                    Start
                  </Button>
                )}

                {status.enabled ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleControl(serviceKey, "disable")}
                    disabled={isControlling}
                  >
                    {controllingService === `${serviceKey}-disable` ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <PowerOff className="h-4 w-4 mr-1" />
                    )}
                    Disable Autostart
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleControl(serviceKey, "enable")}
                    disabled={isControlling}
                  >
                    {controllingService === `${serviceKey}-enable` ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Power className="h-4 w-4 mr-1" />
                    )}
                    Enable Autostart
                  </Button>
                )}
              </div>

              {/* Service Info */}
              <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
                <div className="flex justify-between">
                  <span>Service name:</span>
                  <code>{status.service_name}</code>
                </div>
                <div className="flex justify-between">
                  <span>Autostart:</span>
                  <span>{status.enabled ? "Enabled" : "Disabled"}</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">Sharing Services</h1>
                <p className="text-muted-foreground">
                  Manage SMB and NFS file sharing services
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>

            {/* Status Overview */}
            {services && (
              <>
                {!services.smb.installed && !services.nfs.installed && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>No Sharing Services Installed</AlertTitle>
                    <AlertDescription>
                      Neither SMB nor NFS are installed on this server. Install at least one sharing service
                      to enable network file sharing for your zones.
                    </AlertDescription>
                  </Alert>
                )}

                {(services.smb.installed && !services.smb.running) ||
                (services.nfs.installed && !services.nfs.running) ? (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>Services Not Running</AlertTitle>
                    <AlertDescription>
                      Some installed services are not currently running. Start them to enable file sharing.
                    </AlertDescription>
                  </Alert>
                ) : null}
              </>
            )}

            {/* Service Cards */}
            <div className="grid gap-6 md:grid-cols-2">
              {services && renderServiceCard(
                services.smb,
                "smb",
                <Server className="h-10 w-10 text-blue-500" />,
                "Windows-compatible file sharing using SMB/CIFS protocol"
              )}
              {services && renderServiceCard(
                services.nfs,
                "nfs",
                <HardDrive className="h-10 w-10 text-orange-500" />,
                "Unix/Linux native file sharing using NFS protocol"
              )}
            </div>

            {/* Future Services - Placeholders */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Coming Soon
                </CardTitle>
                <CardDescription>
                  Additional sharing protocols planned for future releases
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  {/* iSCSI Placeholder */}
                  <div className="border rounded-lg p-4 opacity-60">
                    <div className="flex items-start gap-3">
                      <Disc className="h-10 w-10 text-purple-500" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">iSCSI Target</h3>
                          <Badge variant="outline" className="text-xs">Planned</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          Block-level storage sharing over IP networks. Present storage as virtual disks to remote servers.
                        </p>
                        <ul className="text-xs text-muted-foreground mt-3 space-y-1">
                          <li>Block-level access for VMs and databases</li>
                          <li>iSCSI initiator support for clients</li>
                          <li>LUN management and access control</li>
                          <li>CHAP authentication support</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* WebDAV Placeholder */}
                  <div className="border rounded-lg p-4 opacity-60">
                    <div className="flex items-start gap-3">
                      <Globe className="h-10 w-10 text-green-500" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">WebDAV</h3>
                          <Badge variant="outline" className="text-xs">Planned</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          Web-based file access over HTTP/HTTPS. Access files through any web browser or WebDAV client.
                        </p>
                        <ul className="text-xs text-muted-foreground mt-3 space-y-1">
                          <li>Browser-based file access</li>
                          <li>HTTPS encryption support</li>
                          <li>Integration with cloud storage apps</li>
                          <li>Works through firewalls and proxies</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Installation Terminal Output */}
            {showInstallTerminal && installingService && (
              <TerminalOutput
                url={`/api/sharing/install/stream?service=${installingService}`}
                title={`${installingService.toUpperCase()} Installation`}
                onComplete={handleInstallComplete}
                onClose={handleCloseTerminal}
              />
            )}

            {/* Connections Status */}
            {services && (services.smb.running || services.nfs.running) && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MonitorSmartphone className="h-5 w-5" />
                    Active Connections
                  </CardTitle>
                  <CardDescription>
                    Monitor active client connections and open files
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue={services.smb.running ? "smb" : "nfs"}>
                    <TabsList className="mb-4">
                      {services.smb.running && (
                        <TabsTrigger value="smb" className="gap-2">
                          <Server className="h-4 w-4" />
                          SMB
                          {smbStatus && smbStatus.total_clients > 0 && (
                            <Badge variant="secondary" className="ml-1">
                              {smbStatus.total_clients}
                            </Badge>
                          )}
                        </TabsTrigger>
                      )}
                      {services.nfs.running && (
                        <TabsTrigger value="nfs" className="gap-2">
                          <HardDrive className="h-4 w-4" />
                          NFS
                          {nfsStatus && nfsStatus.total_clients > 0 && (
                            <Badge variant="secondary" className="ml-1">
                              {nfsStatus.total_clients}
                            </Badge>
                          )}
                        </TabsTrigger>
                      )}
                    </TabsList>

                    {/* SMB Tab */}
                    {services.smb.running && (
                      <TabsContent value="smb" className="space-y-6">
                        {/* SMB Summary */}
                        <div className="grid gap-4 md:grid-cols-3">
                          <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                            <Users className="h-8 w-8 text-blue-500" />
                            <div>
                              <p className="text-2xl font-bold">{smbStatus?.total_clients ?? 0}</p>
                              <p className="text-sm text-muted-foreground">Connected Clients</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                            <FolderOpen className="h-8 w-8 text-green-500" />
                            <div>
                              <p className="text-2xl font-bold">{smbStatus?.total_shares ?? 0}</p>
                              <p className="text-sm text-muted-foreground">Active Shares</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                            <FileText className="h-8 w-8 text-orange-500" />
                            <div>
                              <p className="text-2xl font-bold">{smbStatus?.total_files ?? 0}</p>
                              <p className="text-sm text-muted-foreground">Open Files</p>
                            </div>
                          </div>
                        </div>

                        {/* SMB Connections Table */}
                        {smbStatus && smbStatus.connections.length > 0 ? (
                          <div>
                            <h4 className="text-sm font-medium mb-3">Client Sessions</h4>
                            <div className="border rounded-lg">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>User</TableHead>
                                    <TableHead>Machine</TableHead>
                                    <TableHead>IP Address</TableHead>
                                    <TableHead>Protocol</TableHead>
                                    <TableHead>Encryption</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {smbStatus.connections.map((conn, idx) => (
                                    <TableRow key={idx}>
                                      <TableCell className="font-medium">{conn.username}</TableCell>
                                      <TableCell>{conn.machine || conn.ip_address}</TableCell>
                                      <TableCell className="font-mono text-sm">{conn.ip_address}</TableCell>
                                      <TableCell>
                                        <Badge variant="outline">{conn.protocol || "SMB"}</Badge>
                                      </TableCell>
                                      <TableCell>
                                        {conn.encryption ? (
                                          <Badge variant="default" className="bg-green-600">Encrypted</Badge>
                                        ) : (
                                          <Badge variant="secondary">None</Badge>
                                        )}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-8 text-muted-foreground">
                            <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                            <p>No active SMB connections</p>
                            <p className="text-sm">Clients will appear here when they connect</p>
                          </div>
                        )}

                        {/* SMB Open Files */}
                        {smbStatus && smbStatus.open_files.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium mb-3">Open Files</h4>
                            <div className="border rounded-lg">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>File</TableHead>
                                    <TableHead>User</TableHead>
                                    <TableHead>Share</TableHead>
                                    <TableHead>Access</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {smbStatus.open_files.slice(0, 10).map((file, idx) => (
                                    <TableRow key={idx}>
                                      <TableCell className="font-mono text-sm max-w-xs truncate">
                                        {file.name}
                                      </TableCell>
                                      <TableCell>{file.username}</TableCell>
                                      <TableCell className="text-muted-foreground">{file.share_path}</TableCell>
                                      <TableCell>
                                        <Badge variant="outline">{file.access || "Read"}</Badge>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                              {smbStatus.open_files.length > 10 && (
                                <div className="p-2 text-center text-sm text-muted-foreground border-t">
                                  + {smbStatus.open_files.length - 10} more files
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </TabsContent>
                    )}

                    {/* NFS Tab */}
                    {services.nfs.running && (
                      <TabsContent value="nfs" className="space-y-6">
                        {/* NFS Summary */}
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                            <Users className="h-8 w-8 text-orange-500" />
                            <div>
                              <p className="text-2xl font-bold">{nfsStatus?.total_clients ?? 0}</p>
                              <p className="text-sm text-muted-foreground">Connected Clients</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                            <FolderOpen className="h-8 w-8 text-green-500" />
                            <div>
                              <p className="text-2xl font-bold">{nfsStatus?.total_exports ?? 0}</p>
                              <p className="text-sm text-muted-foreground">Active Exports</p>
                            </div>
                          </div>
                        </div>

                        {/* NFS Exports Table */}
                        {nfsStatus && nfsStatus.exports.length > 0 ? (
                          <div>
                            <h4 className="text-sm font-medium mb-3">Exports</h4>
                            <div className="border rounded-lg">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Path</TableHead>
                                    <TableHead>Allowed Clients</TableHead>
                                    <TableHead>Options</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {nfsStatus.exports.map((exp, idx) => (
                                    <TableRow key={idx}>
                                      <TableCell className="font-mono text-sm">{exp.path}</TableCell>
                                      <TableCell>
                                        <div className="flex flex-wrap gap-1">
                                          {exp.clients.map((client, cidx) => (
                                            <Badge key={cidx} variant="outline">{client}</Badge>
                                          ))}
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                                        {exp.options}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-8 text-muted-foreground">
                            <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
                            <p>No active NFS exports</p>
                            <p className="text-sm">Configure exports in /etc/exports</p>
                          </div>
                        )}

                        {/* NFS Clients Table */}
                        {nfsStatus && nfsStatus.clients.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium mb-3">Connected Clients</h4>
                            <div className="border rounded-lg">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Hostname</TableHead>
                                    <TableHead>IP Address</TableHead>
                                    <TableHead>Version</TableHead>
                                    <TableHead>Mounted Path</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {nfsStatus.clients.map((client, idx) => (
                                    <TableRow key={idx}>
                                      <TableCell className="font-medium">
                                        {client.hostname || client.ip_address}
                                      </TableCell>
                                      <TableCell className="font-mono text-sm">{client.ip_address}</TableCell>
                                      <TableCell className="text-sm">
                                        {client.nfs_version || "-"}
                                      </TableCell>
                                      <TableCell className="font-mono text-sm text-muted-foreground">
                                        {client.mounted_path || "-"}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        )}
                      </TabsContent>
                    )}
                  </Tabs>
                </CardContent>
              </Card>
            )}

            {/* Help Section */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Network className="h-5 w-5" />
                  About Sharing Protocols
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <h4 className="font-medium">SMB/CIFS (Samba)</h4>
                    <p className="text-sm text-muted-foreground">
                      SMB is the standard protocol for Windows file sharing. It works seamlessly with
                      Windows, macOS, and Linux clients. Use SMB for cross-platform environments or
                      when Windows clients need access.
                    </p>
                    <ul className="text-sm text-muted-foreground list-disc list-inside">
                      <li>Best for Windows environments</li>
                      <li>Built-in macOS support</li>
                      <li>User-based authentication</li>
                      <li>Port 445 (and 139 for legacy)</li>
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium">NFS (Network File System)</h4>
                    <p className="text-sm text-muted-foreground">
                      NFS is the native protocol for Unix/Linux file sharing. It offers excellent
                      performance for Linux-to-Linux transfers and is commonly used in data centers
                      and HPC environments.
                    </p>
                    <ul className="text-sm text-muted-foreground list-disc list-inside">
                      <li>Best for Linux/Unix environments</li>
                      <li>High performance</li>
                      <li>Host-based or Kerberos authentication</li>
                      <li>Port 2049 (and others for NFSv3)</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Firewall Notice */}
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertTitle>Firewall Configuration</AlertTitle>
              <AlertDescription>
                If you have a firewall enabled, ensure the appropriate ports are open:
                <ul className="mt-2 list-disc list-inside text-sm">
                  <li><strong>SMB:</strong> TCP ports 445 (and 139 for legacy support)</li>
                  <li><strong>NFS:</strong> TCP/UDP port 2049, plus ports 111, 20048 for NFSv3</li>
                </ul>
                On firewalld: <code className="bg-muted px-1 rounded">sudo firewall-cmd --add-service=samba --permanent</code>
              </AlertDescription>
            </Alert>
          </div>
        </main>
      </div>
    </div>
  );
}
