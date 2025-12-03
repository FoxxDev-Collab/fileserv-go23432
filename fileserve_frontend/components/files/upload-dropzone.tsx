'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, FileUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUploadQueue } from '@/lib/hooks/use-upload';
import { toast } from 'sonner';

interface UploadDropzoneProps {
  currentPath: string;
  zoneId?: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export function UploadDropzone({
  currentPath,
  zoneId,
  children,
  className,
  disabled = false,
}: UploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const { addFiles } = useUploadQueue();

  // Handle drag events
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;

    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setIsDragging(false);
    dragCounter.current = 0;

    if (disabled) return;

    const files: File[] = [];

    // Handle both files and folders
    if (e.dataTransfer.items) {
      const items = Array.from(e.dataTransfer.items);

      for (const item of items) {
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry?.();

          if (entry) {
            if (entry.isFile) {
              const file = item.getAsFile();
              if (file) files.push(file);
            } else if (entry.isDirectory) {
              // Recursively get files from directory
              const dirFiles = await readDirectory(entry as FileSystemDirectoryEntry);
              files.push(...dirFiles);
            }
          } else {
            const file = item.getAsFile();
            if (file) files.push(file);
          }
        }
      }
    } else if (e.dataTransfer.files) {
      files.push(...Array.from(e.dataTransfer.files));
    }

    if (files.length > 0) {
      addFiles(files, currentPath, zoneId);
      toast.success(`Added ${files.length} file${files.length !== 1 ? 's' : ''} to upload queue`);
    }
  }, [disabled, addFiles, currentPath, zoneId]);

  // Reset drag counter when component unmounts or path changes
  useEffect(() => {
    dragCounter.current = 0;
    setIsDragging(false);
  }, [currentPath, zoneId]);

  return (
    <div
      className={cn('relative', className)}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}

      {/* Drop overlay */}
      {isDragging && !disabled && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-primary/10 border-2 border-dashed border-primary rounded-lg backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 text-primary">
            <div className="p-4 bg-primary/20 rounded-full">
              <FileUp className="h-8 w-8" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold">Drop files here</p>
              <p className="text-sm text-muted-foreground">Files will be uploaded to current folder</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper function to read files from a directory entry
async function readDirectory(directoryEntry: FileSystemDirectoryEntry): Promise<File[]> {
  const files: File[] = [];
  const reader = directoryEntry.createReader();

  const readEntries = (): Promise<FileSystemEntry[]> => {
    return new Promise((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
  };

  const getFile = (fileEntry: FileSystemFileEntry): Promise<File> => {
    return new Promise((resolve, reject) => {
      fileEntry.file(resolve, reject);
    });
  };

  let entries: FileSystemEntry[] = [];
  // Keep reading until no more entries (readEntries returns in batches)
  do {
    const batch = await readEntries();
    entries = batch;

    for (const entry of entries) {
      if (entry.isFile) {
        try {
          const file = await getFile(entry as FileSystemFileEntry);
          // Preserve directory structure in filename
          const relativePath = entry.fullPath.replace(/^\//, '');
          // Create a new File with the relative path as the name
          const fileWithPath = new File([file], relativePath, {
            type: file.type,
            lastModified: file.lastModified,
          });
          files.push(fileWithPath);
        } catch (err) {
          console.warn('Could not read file:', entry.fullPath, err);
        }
      } else if (entry.isDirectory) {
        const subFiles = await readDirectory(entry as FileSystemDirectoryEntry);
        files.push(...subFiles);
      }
    }
  } while (entries.length > 0);

  return files;
}

// Standalone dropzone component (not wrapping other content)
export function StandaloneDropzone({
  currentPath,
  zoneId,
  className,
  disabled = false,
}: Omit<UploadDropzoneProps, 'children'>) {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addFiles } = useUploadQueue();

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;

    dragCounter.current++;
    setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setIsDragging(false);
    dragCounter.current = 0;

    if (disabled) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      addFiles(files, currentPath, zoneId);
      toast.success(`Added ${files.length} file${files.length !== 1 ? 's' : ''} to upload queue`);
    }
  }, [disabled, addFiles, currentPath, zoneId]);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    addFiles(Array.from(files), currentPath, zoneId);
    toast.success(`Added ${files.length} file${files.length !== 1 ? 's' : ''} to upload queue`);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg cursor-pointer transition-colors',
        isDragging
          ? 'border-primary bg-primary/10'
          : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={disabled ? undefined : handleClick}
    >
      <div className={cn(
        'p-3 rounded-full mb-3',
        isDragging ? 'bg-primary/20' : 'bg-muted'
      )}>
        <Upload className={cn(
          'h-6 w-6',
          isDragging ? 'text-primary' : 'text-muted-foreground'
        )} />
      </div>
      <p className="text-sm font-medium text-center">
        {isDragging ? 'Drop files here' : 'Drag and drop files here'}
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        or click to browse
      </p>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled}
      />
    </div>
  );
}
