/**
 * Core TypeScript types for the FileServ application
 */

export interface User {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  storageUsed?: number;
  storageLimit?: number;
}

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
}

export interface File {
  id: string;
  name: string;
  path: string;
  size: number;
  mimeType: string;
  owner: string;
  createdAt: string;
  updatedAt: string;
  isPublic: boolean;
  permissions: Permission[];
  parentFolderId?: string;
}

export interface Folder {
  id: string;
  name: string;
  path: string;
  owner: string;
  createdAt: string;
  updatedAt: string;
  isPublic: boolean;
  permissions: Permission[];
  parentFolderId?: string;
  childFiles?: File[];
  childFolders?: Folder[];
}

export interface Permission {
  id: string;
  userId: string;
  resourceId: string;
  resourceType: 'file' | 'folder';
  permission: PermissionLevel;
  grantedAt: string;
  grantedBy: string;
}

export enum PermissionLevel {
  READ = 'read',
  WRITE = 'write',
  DELETE = 'delete',
  ADMIN = 'admin',
}

export interface FileUpload {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  error?: string;
}

export interface StorageStats {
  totalSpace: number;
  usedSpace: number;
  fileCount: number;
  folderCount: number;
}

export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalFiles: number;
  totalStorage: number;
  storageLimit: number;
}
