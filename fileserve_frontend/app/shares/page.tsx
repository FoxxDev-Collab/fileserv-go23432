"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import { shareLinksAPI, ShareLink } from "@/lib/api";
import { toast } from "sonner";
import {
  Link2,
  RefreshCw,
  Copy,
  Check,
  MoreHorizontal,
  Pencil,
  Trash2,
  Eye,
  Download,
  Clock,
  Lock,
  Folder,
  File,
  ExternalLink,
  AlertTriangle,
  XCircle,
  Power,
} from "lucide-react";

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = date.getTime() - now.getTime();

  if (diff < 0) return "Expired";

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d left`;
  if (hours > 0) return `${hours}h left`;
  return "< 1h left";
}

export default function MySharesPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Dialog states
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedLink, setSelectedLink] = useState<ShareLink | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/");
    }
  }, [authLoading, isAuthenticated, router]);

  const fetchLinks = async () => {
    try {
      const data = await shareLinksAPI.list();
      setLinks(data || []);
    } catch (error) {
      toast.error(`Failed to load share links: ${error}`);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchLinks();
    }
  }, [isAuthenticated]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchLinks();
  };

  const handleCopyLink = (link: ShareLink) => {
    const url = shareLinksAPI.getShareUrl(link);
    navigator.clipboard.writeText(url);
    setCopiedId(link.id);
    toast.success("Link copied to clipboard!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleToggleEnabled = async (link: ShareLink) => {
    try {
      await shareLinksAPI.update(link.id, { enabled: !link.enabled });
      toast.success(link.enabled ? "Share link disabled" : "Share link enabled");
      fetchLinks();
    } catch (error) {
      toast.error(`Failed to update link: ${error}`);
    }
  };

  const handleDelete = async () => {
    if (!selectedLink) return;

    try {
      await shareLinksAPI.delete(selectedLink.id);
      toast.success("Share link deleted");
      setDeleteDialogOpen(false);
      setSelectedLink(null);
      fetchLinks();
    } catch (error) {
      toast.error(`Failed to delete link: ${error}`);
    }
  };

  const getStatusBadge = (link: ShareLink) => {
    if (!link.enabled) {
      return <Badge variant="secondary"><XCircle className="h-3 w-3 mr-1" />Disabled</Badge>;
    }

    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return <Badge variant="destructive"><Clock className="h-3 w-3 mr-1" />Expired</Badge>;
    }

    if (link.max_downloads > 0 && link.download_count >= link.max_downloads) {
      return <Badge variant="outline"><Download className="h-3 w-3 mr-1" />Limit Reached</Badge>;
    }

    if (link.max_views > 0 && link.view_count >= link.max_views) {
      return <Badge variant="outline"><Eye className="h-3 w-3 mr-1" />Limit Reached</Badge>;
    }

    return <Badge variant="default" className="bg-green-600"><Check className="h-3 w-3 mr-1" />Active</Badge>;
  };

  const activeLinks = links.filter(l => l.enabled && (!l.expires_at || new Date(l.expires_at) > new Date()));
  const expiredLinks = links.filter(l => !l.enabled || (l.expires_at && new Date(l.expires_at) <= new Date()));

  if (authLoading || isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

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
                <h1 className="text-2xl font-bold">My Shares</h1>
                <p className="text-muted-foreground">
                  Manage your shared files and folders
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            </div>

            {/* Overview Cards */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Links</CardTitle>
                  <Link2 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{links.length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Links</CardTitle>
                  <Check className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{activeLinks.length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Views</CardTitle>
                  <Eye className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {links.reduce((acc, l) => acc + l.view_count, 0)}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Downloads</CardTitle>
                  <Download className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {links.reduce((acc, l) => acc + l.download_count, 0)}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Share Links Table */}
            <Card>
              <CardHeader>
                <CardTitle>Share Links</CardTitle>
                <CardDescription>
                  All your shared files and folders
                </CardDescription>
              </CardHeader>
              <CardContent>
                {links.length === 0 ? (
                  <div className="text-center py-8">
                    <Link2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium">No Share Links</h3>
                    <p className="text-muted-foreground mb-4">
                      Share files from the Files page to create links
                    </p>
                    <Button onClick={() => router.push("/files")}>
                      Go to Files
                    </Button>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Views</TableHead>
                        <TableHead>Downloads</TableHead>
                        <TableHead>Expires</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {links.map((link) => (
                        <TableRow key={link.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {link.target_type === "folder" ? (
                                <Folder className="h-4 w-4 text-blue-500" />
                              ) : (
                                <File className="h-4 w-4 text-gray-500" />
                              )}
                              <div>
                                <div className="font-medium">{link.name || link.target_name}</div>
                                <div className="text-sm text-muted-foreground truncate max-w-[200px]">
                                  {link.target_path}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {link.password_hash && (
                                <span title="Password protected">
                                  <Lock className="h-4 w-4 text-yellow-500" />
                                </span>
                              )}
                              <span className="capitalize">{link.target_type}</span>
                            </div>
                          </TableCell>
                          <TableCell>{getStatusBadge(link)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Eye className="h-3 w-3 text-muted-foreground" />
                              {link.view_count}
                              {link.max_views > 0 && (
                                <span className="text-muted-foreground">/ {link.max_views}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Download className="h-3 w-3 text-muted-foreground" />
                              {link.download_count}
                              {link.max_downloads > 0 && (
                                <span className="text-muted-foreground">/ {link.max_downloads}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {link.expires_at ? (
                              <div className="text-sm">
                                <div>{formatRelativeTime(link.expires_at)}</div>
                                <div className="text-muted-foreground text-xs">
                                  {formatDate(link.expires_at)}
                                </div>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">Never</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleCopyLink(link)}
                              >
                                {copiedId === link.id ? (
                                  <Check className="h-4 w-4 text-green-500" />
                                ) : (
                                  <Copy className="h-4 w-4" />
                                )}
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => window.open(shareLinksAPI.getShareUrl(link), "_blank")}
                                  >
                                    <ExternalLink className="h-4 w-4 mr-2" />
                                    Open Link
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleCopyLink(link)}>
                                    <Copy className="h-4 w-4 mr-2" />
                                    Copy Link
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => handleToggleEnabled(link)}>
                                    <Power className="h-4 w-4 mr-2" />
                                    {link.enabled ? "Disable" : "Enable"}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-red-600"
                                    onClick={() => {
                                      setSelectedLink(link);
                                      setDeleteDialogOpen(true);
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Delete Share Link
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this share link? Anyone with the link will no longer
              be able to access the shared content.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
