/**
 * Upload Manager - Handles file upload queue with real-time progress
 * Supports both simple and chunked uploads for large files
 * Features resumable uploads that survive interruptions
 */

import { getAuthToken } from './api';

const API_BASE = '/api';
const CHUNK_SIZE = 20 * 1024 * 1024; // 20MB chunks (larger = fewer HTTP requests)
const CHUNK_THRESHOLD = 50 * 1024 * 1024; // Use chunked upload for files > 50MB
const MAX_CONCURRENT_UPLOADS = 3;

export type UploadStatus = 'queued' | 'uploading' | 'paused' | 'completed' | 'error' | 'cancelled';

export interface UploadItem {
  id: string;
  file: File;
  fileName: string;
  fileSize: number;
  targetPath: string;
  zoneId?: string;
  status: UploadStatus;
  progress: number; // 0-100
  uploadedBytes: number;
  speed: number; // bytes per second
  eta: number; // seconds remaining
  error?: string;
  startTime?: number;
  endTime?: number;
  // Chunked upload state
  sessionId?: string;
  totalChunks?: number;
  uploadedChunks?: number;
  // Track which chunks are uploaded (for resumability)
  completedChunkIndices?: Set<number>;
  // Abort controller for cancellation
  abortController?: AbortController;
}

export interface UploadSession {
  session_id: string;
  chunk_size: number;
  total_chunks: number;
  upload_url: string;
  finalize_url: string;
  progress_url: string;
}

export interface UploadProgress {
  session_id: string;
  filename: string;
  total_size: number;
  uploaded_size: number;
  total_chunks: number;
  uploaded_chunks: number;
  progress: number;
  complete: boolean;
  created_at?: string;
  updated_at?: string;
}

// Server session from ListUserSessions endpoint
export interface ServerSession {
  session_id: string;
  filename: string;
  total_size: number;
  uploaded_size: number;
  total_chunks: number;
  uploaded_chunks: number;
  progress: number;
  complete: boolean;
  created_at: string;
  updated_at: string;
}

type UploadListener = (items: UploadItem[]) => void;
type CompletionCallback = (item: UploadItem) => void;

class UploadManager {
  private items: Map<string, UploadItem> = new Map();
  private listeners: Set<UploadListener> = new Set();
  private completionCallbacks: Set<CompletionCallback> = new Set();
  private activeUploads = 0;
  private processingQueue = false;
  private restoredSessionIds: Set<string> = new Set(); // Track restored sessions

  // Subscribe to upload completion events
  onComplete(callback: CompletionCallback): () => void {
    this.completionCallbacks.add(callback);
    return () => this.completionCallbacks.delete(callback);
  }

  // Notify completion callbacks
  private notifyComplete(item: UploadItem): void {
    this.completionCallbacks.forEach(cb => cb(item));
  }

  // Subscribe to upload changes
  subscribe(listener: UploadListener): () => void {
    this.listeners.add(listener);
    listener(this.getItems());
    return () => this.listeners.delete(listener);
  }

  // Notify all listeners of state change
  private notify(): void {
    const items = this.getItems();
    this.listeners.forEach(listener => listener(items));
  }

  // Get all upload items sorted by creation time
  getItems(): UploadItem[] {
    return Array.from(this.items.values()).sort((a, b) => {
      // Sort by status priority, then by start time
      const statusPriority: Record<UploadStatus, number> = {
        uploading: 0,
        queued: 1,
        paused: 2,
        error: 3,
        completed: 4,
        cancelled: 5,
      };
      const priorityDiff = statusPriority[a.status] - statusPriority[b.status];
      if (priorityDiff !== 0) return priorityDiff;
      return (a.startTime || 0) - (b.startTime || 0);
    });
  }

  // Generate unique ID
  private generateId(): string {
    return `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Fetch missing chunks for a session from the server
  private async fetchMissingChunks(sessionId: string): Promise<number[]> {
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}/upload/session/${sessionId}/missing`, {
      headers,
    });

    if (!res.ok) {
      throw new Error('Failed to fetch missing chunks');
    }

