"use client";

import { useState, useMemo } from "react";
import {
  File,
  Folder,
  MoreVertical,
  Download,
  Trash2,
  Edit,
  Link2,
  ChevronUp,
  ChevronDown,
  FileText,
  FileCode,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileSpreadsheet,
  Presentation,
  FileType,
  Settings2,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface FileItem {
  id: string;
  name: string;
  type: "file" | "folder";
  size?: number;
  modifiedAt: string;
  path: string;
  owner?: string;
  group?: string;
  mode?: string;
  mimeType?: string;
  extension?: string;
}

type SortField = "name" | "size" | "modifiedAt" | "owner" | "type";
type SortDirection = "asc" | "desc";

interface FileListProps {
  files: FileItem[];
  onNavigate?: (path: string) => void;
  onDownload?: (file: FileItem) => void;
  onDelete?: (file: FileItem) => void;
  onRename?: (file: FileItem) => void;
  onShare?: (file: FileItem) => void;
  onSelectionChange?: (selectedFiles: FileItem[]) => void;
  showSelection?: boolean;
}

// Column visibility configuration
interface ColumnConfig {
  id: string;
  label: string;
  visible: boolean;
  alwaysVisible?: boolean;
}

const defaultColumns: ColumnConfig[] = [
  { id: "select", label: "Select", visible: false },
  { id: "icon", label: "Icon", visible: true, alwaysVisible: true },
  { id: "name", label: "Name", visible: true, alwaysVisible: true },
  { id: "type", label: "Type", visible: true },
  { id: "size", label: "Size", visible: true },
  { id: "owner", label: "Owner", visible: true },
  { id: "group", label: "Group", visible: false },
  { id: "permissions", label: "Permissions", visible: true },
  { id: "modified", label: "Modified", visible: true },
  { id: "actions", label: "Actions", visible: true, alwaysVisible: true },
];

// Get file icon based on MIME type or extension
function getFileIcon(file: FileItem) {
  if (file.type === "folder") {
    return <Folder className="h-5 w-5 text-blue-500" />;
  }

  const mime = file.mimeType || "";
  const ext = file.extension?.toLowerCase() || "";

  // Image files
  if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "svg", "webp", "ico", "bmp"].includes(ext)) {
    return <FileImage className="h-5 w-5 text-green-500" />;
  }

  // Video files
  if (mime.startsWith("video/") || ["mp4", "webm", "avi", "mkv", "mov", "wmv", "flv"].includes(ext)) {
    return <FileVideo className="h-5 w-5 text-purple-500" />;
  }

  // Audio files
  if (mime.startsWith("audio/") || ["mp3", "wav", "ogg", "flac", "aac", "m4a"].includes(ext)) {
    return <FileAudio className="h-5 w-5 text-pink-500" />;
  }

  // Archive files
  if (["zip", "tar", "gz", "rar", "7z", "bz2", "xz"].includes(ext) ||
      mime.includes("zip") || mime.includes("compressed") || mime.includes("archive")) {
    return <FileArchive className="h-5 w-5 text-yellow-600" />;
  }

  // Spreadsheet files
  if (["xls", "xlsx", "csv", "ods"].includes(ext) || mime.includes("spreadsheet") || mime.includes("excel")) {
    return <FileSpreadsheet className="h-5 w-5 text-green-600" />;
  }

  // Presentation files
  if (["ppt", "pptx", "odp"].includes(ext) || mime.includes("presentation") || mime.includes("powerpoint")) {
    return <Presentation className="h-5 w-5 text-orange-500" />;
  }

  // Document files
  if (["doc", "docx", "odt", "rtf"].includes(ext) || mime.includes("document") || mime.includes("msword")) {
    return <FileText className="h-5 w-5 text-blue-600" />;
  }

  // PDF
  if (ext === "pdf" || mime === "application/pdf") {
    return <FileType className="h-5 w-5 text-red-500" />;
  }

  // Code/text files
  if (mime.startsWith("text/") ||
      ["js", "ts", "tsx", "jsx", "json", "html", "css", "py", "go", "rs", "java", "c", "cpp", "h", "sh", "bash", "yml", "yaml", "xml", "md", "sql", "php", "rb", "swift", "kt"].includes(ext)) {
    return <FileCode className="h-5 w-5 text-cyan-500" />;
  }

  // Plain text
  if (["txt", "log", "conf", "cfg", "ini", "env"].includes(ext)) {
    return <FileText className="h-5 w-5 text-gray-500" />;
  }

  // Default file icon
  return <File className="h-5 w-5 text-muted-foreground" />;
}

