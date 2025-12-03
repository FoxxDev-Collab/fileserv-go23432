"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { shareLinksAPI, ShareLink, CreateShareLinkRequest } from "@/lib/api";
import { toast } from "sonner";
import {
  Link2,
  Copy,
  Check,
  Lock,
  Clock,
  Download,
  Eye,
  Upload,
  FolderOpen,
  Shield,
  Zap,
} from "lucide-react";

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetPath: string;
  targetName: string;
  isFolder: boolean;
  onShareCreated?: (link: ShareLink) => void;
}

export function ShareDialog({
  open,
  onOpenChange,
  targetPath,
  targetName,
  isFolder,
  onShareCreated,
}: ShareDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [createdLink, setCreatedLink] = useState<ShareLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareMode, setShareMode] = useState<"quick" | "custom">("quick");

  // Quick share options
  const [quickExpiry, setQuickExpiry] = useState("7d");

  // Custom share options
  const [customOptions, setCustomOptions] = useState({
    name: "",
    description: "",
    password: "",
    expiresIn: 168, // hours (7 days default)
    noExpiry: false,
    maxDownloads: 0,
    maxViews: 0,
    allowDownload: true,
    allowPreview: true,
    allowUpload: false,
    allowListing: true,
    showOwner: false,
    customMessage: "",
  });

  const resetForm = () => {
    setCreatedLink(null);
    setCopied(false);
    setShareMode("quick");
    setQuickExpiry("7d");
    setCustomOptions({
      name: "",
      description: "",
      password: "",
      expiresIn: 168,
      noExpiry: false,
      maxDownloads: 0,
      maxViews: 0,
      allowDownload: true,
      allowPreview: true,
      allowUpload: false,
      allowListing: true,
      showOwner: false,
      customMessage: "",
    });
  };

  const handleQuickShare = async () => {
    setIsLoading(true);
    try {
      let expiresIn: number;
      switch (quickExpiry) {
        case "1h":
          expiresIn = 1;
          break;
        case "24h":
          expiresIn = 24;
          break;
        case "7d":
          expiresIn = 168;
          break;
        case "30d":
          expiresIn = 720;
          break;
        case "never":
          expiresIn = -1;
          break;
        default:
          expiresIn = 168;
      }

      const request: CreateShareLinkRequest = {
        target_path: targetPath,
        expires_in: expiresIn,
        allow_download: true,
        allow_preview: true,
        allow_listing: isFolder,
      };

      const link = await shareLinksAPI.create(request);
      setCreatedLink(link);
      onShareCreated?.(link);
      toast.success("Share link created!");
    } catch (error) {
      toast.error(`Failed to create share link: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCustomShare = async () => {
    setIsLoading(true);
    try {
      const request: CreateShareLinkRequest = {
        target_path: targetPath,
        name: customOptions.name || undefined,
        description: customOptions.description || undefined,
        password: customOptions.password || undefined,
        expires_in: customOptions.noExpiry ? -1 : customOptions.expiresIn,
        max_downloads: customOptions.maxDownloads || undefined,
        max_views: customOptions.maxViews || undefined,
        allow_download: customOptions.allowDownload,
        allow_preview: customOptions.allowPreview,
        allow_upload: customOptions.allowUpload,
        allow_listing: customOptions.allowListing,
        show_owner: customOptions.showOwner,
        custom_message: customOptions.customMessage || undefined,
      };

      const link = await shareLinksAPI.create(request);
      setCreatedLink(link);
      onShareCreated?.(link);
      toast.success("Share link created!");
    } catch (error) {
      toast.error(`Failed to create share link: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (!createdLink) return;
    const url = shareLinksAPI.getShareUrl(createdLink);
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Link copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Share {isFolder ? "Folder" : "File"}
          </DialogTitle>
          <DialogDescription>
            Create a shareable link for &quot;{targetName}&quot;
          </DialogDescription>
        </DialogHeader>

        {createdLink ? (
          // Success state - show created link
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-center">
              <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                <Check className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <div className="text-center">
              <h3 className="font-medium">Link Created!</h3>
              <p className="text-sm text-muted-foreground">
                Anyone with this link can access the {isFolder ? "folder" : "file"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={shareLinksAPI.getShareUrl(createdLink)}
                readOnly
                className="font-mono text-sm"
              />
              <Button variant="outline" size="icon" onClick={handleCopyLink}>
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            {createdLink.expires_at && (
              <p className="text-sm text-muted-foreground text-center">
                <Clock className="h-3 w-3 inline mr-1" />
                Expires {new Date(createdLink.expires_at).toLocaleDateString()}
              </p>
            )}
            {createdLink.password_hash && (
              <p className="text-sm text-muted-foreground text-center">
                <Lock className="h-3 w-3 inline mr-1" />
                Password protected
              </p>
            )}
          </div>
        ) : (
          // Form state
          <Tabs value={shareMode} onValueChange={(v) => setShareMode(v as "quick" | "custom")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="quick" className="flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Quick Share
              </TabsTrigger>
              <TabsTrigger value="custom" className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Custom
              </TabsTrigger>
            </TabsList>

            <TabsContent value="quick" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Link Expiration</Label>
                <Select value={quickExpiry} onValueChange={setQuickExpiry}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1h">1 hour</SelectItem>
                    <SelectItem value="24h">24 hours</SelectItem>
                    <SelectItem value="7d">7 days</SelectItem>
                    <SelectItem value="30d">30 days</SelectItem>
                    <SelectItem value="never">Never</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-lg border p-3 bg-muted/50">
                <p className="text-sm text-muted-foreground">
                  Quick share creates a link with default settings: downloads and preview enabled,
                  no password protection.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="custom" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="name">Link Name (optional)</Label>
                <Input
                  id="name"
                  placeholder="My shared file"
                  value={customOptions.name}
                  onChange={(e) =>
                    setCustomOptions({ ...customOptions, name: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password (optional)</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Leave empty for no password"
                  value={customOptions.password}
                  onChange={(e) =>
                    setCustomOptions({ ...customOptions, password: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Expiration</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Never expires</span>
                    <Switch
                      checked={customOptions.noExpiry}
                      onCheckedChange={(checked) =>
                        setCustomOptions({ ...customOptions, noExpiry: checked })
                      }
                    />
                  </div>
                </div>
                {!customOptions.noExpiry && (
                  <Select
                    value={customOptions.expiresIn.toString()}
                    onValueChange={(v) =>
                      setCustomOptions({ ...customOptions, expiresIn: parseInt(v) })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 hour</SelectItem>
                      <SelectItem value="24">24 hours</SelectItem>
                      <SelectItem value="168">7 days</SelectItem>
                      <SelectItem value="720">30 days</SelectItem>
                      <SelectItem value="2160">90 days</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Max Downloads</Label>
                  <Input
                    type="number"
                    placeholder="0 = unlimited"
                    value={customOptions.maxDownloads || ""}
                    onChange={(e) =>
                      setCustomOptions({
                        ...customOptions,
                        maxDownloads: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max Views</Label>
                  <Input
                    type="number"
                    placeholder="0 = unlimited"
                    value={customOptions.maxViews || ""}
                    onChange={(e) =>
                      setCustomOptions({
                        ...customOptions,
                        maxViews: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>

              <div className="space-y-3">
                <Label>Permissions</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex items-center gap-2">
                      <Download className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Download</span>
                    </div>
                    <Switch
                      checked={customOptions.allowDownload}
                      onCheckedChange={(checked) =>
                        setCustomOptions({ ...customOptions, allowDownload: checked })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex items-center gap-2">
                      <Eye className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Preview</span>
                    </div>
                    <Switch
                      checked={customOptions.allowPreview}
                      onCheckedChange={(checked) =>
                        setCustomOptions({ ...customOptions, allowPreview: checked })
                      }
                    />
                  </div>
                  {isFolder && (
                    <>
                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div className="flex items-center gap-2">
                          <FolderOpen className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">List Files</span>
                        </div>
                        <Switch
                          checked={customOptions.allowListing}
                          onCheckedChange={(checked) =>
                            setCustomOptions({ ...customOptions, allowListing: checked })
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div className="flex items-center gap-2">
                          <Upload className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">Upload</span>
                        </div>
                        <Switch
                          checked={customOptions.allowUpload}
                          onCheckedChange={(checked) =>
                            setCustomOptions({ ...customOptions, allowUpload: checked })
                          }
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="message">Custom Message (optional)</Label>
                <Textarea
                  id="message"
                  placeholder="Add a message for recipients..."
                  value={customOptions.customMessage}
                  onChange={(e) =>
                    setCustomOptions({ ...customOptions, customMessage: e.target.value })
                  }
                />
              </div>
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter>
          {createdLink ? (
            <>
              <Button variant="outline" onClick={resetForm}>
                Create Another
              </Button>
              <Button onClick={handleClose}>Done</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={shareMode === "quick" ? handleQuickShare : handleCustomShare}
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Creating...
                  </span>
                ) : (
                  <>
                    <Link2 className="h-4 w-4 mr-2" />
                    Create Link
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