    const data = await res.json();
    return data.missing_chunks || [];
  }

  // Fetch active sessions for the current user from the server
  async fetchUserSessions(): Promise<ServerSession[]> {
    const token = getAuthToken();
    if (!token) return [];

    try {
      const res = await fetch(`${API_BASE}/upload/sessions`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        return [];
      }

      return await res.json() || [];
    } catch {
      return [];
    }
  }

  // Restore incomplete upload sessions from the server
  // Call this on page load to show users their pending uploads
  async restoreSessions(): Promise<number> {
    const sessions = await this.fetchUserSessions();
    let restored = 0;

    for (const session of sessions) {
      // Skip already completed or already tracked sessions
      if (session.complete || this.restoredSessionIds.has(session.session_id)) {
        continue;
      }

      // Check if we already have this session in our items
      const existingItem = Array.from(this.items.values()).find(
        item => item.sessionId === session.session_id
      );
      if (existingItem) continue;

      // Create a placeholder item for this session
      // Note: We can't resume without the original file, so mark as paused
      const id = this.generateId();
      const item: UploadItem = {
        id,
        file: new File([], session.filename), // Placeholder - can't resume without file
        fileName: session.filename,
        fileSize: session.total_size,
        targetPath: '', // Unknown from session data
        status: 'paused',
        progress: session.progress,
        uploadedBytes: session.uploaded_size,
        speed: 0,
        eta: 0,
        sessionId: session.session_id,
        totalChunks: session.total_chunks,
        uploadedChunks: session.uploaded_chunks,
        error: 'File required to resume - drag file here or remove',
      };

      this.items.set(id, item);
      this.restoredSessionIds.add(session.session_id);
      restored++;
    }

    if (restored > 0) {
      this.notify();
    }

    return restored;
  }

  // Add files to upload queue
  addFiles(files: File[], targetPath: string, zoneId?: string): string[] {
    const ids: string[] = [];

    for (const file of files) {
      // Check if this file matches a paused/restored session
      const matchingItem = Array.from(this.items.values()).find(
        item =>
          item.status === 'paused' &&
          item.sessionId &&
          item.fileName === file.name &&
          item.fileSize === file.size
      );

      if (matchingItem) {
        // Resume this existing session with the new file reference
        matchingItem.file = file;
        matchingItem.targetPath = targetPath;
        matchingItem.zoneId = zoneId;
        matchingItem.error = undefined;
        matchingItem.status = 'queued';
        ids.push(matchingItem.id);
        continue;
      }

      const id = this.generateId();

      // Handle folder structure: if file.name contains path separators,
      // it's from a folder upload and we need to adjust the target path
      let fileName = file.name;
      let uploadPath = targetPath;

      if (file.name.includes('/')) {
        // File name contains path (e.g., "myFolder/subFolder/file.txt")
        const pathParts = file.name.split('/');
        fileName = pathParts.pop() || file.name; // Get the actual file name
        const relativeDirPath = pathParts.join('/'); // Get the directory path

        // Combine target path with the relative directory
        uploadPath = targetPath.endsWith('/')
          ? `${targetPath}${relativeDirPath}`
          : `${targetPath}/${relativeDirPath}`;
      }

      const item: UploadItem = {
        id,
        file,
        fileName,
        fileSize: file.size,
        targetPath: uploadPath,
        zoneId,
        status: 'queued',
        progress: 0,
        uploadedBytes: 0,
        speed: 0,
        eta: 0,
      };

      this.items.set(id, item);
      ids.push(id);
    }

    this.notify();
    this.processQueue();

    return ids;
  }

  // Pause an upload
  pause(id: string): void {
    const item = this.items.get(id);
    if (item && item.status === 'uploading') {
      item.status = 'paused';
      item.abortController?.abort();
      this.activeUploads--;
      this.notify();
    }
  }

  // Resume a paused upload
  resume(id: string): void {
    const item = this.items.get(id);
    if (item && item.status === 'paused') {
      // Check if we have a valid file reference
      if (!item.file || item.file.size === 0) {
        item.error = 'Original file required to resume';
        this.notify();
        return;
      }
      item.status = 'queued';
      item.error = undefined;
      this.notify();
      this.processQueue();
    }
  }

  // Cancel an upload
  cancel(id: string): void {
    const item = this.items.get(id);
    if (item) {
      if (item.status === 'uploading') {
        item.abortController?.abort();
        this.activeUploads--;
      }
      // Optionally cancel the server session
      if (item.sessionId) {
        this.cancelServerSession(item.sessionId).catch(() => {});
      }
      item.status = 'cancelled';
      this.notify();
    }
  }

  // Cancel a session on the server
  private async cancelServerSession(sessionId: string): Promise<void> {
    const token = getAuthToken();
    try {
      await fetch(`${API_BASE}/upload/session/${sessionId}`, {
        method: 'DELETE',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
    } catch {
      // Ignore errors when cancelling
    }
  }

  // Retry a failed upload - with resumability support
  async retry(id: string): Promise<void> {
    const item = this.items.get(id);
    if (!item || (item.status !== 'error' && item.status !== 'cancelled')) {
      return;
    }

    // Check if we have a valid file reference
    if (!item.file || item.file.size === 0) {
      item.error = 'Original file required to retry';
      this.notify();
      return;
    }

    // If we have an existing session, check what chunks are missing
    if (item.sessionId && item.totalChunks) {
      try {
        const missingChunks = await this.fetchMissingChunks(item.sessionId);

        if (missingChunks.length === 0) {
          // All chunks uploaded, just need to finalize
          item.status = 'queued';
          item.error = undefined;
          item.completedChunkIndices = new Set(
            Array.from({ length: item.totalChunks }, (_, i) => i)
          );
        } else if (missingChunks.length < item.totalChunks) {
          // Partial upload - resume from where we left off
          item.status = 'queued';
          item.error = undefined;
          const completedIndices = new Set<number>();
          for (let i = 0; i < item.totalChunks; i++) {
            if (!missingChunks.includes(i)) {
              completedIndices.add(i);
            }
          }
          item.completedChunkIndices = completedIndices;
          item.uploadedChunks = completedIndices.size;
          item.uploadedBytes = completedIndices.size * CHUNK_SIZE;
          if (item.uploadedBytes > item.fileSize) {
            item.uploadedBytes = item.fileSize;
          }
          item.progress = (item.uploadedBytes / item.fileSize) * 100;
        } else {
          // All chunks missing - start fresh but keep session
          item.status = 'queued';
          item.error = undefined;
          item.completedChunkIndices = new Set();
        }
      } catch {
        // Session might have expired - start fresh
        item.status = 'queued';
        item.progress = 0;
        item.uploadedBytes = 0;
        item.error = undefined;
        item.sessionId = undefined;
        item.completedChunkIndices = undefined;
      }
    } else {
      // No session - start fresh
      item.status = 'queued';
      item.progress = 0;
      item.uploadedBytes = 0;
      item.error = undefined;
      item.sessionId = undefined;
      item.completedChunkIndices = undefined;
    }

    this.notify();
    this.processQueue();
  }

  // Remove an upload from the list
  remove(id: string): void {
    const item = this.items.get(id);
    if (item) {
      if (item.status === 'uploading') {
        item.abortController?.abort();
        this.activeUploads--;
      }
      // Cancel server session if exists
      if (item.sessionId) {
        this.cancelServerSession(item.sessionId).catch(() => {});
      }
      this.items.delete(id);
      this.notify();
    }
  }

  // Clear completed/cancelled/failed uploads
  clearCompleted(): void {
    for (const [id, item] of this.items) {
      if (['completed', 'cancelled', 'error'].includes(item.status)) {
        // Cancel server session for failed/cancelled uploads
        if (item.sessionId && item.status !== 'completed') {
          this.cancelServerSession(item.sessionId).catch(() => {});
        }
        this.items.delete(id);
      }
    }
    this.notify();
  }

  // Process the upload queue
  private async processQueue(): Promise<void> {
    if (this.processingQueue) return;
    this.processingQueue = true;

    while (this.activeUploads < MAX_CONCURRENT_UPLOADS) {
      const nextItem = Array.from(this.items.values()).find(
        item => item.status === 'queued'
      );

      if (!nextItem) break;

      this.activeUploads++;
      this.uploadItem(nextItem);
    }

    this.processingQueue = false;
  }

  // Upload a single item
  private async uploadItem(item: UploadItem): Promise<void> {
    item.status = 'uploading';
    if (!item.startTime) {
      item.startTime = Date.now();
    }
    item.abortController = new AbortController();
    this.notify();

    try {
      // Use chunked upload for large files
      if (item.fileSize > CHUNK_THRESHOLD) {
        await this.uploadChunked(item);
      } else {
        await this.uploadSimple(item);
      }

      item.status = 'completed';
      item.progress = 100;
      item.uploadedBytes = item.fileSize;
      item.endTime = Date.now();
      // Notify completion callbacks
      this.notifyComplete(item);
    } catch (error) {
      // Status might have been changed to 'paused' or 'cancelled' during async upload
      const currentStatus = item.status as UploadStatus;
      if (currentStatus !== 'paused' && currentStatus !== 'cancelled') {
        item.status = 'error';
        item.error = error instanceof Error ? error.message : 'Upload failed';
      }
    } finally {
      this.activeUploads--;
      this.notify();
      this.processQueue();
    }
  }

  // Simple single-request upload with progress
  private async uploadSimple(item: UploadItem): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('file', item.file);

      // Build URL
      let url: string;
      if (item.zoneId) {
        const encodedPath = item.targetPath.split('/').map(s => encodeURIComponent(s)).join('/');
        url = `${API_BASE}/zones/${item.zoneId}/files${encodedPath.startsWith('/') ? encodedPath : '/' + encodedPath}`;
      } else {
        const encodedPath = item.targetPath.split('/').map(s => encodeURIComponent(s)).join('/');
        url = `${API_BASE}/files${encodedPath.startsWith('/') ? encodedPath : '/' + encodedPath}`;
      }

      xhr.open('POST', url);

      // Add auth header
      const token = getAuthToken();
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      // Track progress
      let lastLoaded = 0;
      let lastTime = Date.now();

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const now = Date.now();
          const timeDiff = (now - lastTime) / 1000;
          const bytesDiff = event.loaded - lastLoaded;

          if (timeDiff > 0) {
            item.speed = bytesDiff / timeDiff;
            const remaining = event.total - event.loaded;
            item.eta = item.speed > 0 ? remaining / item.speed : 0;
          }

          lastLoaded = event.loaded;
          lastTime = now;
          item.uploadedBytes = event.loaded;
          item.progress = (event.loaded / event.total) * 100;
          this.notify();
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(xhr.responseText || `HTTP ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error('Network error'));
      xhr.onabort = () => reject(new Error('Upload cancelled'));

      // Handle abort
      item.abortController!.signal.addEventListener('abort', () => xhr.abort());

      xhr.send(formData);
    });
  }

  // Chunked upload for large files - with resume support
  private async uploadChunked(item: UploadItem): Promise<void> {
    const token = getAuthToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let session: UploadSession;
    let chunksToUpload: number[];

    // Check if we have an existing session to resume
    if (item.sessionId && item.completedChunkIndices) {
      // Resuming - use existing session
      session = {
        session_id: item.sessionId,
        chunk_size: CHUNK_SIZE,
        total_chunks: item.totalChunks!,
        upload_url: '',
        finalize_url: '',
        progress_url: '',
      };

      // Calculate which chunks still need uploading
      chunksToUpload = [];
      for (let i = 0; i < item.totalChunks!; i++) {
        if (!item.completedChunkIndices.has(i)) {
          chunksToUpload.push(i);
        }
      }
    } else {
      // New upload - create session
      const sessionRes = await fetch(`${API_BASE}/upload/session`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          filename: item.fileName,
          total_size: item.fileSize,
          target_path: item.targetPath,
          zone_id: item.zoneId,
          chunk_size: CHUNK_SIZE,
        }),
        signal: item.abortController!.signal,
      });

      if (!sessionRes.ok) {
        throw new Error(await sessionRes.text() || 'Failed to create upload session');
      }

      session = await sessionRes.json();
      item.sessionId = session.session_id;
      item.totalChunks = session.total_chunks;
      item.uploadedChunks = 0;
      item.completedChunkIndices = new Set();

      // All chunks need uploading
      chunksToUpload = Array.from({ length: session.total_chunks }, (_, i) => i);
    }

    // Upload chunks
    let lastTime = Date.now();
    let lastBytes = item.uploadedBytes || 0;

    for (const chunkIndex of chunksToUpload) {
      // Check if cancelled or paused
      if (item.abortController!.signal.aborted) {
        throw new Error('Upload cancelled');
      }

      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, item.fileSize);
      const chunk = item.file.slice(start, end);

      const chunkFormData = new FormData();
      chunkFormData.append('chunk', chunk);

      const chunkRes = await fetch(
        `${API_BASE}/upload/session/${session.session_id}/chunk/${chunkIndex}`,
        {
          method: 'POST',
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
          body: chunkFormData,
          signal: item.abortController!.signal,
        }
      );

      if (!chunkRes.ok) {
        throw new Error(await chunkRes.text() || `Failed to upload chunk ${chunkIndex}`);
      }

      // Mark chunk as completed
      item.completedChunkIndices!.add(chunkIndex);
      item.uploadedChunks = item.completedChunkIndices!.size;

      // Calculate uploaded bytes based on completed chunks
      let uploadedBytes = 0;
      for (const idx of item.completedChunkIndices!) {
        const chunkStart = idx * CHUNK_SIZE;
        const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, item.fileSize);
        uploadedBytes += (chunkEnd - chunkStart);
      }
      item.uploadedBytes = uploadedBytes;
      item.progress = (uploadedBytes / item.fileSize) * 100;

      // Calculate speed and ETA
      const now = Date.now();
      const timeDiff = (now - lastTime) / 1000;
      const bytesDiff = uploadedBytes - lastBytes;

      if (timeDiff > 0.5) {
        item.speed = bytesDiff / timeDiff;
        const remaining = item.fileSize - uploadedBytes;
        item.eta = item.speed > 0 ? remaining / item.speed : 0;
        lastTime = now;
        lastBytes = uploadedBytes;
      }

      this.notify();
    }

    // Finalize upload
    const finalizeRes = await fetch(
      `${API_BASE}/upload/session/${session.session_id}/finalize`,
      {
        method: 'POST',
        headers,
        signal: item.abortController!.signal,
      }
    );

    if (!finalizeRes.ok) {
      throw new Error(await finalizeRes.text() || 'Failed to finalize upload');
    }
  }

  // Get stats
  getStats(): { total: number; completed: number; uploading: number; queued: number; failed: number } {
    let total = 0, completed = 0, uploading = 0, queued = 0, failed = 0;

    for (const item of this.items.values()) {
      total++;
      switch (item.status) {
        case 'completed': completed++; break;
        case 'uploading': uploading++; break;
        case 'queued': queued++; break;
        case 'error': failed++; break;
      }
    }

    return { total, completed, uploading, queued, failed };
  }

  // Get overall progress
  getOverallProgress(): { uploadedBytes: number; totalBytes: number; percent: number } {
    let uploadedBytes = 0;
    let totalBytes = 0;

    for (const item of this.items.values()) {
      if (['queued', 'uploading', 'completed'].includes(item.status)) {
        totalBytes += item.fileSize;
        uploadedBytes += item.uploadedBytes;
      }
    }

    const percent = totalBytes > 0 ? (uploadedBytes / totalBytes) * 100 : 0;
    return { uploadedBytes, totalBytes, percent };
  }
}

// Singleton instance
export const uploadManager = new UploadManager();

// Format bytes to human readable
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Format seconds to human readable time
export function formatTime(seconds: number): string {
  if (!seconds || seconds < 0 || !isFinite(seconds)) return '--';

  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  }

  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

// Format speed
export function formatSpeed(bytesPerSecond: number): string {
  if (!bytesPerSecond || bytesPerSecond < 0) return '--';
  return formatBytes(bytesPerSecond) + '/s';
}