// Get human-readable file type
function getFileType(file: FileItem): string {
  if (file.type === "folder") return "Folder";

  const ext = file.extension?.toLowerCase() || "";
  const mime = file.mimeType || "";

  // Map extensions to friendly names
  const typeMap: Record<string, string> = {
    // Documents
    pdf: "PDF Document",
    doc: "Word Document",
    docx: "Word Document",
    txt: "Text File",
    rtf: "Rich Text",
    odt: "OpenDocument Text",
    // Spreadsheets
    xls: "Excel Spreadsheet",
    xlsx: "Excel Spreadsheet",
    csv: "CSV File",
    ods: "OpenDocument Spreadsheet",
    // Presentations
    ppt: "PowerPoint",
    pptx: "PowerPoint",
    odp: "OpenDocument Presentation",
    // Images
    jpg: "JPEG Image",
    jpeg: "JPEG Image",
    png: "PNG Image",
    gif: "GIF Image",
    svg: "SVG Image",
    webp: "WebP Image",
    ico: "Icon",
    bmp: "Bitmap Image",
    // Video
    mp4: "MP4 Video",
    webm: "WebM Video",
    avi: "AVI Video",
    mkv: "MKV Video",
    mov: "QuickTime Video",
    // Audio
    mp3: "MP3 Audio",
    wav: "WAV Audio",
    ogg: "OGG Audio",
    flac: "FLAC Audio",
    m4a: "M4A Audio",
    // Archives
    zip: "ZIP Archive",
    tar: "TAR Archive",
    gz: "GZip Archive",
    rar: "RAR Archive",
    "7z": "7-Zip Archive",
    // Code
    js: "JavaScript",
    ts: "TypeScript",
    tsx: "TypeScript React",
    jsx: "JavaScript React",
    json: "JSON",
    html: "HTML",
    css: "CSS",
    py: "Python",
    go: "Go",
    rs: "Rust",
    java: "Java",
    c: "C Source",
    cpp: "C++ Source",
    h: "Header File",
    sh: "Shell Script",
    sql: "SQL",
    md: "Markdown",
    yml: "YAML",
    yaml: "YAML",
    xml: "XML",
    // Config
    log: "Log File",
    conf: "Config File",
    cfg: "Config File",
    ini: "INI File",
    env: "Environment File",
  };

  if (typeMap[ext]) return typeMap[ext];
  if (ext) return ext.toUpperCase() + " File";
  if (mime) return mime.split("/")[1]?.toUpperCase() || "File";
  return "File";
}

// Parse Unix permission string to readable format
function parsePermissions(mode?: string): { readable: string; symbolic: string } {
  if (!mode) return { readable: "Unknown", symbolic: "?" };

  // mode is like "-rwxr-xr-x" or "drwxr-xr-x"
  const symbolic = mode.length >= 10 ? mode.slice(1, 10) : mode;

  // Convert to more readable format
  const parts = [];
  if (symbolic.length >= 9) {
    const owner = symbolic.slice(0, 3);
    const group = symbolic.slice(3, 6);
    const other = symbolic.slice(6, 9);

    const formatPart = (p: string) => {
      let result = "";
      if (p[0] === "r") result += "R";
      if (p[1] === "w") result += "W";
      if (p[2] === "x" || p[2] === "s" || p[2] === "t") result += "X";
      return result || "-";
    };

    parts.push(`Owner: ${formatPart(owner)}`);
    parts.push(`Group: ${formatPart(group)}`);
    parts.push(`Other: ${formatPart(other)}`);
  }

  return {
    readable: parts.join(", ") || mode,
    symbolic: symbolic,
  };
}

// Get permission badge color
function getPermissionColor(mode?: string): string {
  if (!mode) return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";

  // Check if world-writable (security concern)
  if (mode.length >= 10 && mode[8] === "w") {
    return "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300";
  }

  // Check if executable
  if (mode.includes("x")) {
    return "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300";
  }

  return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
}

