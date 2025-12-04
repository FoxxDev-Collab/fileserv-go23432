"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { filesAPI, zoneFilesAPI, sharesAPI, usersAPI, FileInfo, UserZoneInfo } from "@/lib/api";

// Query keys for cache management
export const queryKeys = {
  files: (path: string) => ["files", path] as const,
  zones: ["zones"] as const,
  zoneFiles: (zoneId: string, path: string) => ["zoneFiles", zoneId, path] as const,
  shares: ["shares"] as const,
  users: ["users"] as const,
  user: (id: string) => ["user", id] as const,
};

// ============================================================================
// Files Hooks
// ============================================================================

export function useFiles(path: string = "/") {
  return useQuery({
    queryKey: queryKeys.files(path),
    queryFn: () => filesAPI.list(path),
    staleTime: 30 * 1000, // 30 seconds
  });
}

// ============================================================================
// Zone Files Hooks
// ============================================================================

export function useAccessibleZones() {
  return useQuery({
    queryKey: queryKeys.zones,
    queryFn: () => zoneFilesAPI.getAccessibleZones(),
    staleTime: 60 * 1000, // 1 minute - zones don't change often
  });
}

export function useZoneFiles(zoneId: string | undefined, path: string = "") {
  return useQuery({
    queryKey: queryKeys.zoneFiles(zoneId || "", path),
    queryFn: () => zoneFilesAPI.list(zoneId!, path),
    enabled: !!zoneId, // Only fetch if zoneId is provided
    staleTime: 30 * 1000,
  });
}

// Mutation for creating folders
export function useCreateFolder(zoneId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (path: string) => zoneFilesAPI.createFolder(zoneId, path),
    onSuccess: (_, path) => {
      // Invalidate the parent directory's file list
      const parentPath = path.substring(0, path.lastIndexOf("/")) || "";
      queryClient.invalidateQueries({ queryKey: queryKeys.zoneFiles(zoneId, parentPath) });
    },
  });
}

// Mutation for deleting files
export function useDeleteFile(zoneId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (path: string) => zoneFilesAPI.delete(zoneId, path),
    onSuccess: (_, path) => {
      const parentPath = path.substring(0, path.lastIndexOf("/")) || "";
      queryClient.invalidateQueries({ queryKey: queryKeys.zoneFiles(zoneId, parentPath) });
    },
  });
}

// Mutation for renaming files
export function useRenameFile(zoneId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ oldPath, newPath }: { oldPath: string; newPath: string }) =>
      zoneFilesAPI.rename(zoneId, oldPath, newPath),
    onSuccess: (_, { oldPath }) => {
      const parentPath = oldPath.substring(0, oldPath.lastIndexOf("/")) || "";
      queryClient.invalidateQueries({ queryKey: queryKeys.zoneFiles(zoneId, parentPath) });
    },
  });
}

// ============================================================================
// Shares Hooks
// ============================================================================

export function useShares() {
  return useQuery({
    queryKey: queryKeys.shares,
    queryFn: () => sharesAPI.list(),
    staleTime: 30 * 1000,
  });
}

// ============================================================================
// Users Hooks
// ============================================================================

export function useUsers() {
  return useQuery({
    queryKey: queryKeys.users,
    queryFn: () => usersAPI.list(),
    staleTime: 60 * 1000, // 1 minute
  });
}

// ============================================================================
// Dashboard Stats Hook
// ============================================================================

export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboardStats"],
    queryFn: async () => {
      // Get accessible zones first
      const zones = await zoneFilesAPI.getAccessibleZones();

      // If no zones, return empty stats
      if (!zones || zones.length === 0) {
        return {
          stats: { fileCount: 0, folderCount: 0, totalSize: 0, zoneCount: 0 },
          recentFiles: [],
          primaryZone: null as UserZoneInfo | null,
        };
      }

      let fileCount = 0;
      let folderCount = 0;
      let totalSize = 0;
      let allFiles: FileInfo[] = [];

      // Get files from the first zone (primary zone) for dashboard stats
      // This avoids too many API calls on dashboard load
      const primaryZone = zones[0];
      try {
        const files = await zoneFilesAPI.list(primaryZone.zone_id, "/");

        if (files) {
          files.forEach((f) => {
            if (f.is_dir) {
              folderCount++;
            } else {
              fileCount++;
              totalSize += f.size;
            }
          });
          allFiles = files;
        }
      } catch (error) {
        console.error("Failed to load zone files for dashboard:", error);
      }

      // Get recent files (non-folders, sorted by mod_time)
      const recentFiles = allFiles
        .filter((f) => !f.is_dir)
        .sort((a, b) => new Date(b.mod_time).getTime() - new Date(a.mod_time).getTime())
        .slice(0, 5);

      return {
        stats: { fileCount, folderCount, totalSize, zoneCount: zones.length },
        recentFiles,
        primaryZone,
      };
    },
    staleTime: 30 * 1000,
  });
}

// ============================================================================
// Cache Invalidation Helpers
// ============================================================================

export function useInvalidateFiles() {
  const queryClient = useQueryClient();

  return {
    invalidateAll: () => {
      queryClient.invalidateQueries({ queryKey: ["files"] });
      queryClient.invalidateQueries({ queryKey: ["zoneFiles"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
    },
    invalidatePath: (path: string) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.files(path) });
    },
    invalidateZone: (zoneId: string, path?: string) => {
      if (path !== undefined) {
        queryClient.invalidateQueries({ queryKey: queryKeys.zoneFiles(zoneId, path) });
      } else {
        queryClient.invalidateQueries({ queryKey: ["zoneFiles", zoneId] });
      }
    },
  };
}
