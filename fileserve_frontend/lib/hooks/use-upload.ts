/**
 * React hooks for upload management
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { uploadManager, UploadItem } from '../upload-manager';

// Hook to access upload state
export function useUploadQueue() {
  const [items, setItems] = useState<UploadItem[]>([]);
  const restoredRef = useRef(false);

  useEffect(() => {
    const unsubscribe = uploadManager.subscribe(setItems);

    // Restore incomplete sessions on first mount
    if (!restoredRef.current) {
      restoredRef.current = true;
      uploadManager.restoreSessions().catch(() => {
        // Ignore errors during session restoration
      });
    }

    return unsubscribe;
  }, []);

  const addFiles = useCallback((files: File[], targetPath: string, zoneId?: string) => {
    return uploadManager.addFiles(files, targetPath, zoneId);
  }, []);

  const pause = useCallback((id: string) => uploadManager.pause(id), []);
  const resume = useCallback((id: string) => uploadManager.resume(id), []);
  const cancel = useCallback((id: string) => uploadManager.cancel(id), []);
  const retry = useCallback((id: string) => {
    uploadManager.retry(id).catch(() => {
      // Error handling is done inside retry()
    });
  }, []);
  const remove = useCallback((id: string) => uploadManager.remove(id), []);
  const clearCompleted = useCallback(() => uploadManager.clearCompleted(), []);
  const restoreSessions = useCallback(() => uploadManager.restoreSessions(), []);

  const stats = uploadManager.getStats();
  const overallProgress = uploadManager.getOverallProgress();

  return {
    items,
    addFiles,
    pause,
    resume,
    cancel,
    retry,
    remove,
    clearCompleted,
    restoreSessions,
    stats,
    overallProgress,
    hasActiveUploads: stats.uploading > 0 || stats.queued > 0,
    hasItems: stats.total > 0,
  };
}

// Hook to check if there are active uploads (for preventing navigation)
export function useHasActiveUploads(): boolean {
  const [hasActive, setHasActive] = useState(false);

  useEffect(() => {
    return uploadManager.subscribe((items) => {
      const active = items.some(item =>
        item.status === 'uploading' || item.status === 'queued'
      );
      setHasActive(active);
    });
  }, []);

  return hasActive;
}

// Hook to subscribe to upload completion events
export function useUploadComplete(callback: (item: UploadItem) => void) {
  useEffect(() => {
    return uploadManager.onComplete(callback);
  }, [callback]);
}