export function FileList({
  files,
  onNavigate,
  onDownload,
  onDelete,
  onRename,
  onShare,
  onSelectionChange,
  showSelection = false,
}: FileListProps) {
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [columns, setColumns] = useState<ColumnConfig[]>(
    defaultColumns.map((col) => ({
      ...col,
      visible: col.id === "select" ? showSelection : col.visible,
    }))
  );

  const formatFileSize = (bytes?: number) => {
    if (bytes === undefined || bytes === null) return "-";
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return `Today, ${date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    } else if (diffDays === 1) {
      return `Yesterday, ${date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    } else if (diffDays < 7) {
      return date.toLocaleDateString("en-US", {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } else {
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const sortedFiles = useMemo(() => {
    const sorted = [...files].sort((a, b) => {
      // Always sort folders first
      if (a.type === "folder" && b.type !== "folder") return -1;
      if (a.type !== "folder" && b.type === "folder") return 1;

      let comparison = 0;
      switch (sortField) {
        case "name":
          comparison = a.name.localeCompare(b.name, undefined, { numeric: true });
          break;
        case "size":
          comparison = (a.size || 0) - (b.size || 0);
          break;
        case "modifiedAt":
          comparison = new Date(a.modifiedAt).getTime() - new Date(b.modifiedAt).getTime();
          break;
        case "owner":
          comparison = (a.owner || "").localeCompare(b.owner || "");
          break;
        case "type":
          comparison = getFileType(a).localeCompare(getFileType(b));
          break;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });

    return sorted;
  }, [files, sortField, sortDirection]);

  const handleFileClick = (file: FileItem) => {
    if (file.type === "folder" && onNavigate) {
      onNavigate(file.path);
    }
  };

  const handleSelectFile = (fileId: string, checked: boolean) => {
    const newSelected = new Set(selectedFiles);
    if (checked) {
      newSelected.add(fileId);
    } else {
      newSelected.delete(fileId);
    }
    setSelectedFiles(newSelected);
    if (onSelectionChange) {
      onSelectionChange(files.filter((f) => newSelected.has(f.id)));
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedFiles(new Set(files.map((f) => f.id)));
      if (onSelectionChange) {
        onSelectionChange(files);
      }
    } else {
      setSelectedFiles(new Set());
      if (onSelectionChange) {
        onSelectionChange([]);
      }
    }
  };

  const toggleColumn = (columnId: string) => {
    setColumns((cols) =>
      cols.map((col) =>
        col.id === columnId && !col.alwaysVisible
          ? { ...col, visible: !col.visible }
          : col
      )
    );
  };

  const isColumnVisible = (columnId: string) =>
    columns.find((c) => c.id === columnId)?.visible ?? false;

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === "asc" ? (
      <ChevronUp className="h-4 w-4 ml-1" />
    ) : (
      <ChevronDown className="h-4 w-4 ml-1" />
    );
  };

  const SortableHeader = ({
    field,
    children,
    className,
  }: {
    field: SortField;
    children: React.ReactNode;
    className?: string;
  }) => (
    <TableHead className={className}>
      <button
        className="flex items-center hover:text-foreground transition-colors font-medium"
        onClick={() => handleSort(field)}
      >
        {children}
        <SortIcon field={field} />
      </button>
    </TableHead>
  );

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border rounded-lg bg-muted/20">
        <Folder className="h-16 w-16 mb-4 opacity-50" />
        <p className="text-lg font-medium">No files or folders</p>
        <p className="text-sm">Upload files to get started</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-2">
        {/* Column visibility toggle */}
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                <Settings2 className="h-4 w-4 mr-2" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {columns
                .filter((col) => !col.alwaysVisible && col.id !== "select")
                .map((col) => (
                  <DropdownMenuCheckboxItem
                    key={col.id}
                    checked={col.visible}
                    onCheckedChange={() => toggleColumn(col.id)}
                  >
                    {col.visible ? (
                      <Eye className="h-4 w-4 mr-2" />
                    ) : (
                      <EyeOff className="h-4 w-4 mr-2" />
                    )}
                    {col.label}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* File table */}
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                {isColumnVisible("select") && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        selectedFiles.size === files.length && files.length > 0
                      }
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                )}
                <TableHead className="w-10"></TableHead>
                <SortableHeader field="name" className="min-w-[200px]">
                  Name
                </SortableHeader>
                {isColumnVisible("type") && (
                  <SortableHeader field="type" className="w-32">
                    Type
                  </SortableHeader>
                )}
                {isColumnVisible("size") && (
                  <SortableHeader field="size" className="w-24 text-right">
                    Size
                  </SortableHeader>
                )}
                {isColumnVisible("owner") && (
                  <SortableHeader field="owner" className="w-28">
                    Owner
                  </SortableHeader>
                )}
                {isColumnVisible("group") && (
                  <TableHead className="w-28">Group</TableHead>
                )}
                {isColumnVisible("permissions") && (
                  <TableHead className="w-28">Permissions</TableHead>
                )}
                {isColumnVisible("modified") && (
                  <SortableHeader field="modifiedAt" className="w-44">
                    Modified
                  </SortableHeader>
                )}
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedFiles.map((file) => {
                const permissions = parsePermissions(file.mode);
                return (
                  <TableRow
                    key={file.id}
                    className={cn(
                      "group",
                      file.type === "folder" && "cursor-pointer hover:bg-muted/50",
                      selectedFiles.has(file.id) && "bg-primary/5"
                    )}
                    onClick={() => file.type === "folder" && handleFileClick(file)}
                  >
                    {isColumnVisible("select") && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedFiles.has(file.id)}
                          onCheckedChange={(checked) =>
                            handleSelectFile(file.id, checked as boolean)
                          }
                        />
                      </TableCell>
                    )}
                    <TableCell className="text-center">
                      {getFileIcon(file)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium truncate max-w-[300px]">
                          {file.name}
                        </span>
                        <span className="text-xs text-muted-foreground truncate max-w-[300px]">
                          {file.path}
                        </span>
                      </div>
                    </TableCell>
                    {isColumnVisible("type") && (
                      <TableCell className="text-muted-foreground text-sm">
                        {getFileType(file)}
                      </TableCell>
                    )}
                    {isColumnVisible("size") && (
                      <TableCell className="text-right text-muted-foreground tabular-nums">
                        {file.type === "folder" ? "-" : formatFileSize(file.size)}
                      </TableCell>
                    )}
                    {isColumnVisible("owner") && (
                      <TableCell>
                        <span className="text-sm">{file.owner || "-"}</span>
                      </TableCell>
                    )}
                    {isColumnVisible("group") && (
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {file.group || "-"}
                        </span>
                      </TableCell>
                    )}
                    {isColumnVisible("permissions") && (
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge
                              variant="secondary"
                              className={cn(
                                "font-mono text-xs cursor-help",
                                getPermissionColor(file.mode)
                              )}
                            >
                              {permissions.symbolic}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <p className="font-medium mb-1">Permissions</p>
                            <p className="text-xs">{permissions.readable}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                    )}
                    {isColumnVisible("modified") && (
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDate(file.modifiedAt)}
                      </TableCell>
                    )}
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          asChild
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {file.type === "file" && onDownload && (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                onDownload(file);
                              }}
                            >
                              <Download className="mr-2 h-4 w-4" />
                              Download
                            </DropdownMenuItem>
                          )}
                          {onShare && (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                onShare(file);
                              }}
                            >
                              <Link2 className="mr-2 h-4 w-4" />
                              Share
                            </DropdownMenuItem>
                          )}
                          {onRename && (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                onRename(file);
                              }}
                            >
                              <Edit className="mr-2 h-4 w-4" />
                              Rename
                            </DropdownMenuItem>
                          )}
                          {onDelete && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDelete(file);
                                }}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* File count footer */}
        <div className="flex items-center justify-between text-sm text-muted-foreground px-2">
          <span>
            {files.length} item{files.length !== 1 ? "s" : ""}
            {selectedFiles.size > 0 && ` (${selectedFiles.size} selected)`}
          </span>
          <span>
            Total size:{" "}
            {formatFileSize(
              files.reduce((acc, f) => acc + (f.size || 0), 0)
            )}
          </span>
        </div>
      </div>
    </TooltipProvider>
  );
}
