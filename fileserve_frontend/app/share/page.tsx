"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { publicShareAPI, PublicShareInfo, PublicFileInfo } from "@/lib/api";
import { toast } from "sonner";
import {
  Download,
  Eye,
  Folder,
  File,
  Lock,
  Clock,
  User,
  ArrowLeft,
  Upload,
  FileText,
  Film,
  Music,
  Archive,
  Code,
  XCircle,
  Image as ImageIcon,
} from "lucide-react";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getFileIcon(filename: string, isDir: boolean) {
  if (isDir) return <Folder className="h-5 w-5 text-blue-500" />;

  const ext = filename.split(".").pop()?.toLowerCase() || "";

  const imageExts = ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"];
  const videoExts = ["mp4", "webm", "mkv", "avi", "mov", "wmv"];
  const audioExts = ["mp3", "wav", "ogg", "flac", "aac", "m4a"];
  const archiveExts = ["zip", "tar", "gz", "rar", "7z", "bz2"];
  const codeExts = ["js", "ts", "jsx", "tsx", "py", "go", "java", "c", "cpp", "h", "rs", "rb"];
  const textExts = ["txt", "md", "json", "xml", "yaml", "yml", "csv", "log"];

  if (imageExts.includes(ext)) return <ImageIcon className="h-5 w-5 text-green-500" />;
  if (videoExts.includes(ext)) return <Film className="h-5 w-5 text-purple-500" />;
  if (audioExts.includes(ext)) return <Music className="h-5 w-5 text-pink-500" />;
  if (archiveExts.includes(ext)) return <Archive className="h-5 w-5 text-yellow-500" />;
  if (codeExts.includes(ext)) return <Code className="h-5 w-5 text-cyan-500" />;
  if (textExts.includes(ext)) return <FileText className="h-5 w-5 text-gray-500" />;

  return <File className="h-5 w-5 text-gray-500" />;
}

function ShareContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [shareInfo, setShareInfo] = useState<PublicShareInfo | null>(null);
  const [files, setFiles] = useState<PublicFileInfo[]>([]);
  const [currentPath, setCurrentPath] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Password state
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [passwordVerified, setPasswordVerified] = useState(false);

  // Upload state
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (token) {
      loadShareInfo();
    } else {
      setError("No share token provided");
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const loadShareInfo = async () => {
    if (!token) return;

    try {
      const info = await publicShareAPI.getInfo(token);
      setShareInfo(info);

      if (info.requires_password) {
        setNeedsPassword(true);
      } else {
        setPasswordVerified(true);
        if (info.target_type === "folder" && info.allow_listing) {
          loadFiles("");
        }
      }
    } catch {
      setError("Share not found or expired");
    } finally {
      setIsLoading(false);
    }
  };

  const loadFiles = async (path: string) => {
    if (!shareInfo?.allow_listing || !token) return;

    try {
      const fileList = await publicShareAPI.list(token, path);
      setFiles(fileList || []);
      setCurrentPath(path);
    } catch {
      toast.error("Failed to load files");
    }
  };

  const handleVerifyPassword = async () => {
    if (!token) return;

    setIsVerifying(true);
    try {
      const result = await publicShareAPI.verifyPassword(token, password);
      if (result.valid) {
        setPasswordVerified(true);
        setNeedsPassword(false);
        if (shareInfo?.target_type === "folder" && shareInfo.allow_listing) {
          loadFiles("");
        }
      } else {
        toast.error("Incorrect password");
      }
    } catch {
      toast.error("Failed to verify password");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDownload = (path?: string) => {
    if (!token) return;
    window.location.href = publicShareAPI.getDownloadUrl(token, path);
  };

  const handlePreview = (path?: string) => {
    if (!token) return;
    window.open(publicShareAPI.getPreviewUrl(token, path), "_blank");
  };

  const handleNavigate = (file: PublicFileInfo) => {
    if (file.is_dir) {
      loadFiles(file.path);
    }
  };

  const handleGoBack = () => {
    if (!currentPath) return;
    const parts = currentPath.split("/");
    parts.pop();
    loadFiles(parts.join("/"));
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!token) return;
    const uploadFiles = e.target.files;
    if (!uploadFiles || uploadFiles.length === 0) return;

    setIsUploading(true);
    try {
      for (const file of Array.from(uploadFiles)) {
        await publicShareAPI.upload(token, file, currentPath);
        toast.success(`Uploaded ${file.name}`);
      }
      loadFiles(currentPath);
    } catch {
      toast.error("Failed to upload file");
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
              <XCircle className="h-6 w-6 text-red-600" />
            </div>
            <CardTitle>Share Not Available</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (needsPassword && !passwordVerified) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-yellow-100 dark:bg-yellow-900/20 flex items-center justify-center">
              <Lock className="h-6 w-6 text-yellow-600" />
            </div>
            <CardTitle>Password Protected</CardTitle>
            <CardDescription>
              This share requires a password to access
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleVerifyPassword();
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={isVerifying || !password}>
                {isVerifying ? "Verifying..." : "Access Share"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header Card */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  {shareInfo?.target_type === "folder" ? (
                    <Folder className="h-6 w-6 text-primary" />
                  ) : (
                    <File className="h-6 w-6 text-primary" />
                  )}
                </div>
                <div>
                  <CardTitle className="text-xl">{shareInfo?.name}</CardTitle>
                  {shareInfo?.description && (
                    <CardDescription>{shareInfo.description}</CardDescription>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {shareInfo?.allow_download && (
                  <Button onClick={() => handleDownload()}>
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                )}
                {shareInfo?.allow_preview && shareInfo.target_type === "file" && (
                  <Button variant="outline" onClick={() => handlePreview()}>
                    <Eye className="h-4 w-4 mr-2" />
                    Preview
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              {shareInfo?.show_owner && shareInfo.owner_name && (
                <div className="flex items-center gap-1">
                  <User className="h-4 w-4" />
                  Shared by {shareInfo.owner_name}
                </div>
              )}
              {shareInfo?.expires_at && (
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  Expires {formatDate(shareInfo.expires_at)}
                </div>
              )}
              {shareInfo?.size && (
                <div className="flex items-center gap-1">
                  <File className="h-4 w-4" />
                  {formatBytes(shareInfo.size)}
                </div>
              )}
            </div>
            {shareInfo?.custom_message && (
              <div className="mt-4 p-4 rounded-lg bg-muted">
                <p className="text-sm">{shareInfo.custom_message}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* File Listing for Folders */}
        {shareInfo?.target_type === "folder" && shareInfo.allow_listing && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {currentPath && (
                    <Button variant="ghost" size="sm" onClick={handleGoBack}>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back
                    </Button>
                  )}
                  <span className="text-muted-foreground">
                    {currentPath ? `/${currentPath}` : "Root"}
                  </span>
                </div>
                {shareInfo.allow_upload && (
                  <div>
                    <input
                      type="file"
                      id="upload"
                      multiple
                      className="hidden"
                      onChange={handleUpload}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => document.getElementById("upload")?.click()}
                      disabled={isUploading}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {isUploading ? "Uploading..." : "Upload"}
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {files.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Folder className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>This folder is empty</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Modified</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {files.map((file) => (
                      <TableRow
                        key={file.path}
                        className={file.is_dir ? "cursor-pointer hover:bg-muted" : ""}
                        onClick={() => file.is_dir && handleNavigate(file)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getFileIcon(file.name, file.is_dir)}
                            <span>{file.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {file.is_dir ? "-" : formatBytes(file.size)}
                        </TableCell>
                        <TableCell>{formatDate(file.mod_time)}</TableCell>
                        <TableCell className="text-right">
                          {!file.is_dir && (
                            <div className="flex items-center justify-end gap-2">
                              {shareInfo.allow_preview && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePreview(file.path);
                                  }}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              )}
                              {shareInfo.allow_download && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownload(file.path);
                                  }}
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <div className="text-center text-sm text-muted-foreground">
          Shared via FileServ
        </div>
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  );
}

export default function PublicSharePage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ShareContent />
    </Suspense>
  );
}
