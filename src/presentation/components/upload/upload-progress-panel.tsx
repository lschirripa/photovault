"use client";

import { useState, useEffect, useRef } from "react";
import type { UploadProgress } from "@/presentation/hooks/use-media-upload";
import { UploadRow } from "./upload-row";

function formatEta(seconds: number): string {
  if (seconds < 60) return `~${Math.ceil(seconds)}s left`;
  const m = Math.floor(seconds / 60);
  const s = Math.ceil(seconds % 60);
  return `~${m}m ${s.toString().padStart(2, "0")}s left`;
}

interface UploadProgressPanelProps {
  uploads: UploadProgress[];
  onRetry: (fileId: string) => void;
  onRetryAll: () => void;
  onRemove: (fileId: string) => void;
  onClear: () => void;
}

export function UploadProgressPanel({
  uploads,
  onRetry,
  onRetryAll,
  onRemove,
  onClear,
}: UploadProgressPanelProps) {
  const [expanded, setExpanded] = useState(uploads.length <= 5);
  const [, setTick] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const completedCount = uploads.filter((u) => u.status === "complete").length;
  const failedCount = uploads.filter((u) => u.status === "error").length;
  const activeUploads = uploads.filter(
    (u) => u.status === "queued" || u.status === "uploading" || u.status === "retrying" || u.status === "pending" || u.status === "processing"
  );
  const isActive = activeUploads.length > 0;

  // Compute overall progress from bytes
  const totalBytes = uploads.reduce((sum, u) => sum + (u.bytesTotal ?? 0), 0);
  const loadedBytes = uploads.reduce((sum, u) => {
    if (u.status === "complete") return sum + (u.bytesTotal ?? 0);
    return sum + (u.bytesLoaded ?? 0);
  }, 0);
  const overallProgress = totalBytes > 0 ? Math.round((loadedBytes / totalBytes) * 100) : 0;

  // ETA based on active uploads' aggregate throughput
  const eta = (() => {
    if (!isActive || totalBytes === 0) return null;
    const remaining = totalBytes - loadedBytes;
    if (remaining <= 0) return null;
    // Sum throughput across active uploads that have started
    let totalElapsed = 0;
    let totalLoaded = 0;
    for (const u of activeUploads) {
      if (u.startedAt && u.bytesLoaded) {
        totalElapsed += (Date.now() - u.startedAt) / 1000;
        totalLoaded += u.bytesLoaded;
      }
    }
    if (totalElapsed < 1 || totalLoaded === 0) return null;
    const bytesPerSec = totalLoaded / totalElapsed;
    return formatEta(remaining / bytesPerSec);
  })();

  // Tick every second for ETA updates while active
  useEffect(() => {
    if (isActive) {
      tickRef.current = setInterval(() => setTick((t) => t + 1), 1000);
    }
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [isActive]);

  // Auto-expand when <=5 uploads, auto-collapse when >5
  useEffect(() => {
    setExpanded(uploads.length <= 5);
  }, [uploads.length <= 5]); // eslint-disable-line react-hooks/exhaustive-deps

  if (uploads.length === 0) return null;

  const barColor = failedCount > 0
    ? "bg-red-500"
    : completedCount === uploads.length
      ? "bg-green-500"
      : "bg-blue-500";

  return (
    <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      {/* Overall progress bar */}
      <div className="h-2 bg-gray-100 dark:bg-gray-800">
        <div
          className={`h-full transition-all duration-300 ${barColor}`}
          style={{ width: `${overallProgress}%` }}
        />
      </div>

      {/* Summary row */}
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 flex-wrap">
          <span className="font-medium">
            {completedCount} of {uploads.length} uploaded
          </span>
          {eta && <span className="text-gray-500">{eta}</span>}
          {failedCount > 0 && (
            <span className="text-red-600 dark:text-red-400">
              {failedCount} failed
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {failedCount > 0 && (
            <button
              onClick={onRetryAll}
              className="text-xs px-2.5 py-1 rounded-md bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-800/60 font-medium"
            >
              Retry All
            </button>
          )}
          <button
            onClick={onClear}
            className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Collapsible file list */}
      {uploads.length > 1 && (
        <div className="border-t border-gray-200 dark:border-gray-800">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full px-4 py-2 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-left flex items-center gap-1"
          >
            <span className={`transition-transform ${expanded ? "rotate-90" : ""}`}>&#9654;</span>
            {expanded ? "Hide files" : "Show files"}
          </button>
          {expanded && (
            <div className="px-4 pb-3 space-y-2">
              {uploads.map((upload) => (
                <UploadRow
                  key={upload.fileId}
                  upload={upload}
                  onRetry={onRetry}
                  onRemove={onRemove}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Single upload — always show inline */}
      {uploads.length === 1 && (
        <div className="px-4 pb-3">
          <UploadRow
            upload={uploads[0]}
            onRetry={onRetry}
            onRemove={onRemove}
          />
        </div>
      )}
    </div>
  );
}
