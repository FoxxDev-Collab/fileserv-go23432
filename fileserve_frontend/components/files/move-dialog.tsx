"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { zoneFilesAPI, FileInfo } from "@/lib/api";
import { Folder, FolderOpen, ChevronRight, Loader2, Home } from "lucide-react";
import { cn } from "@/lib/utils";

interface MoveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  zoneId: string;
  selectedFiles: { name: string; path: string; type: string }[];
  currentPath: string;
  onMove: (destination: string) => void;
}

export function MoveDialog({
  open,
  onOpenChange,
  zoneId,
  selectedFiles,
  currentPath,
  onMove,
}: MoveDialogProps) {
  const [folders, setFolders] = useState<FileInfo[]>([]);
  const [selectedPath, setSelectedPath] = useState("/");
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(["/"]))
  const [loadingPath, setLoadingPath] = useState<string | null>(null);
  const [folderCache, setFolderCache] = useState<Map<string, FileInfo[]>>(new Map());
  const [isMoving, setIsMoving] = useState(false);

  // Load folders for a given path
  const loadFolders = useCallback(async (path: string) => {
    if (folderCache.has(path)) {
      return folderCache.get(path)!;
    }

    setLoadingPath(path);
    try {
      const result = await zoneFilesAPI.listFolders(zoneId, path);
      setFolderCache((prev) => new Map(prev).set(path, result));
      return result;
    } catch (error) {
      console.error("Failed to load folders:", error);
      return [];
    } finally {
      setLoadingPath(null);
    }
  }, [zoneId, folderCache]);

  // Load root folders when dialog opens
  useEffect(() => {
    if (open) {
      loadFolders("/").then(setFolders);
      setSelectedPath("/");
      setExpandedPaths(new Set(["/"]));
      setFolderCache(new Map());
    }
  }, [open, zoneId]);

  // Toggle folder expansion
  const toggleExpand = async (path: string) => {
    const newExpanded = new Set(expandedPaths);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
      // Load subfolders if not cached
      await loadFolders(path);
    }
    setExpandedPaths(newExpanded);
  };

  // Handle move
  const handleMove = async () => {
    setIsMoving(true);
    try {
      await onMove(selectedPath);
      onOpenChange(false);
    } finally {
      setIsMoving(false);
    }
  };

  // Check if a path can be selected as destination
  const canSelectPath = (path: string) => {
    // Can't move to current path
    if (path === currentPath) return false;
    // Can't move a folder into itself or its children
    for (const file of selectedFiles) {
      if (file.type === "folder") {
        const filePath = file.path.replace(/\/$/, "");
        if (path === filePath || path.startsWith(filePath + "/")) {
          return false;
        }
      }
    }
    return true;
  };

  // Render folder tree recursively
  const renderFolderTree = (parentPath: string, depth: number = 0) => {
    const pathFolders = folderCache.get(parentPath) || (parentPath === "/" ? folders : []);

    return pathFolders.map((folder) => {
      const folderPath = parentPath === "/"
        ? `/${folder.name}`
        : `${parentPath}/${folder.name}`;
      const isExpanded = expandedPaths.has(folderPath);
      const isSelected = selectedPath === folderPath;
      const isLoading = loadingPath === folderPath;
      const canSelect = canSelectPath(folderPath);
      const hasSubfolders = folderCache.has(folderPath)
        ? folderCache.get(folderPath)!.length > 0
        : true; // Assume has subfolders until loaded

      return (
        <div key={folderPath}>
          <div
            className={cn(
              "flex items-center gap-1 py-1.5 px-2 rounded-md cursor-pointer",
              isSelected && canSelect && "bg-primary text-primary-foreground",
              !isSelected && canSelect && "hover:bg-muted",
              !canSelect && "opacity-50 cursor-not-allowed"
            )}
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
            onClick={() => canSelect && setSelectedPath(folderPath)}
          >
            <button
              className="p-0.5 hover:bg-black/10 rounded"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(folderPath);
              }}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : hasSubfolders ? (
                <ChevronRight
                  className={cn(
                    "h-4 w-4 transition-transform",
                    isExpanded && "rotate-90"
                  )}
                />
              ) : (
                <span className="w-4" />
              )}
            </button>
            {isExpanded ? (
              <FolderOpen className="h-4 w-4 text-yellow-500" />
            ) : (
              <Folder className="h-4 w-4 text-yellow-500" />
            )}
            <span className="truncate text-sm">{folder.name}</span>
          </div>
          {isExpanded && (
            <div>{renderFolderTree(folderPath, depth + 1)}</div>
          )}
        </div>
      );
    });
  };

  const fileCount = selectedFiles.length;
  const fileLabel = fileCount === 1 ? selectedFiles[0].name : `${fileCount} items`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move to...</DialogTitle>
          <DialogDescription>
            Select a destination folder for {fileLabel}
          </DialogDescription>
        </DialogHeader>

        <div className="border rounded-md">
          {/* Root folder */}
          <div
            className={cn(
              "flex items-center gap-2 py-2 px-3 cursor-pointer border-b",
              selectedPath === "/" && canSelectPath("/")
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted",
              !canSelectPath("/") && "opacity-50 cursor-not-allowed"
            )}
            onClick={() => canSelectPath("/") && setSelectedPath("/")}
          >
            <Home className="h-4 w-4" />
            <span className="text-sm font-medium">Root</span>
          </div>

          <ScrollArea className="h-[300px]">
            <div className="p-1">
              {loadingPath === "/" ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : folders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No folders found
                </div>
              ) : (
                renderFolderTree("/")
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="text-sm text-muted-foreground">
          Moving to: <span className="font-medium">{selectedPath || "/"}</span>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleMove}
            disabled={isMoving || !canSelectPath(selectedPath)}
          >
            {isMoving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Moving...
              </>
            ) : (
              "Move here"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
