"use client";

import { useRef, useCallback } from "react";
import { Upload, FolderUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useUploadQueue } from "@/lib/hooks/use-upload";

interface UploadButtonProps {
  currentPath?: string;
  onUploadComplete?: () => void;
  zoneId?: string;
}

export function UploadButton({ currentPath = "/", onUploadComplete, zoneId }: UploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const { addFiles, hasActiveUploads, stats } = useUploadQueue();

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleFolderClick = () => {
    folderInputRef.current?.click();
  };

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    const isFolderUpload = e.target === folderInputRef.current;

    // For folder uploads, we need to preserve the directory structure
    // using webkitRelativePath
    let filesToUpload: File[];
    if (isFolderUpload) {
      filesToUpload = fileArray.map(file => {
        // webkitRelativePath contains the relative path from the selected folder
        // e.g., "myFolder/subFolder/file.txt"
        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
        if (relativePath) {
          // Create a new File with the relative path as the name
          return new File([file], relativePath, {
            type: file.type,
            lastModified: file.lastModified,
          });
        }
        return file;
      });
    } else {
      filesToUpload = fileArray;
    }

    // Add files to upload queue
    addFiles(filesToUpload, currentPath, zoneId);

    const message = isFolderUpload
      ? `Added ${filesToUpload.length} file${filesToUpload.length !== 1 ? 's' : ''} from folder to upload queue`
      : `Added ${filesToUpload.length} file${filesToUpload.length !== 1 ? 's' : ''} to upload queue`;
    toast.success(message);

    // Trigger callback for UI refresh when uploads complete
    // This is handled by the upload manager notifying subscribers
    if (onUploadComplete) {
      // We'll call this periodically or when uploads complete
      // For now, we can check completion in the parent component
    }

    // Reset input to allow re-selecting same files
    if (e.target === fileInputRef.current && fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    if (e.target === folderInputRef.current && folderInputRef.current) {
      folderInputRef.current.value = "";
    }
  }, [addFiles, currentPath, zoneId, onUploadComplete]);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="gap-2" disabled={false}>
            <Upload className="h-4 w-4" />
            Upload
            {hasActiveUploads && (
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-white/20 rounded-full">
                {stats.uploading + stats.queued}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleButtonClick}>
            <Upload className="h-4 w-4 mr-2" />
            Upload Files
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleFolderClick}>
            <FolderUp className="h-4 w-4 mr-2" />
            Upload Folder
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        ref={folderInputRef}
        type="file"
        {...{ webkitdirectory: "", directory: "" }}
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
    </>
  );
}

// Simple upload button (no dropdown, just files)
export function SimpleUploadButton({ currentPath = "/", zoneId }: UploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addFiles, hasActiveUploads, stats } = useUploadQueue();

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    addFiles(fileArray, currentPath, zoneId);
    toast.success(`Added ${fileArray.length} file${fileArray.length !== 1 ? 's' : ''} to upload queue`);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [addFiles, currentPath, zoneId]);

  return (
    <>
      <Button onClick={handleButtonClick} className="gap-2">
        <Upload className="h-4 w-4" />
        Upload Files
        {hasActiveUploads && (
          <span className="ml-1 px-1.5 py-0.5 text-xs bg-white/20 rounded-full">
            {stats.uploading + stats.queued}
          </span>
        )}
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
    </>
  );
}
