'use client';

import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  X,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Upload,
  Loader2,
  Clock,
  Minimize2,
  Maximize2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useUploadQueue } from '@/lib/hooks/use-upload';
import { formatBytes, formatTime, formatSpeed, UploadItem, UploadStatus } from '@/lib/upload-manager';

// Status badge component
function StatusBadge({ status }: { status: UploadStatus }) {
  const config: Record<UploadStatus, { icon: React.ReactNode; label: string; className: string }> = {
    queued: {
      icon: <Clock className="h-3 w-3" />,
      label: 'Queued',
      className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    },
    uploading: {
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
      label: 'Uploading',
      className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    },
    paused: {
      icon: <Pause className="h-3 w-3" />,
      label: 'Paused',
      className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
    },
    completed: {
      icon: <CheckCircle2 className="h-3 w-3" />,
      label: 'Complete',
      className: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    },
    error: {
      icon: <AlertCircle className="h-3 w-3" />,
      label: 'Failed',
      className: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    },
    cancelled: {
      icon: <X className="h-3 w-3" />,
      label: 'Cancelled',
      className: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
    },
  };

  const { icon, label, className } = config[status];

  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', className)}>
      {icon}
      {label}
    </span>
  );
}

// Single upload item row
function UploadItemRow({ item, onPause, onResume, onCancel, onRetry, onRemove }: {
  item: UploadItem;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const isActive = item.status === 'uploading';
  const canPause = item.status === 'uploading';
  const canResume = item.status === 'paused';
  const canRetry = item.status === 'error' || item.status === 'cancelled';
  const canCancel = item.status === 'uploading' || item.status === 'queued' || item.status === 'paused';
  const canRemove = ['completed', 'error', 'cancelled'].includes(item.status);

  return (
    <div className="px-3 py-2 hover:bg-muted/50 transition-colors">
      <div className="flex items-start gap-3">
        {/* File icon */}
        <div className="flex-shrink-0 mt-0.5">
          <div className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center",
            isActive ? "bg-blue-100 dark:bg-blue-900" : "bg-muted"
          )}>
            <Upload className={cn(
              "h-4 w-4",
              isActive ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"
            )} />
          </div>
        </div>

        {/* File info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium truncate max-w-[280px]">{item.fileName}</p>
            <StatusBadge status={item.status} />
          </div>

          {/* Progress bar for active/paused uploads */}
          {(isActive || item.status === 'paused') && (
            <div className="mt-2">
              <Progress value={item.progress} className="h-1.5" />
            </div>
          )}

          {/* Stats row */}
          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
            {/* Size info */}
            <span>
              {formatBytes(item.uploadedBytes)} / {formatBytes(item.fileSize)}
            </span>

            {/* Speed (only when uploading) */}
            {isActive && item.speed > 0 && (
              <>
                <span className="text-muted-foreground/50">|</span>
                <span>{formatSpeed(item.speed)}</span>
              </>
            )}

            {/* ETA (only when uploading) */}
            {isActive && item.eta > 0 && (
              <>
                <span className="text-muted-foreground/50">|</span>
                <span>{formatTime(item.eta)} left</span>
              </>
            )}

            {/* Chunks info for chunked uploads */}
            {item.totalChunks && item.totalChunks > 1 && (
              <>
                <span className="text-muted-foreground/50">|</span>
                <span>Chunk {item.uploadedChunks || 0}/{item.totalChunks}</span>
              </>
            )}

            {/* Duration for completed uploads */}
            {item.status === 'completed' && item.startTime && item.endTime && (
              <>
                <span className="text-muted-foreground/50">|</span>
                <span className="text-green-600 dark:text-green-400">
                  {formatTime(Math.round((item.endTime - item.startTime) / 1000))}
                  {' '}@ {formatSpeed(item.fileSize / ((item.endTime - item.startTime) / 1000))} avg
                </span>
              </>
            )}

            {/* Error message */}
            {item.status === 'error' && item.error && (
              <span className="text-red-500 truncate">{item.error}</span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {canPause && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onPause(item.id)}
              title="Pause"
            >
              <Pause className="h-3.5 w-3.5" />
            </Button>
          )}

          {canResume && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onResume(item.id)}
              title="Resume"
            >
              <Play className="h-3.5 w-3.5" />
            </Button>
          )}

          {canRetry && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onRetry(item.id)}
              title="Retry"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          )}

          {canCancel && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-500/20"
              onClick={() => onCancel(item.id)}
              title="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}

          {canRemove && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onRemove(item.id)}
              title="Remove"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// Main upload queue panel
export function UploadQueuePanel() {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const {
    items,
    pause,
    resume,
    cancel,
    retry,
    remove,
    clearCompleted,
    stats,
    overallProgress,
    hasItems,
    hasActiveUploads,
  } = useUploadQueue();

  // Don't render if no items
  if (!hasItems) return null;

  const activeItems = items.filter(i => i.status === 'uploading' || i.status === 'queued');
  const completedItems = items.filter(i => i.status === 'completed');
  const failedItems = items.filter(i => i.status === 'error' || i.status === 'cancelled');

  return (
    <div className={cn(
      "fixed bottom-4 right-4 z-50 bg-background border rounded-lg shadow-lg transition-all duration-200",
      isMinimized ? "w-72" : "w-[520px]"
    )}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b bg-muted/50 rounded-t-lg cursor-pointer"
        onClick={() => !isMinimized && setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          {hasActiveUploads ? (
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
          ) : stats.failed > 0 ? (
            <AlertCircle className="h-4 w-4 text-red-500" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          )}
          <span className="text-sm font-medium">
            {hasActiveUploads
              ? `Uploading ${stats.uploading + stats.queued} file${stats.uploading + stats.queued !== 1 ? 's' : ''}`
              : stats.failed > 0
                ? `${stats.failed} failed`
                : `${stats.completed} completed`}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Clear completed button - always visible when there are completed/failed items */}
          {(completedItems.length > 0 || failedItems.length > 0) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                clearCompleted();
              }}
              title="Clear completed and failed uploads"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Clear
            </Button>
          )}
          {!isMinimized && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronUp className="h-4 w-4" />
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              setIsMinimized(!isMinimized);
            }}
          >
            {isMinimized ? (
              <Maximize2 className="h-3.5 w-3.5" />
            ) : (
              <Minimize2 className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Minimized view - just show overall progress */}
      {isMinimized && (
        <div className="px-3 py-2">
          <Progress value={overallProgress.percent} className="h-1.5" />
          <div className="flex items-center justify-between mt-1.5 text-xs text-muted-foreground">
            <span>{Math.round(overallProgress.percent)}%</span>
            <span>{formatBytes(overallProgress.uploadedBytes)} / {formatBytes(overallProgress.totalBytes)}</span>
          </div>
        </div>
      )}

      {/* Expanded content */}
      {!isMinimized && isExpanded && (
        <>
          {/* Overall progress bar */}
          {hasActiveUploads && (
            <div className="px-3 py-2 border-b bg-muted/30">
              <div className="flex items-center justify-between mb-1.5 text-xs">
                <span className="text-muted-foreground">Overall Progress</span>
                <span className="font-medium">{Math.round(overallProgress.percent)}%</span>
              </div>
              <Progress value={overallProgress.percent} className="h-2" />
              <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
                <span>{formatBytes(overallProgress.uploadedBytes)} / {formatBytes(overallProgress.totalBytes)}</span>
                <span>{stats.uploading} active, {stats.queued} queued</span>
              </div>
            </div>
          )}

          {/* Upload items list */}
          <ScrollArea className="max-h-72">
            <div className="divide-y">
              {/* Active/Queued uploads first */}
              {activeItems.map(item => (
                <UploadItemRow
                  key={item.id}
                  item={item}
                  onPause={pause}
                  onResume={resume}
                  onCancel={cancel}
                  onRetry={retry}
                  onRemove={remove}
                />
              ))}

              {/* Failed uploads */}
              {failedItems.map(item => (
                <UploadItemRow
                  key={item.id}
                  item={item}
                  onPause={pause}
                  onResume={resume}
                  onCancel={cancel}
                  onRetry={retry}
                  onRemove={remove}
                />
              ))}

              {/* Completed uploads */}
              {completedItems.map(item => (
                <UploadItemRow
                  key={item.id}
                  item={item}
                  onPause={pause}
                  onResume={resume}
                  onCancel={cancel}
                  onRetry={retry}
                  onRemove={remove}
                />
              ))}
            </div>
          </ScrollArea>
        </>
      )}
    </div>
  );
}
