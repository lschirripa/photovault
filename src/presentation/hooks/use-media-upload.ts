"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getMediaTypeFromMime } from "@/domain/enums/media-type";
import { captureVideoFrame } from "@/presentation/utils/capture-video-frame";

// Fallback for crypto.randomUUID on older iOS browsers
function generateUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback implementation
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Detect optimal upload concurrency based on network and device
interface NetworkInformation {
  effectiveType?: "slow-2g" | "2g" | "3g" | "4g";
}

function getOptimalConcurrency(): number {
  if (typeof window === "undefined") return 3; // SSR fallback

  const conn = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  const isMobile = window.innerWidth < 768 && navigator.maxTouchPoints > 0;

  if (conn?.effectiveType) {
    if (conn.effectiveType === "2g" || conn.effectiveType === "slow-2g") return 1;
    if (conn.effectiveType === "3g") return 1;
    // 4g: use device heuristic
  }

  return isMobile ? 2 : 3;
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const STALL_TIMEOUT_MS = 30_000;
const OVERALL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const FETCH_TIMEOUT_MS = 30_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface UploadProgress {
  fileId: string;
  filename: string;
  progress: number;
  status: "queued" | "pending" | "uploading" | "processing" | "complete" | "error" | "retrying";
  retryCount: number;
  error?: string;
  bytesLoaded?: number;
  bytesTotal?: number;
  startedAt?: number;
}

interface PresignResponse {
  uploadUrl: string;
  assetId: string;
  key: string;
  expiresAt: string;
  thumbnailUploadUrl?: string;
  thumbnailKey?: string;
}

/**
 * Upload a file via XMLHttpRequest with real progress events and stall/overall timeouts.
 */
function xhrUpload(
  url: string,
  file: File,
  contentType: string,
  onProgress: (loaded: number, total: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let stallTimer: ReturnType<typeof setTimeout> | null = null;
    let overallTimer: ReturnType<typeof setTimeout> | null = null;

    function cleanup() {
      if (stallTimer) clearTimeout(stallTimer);
      if (overallTimer) clearTimeout(overallTimer);
    }

    function resetStallTimer() {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        cleanup();
        xhr.abort();
        reject(new Error("Upload stalled — no progress for 30 seconds"));
      }, STALL_TIMEOUT_MS);
    }

    // Overall timeout
    overallTimer = setTimeout(() => {
      cleanup();
      xhr.abort();
      reject(new Error("Upload timed out after 10 minutes"));
    }, OVERALL_TIMEOUT_MS);

    // Start stall timer
    resetStallTimer();

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(e.loaded, e.total);
      }
      resetStallTimer();
    };

    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error("Failed to upload file to storage"));
      }
    };

    xhr.onerror = () => {
      cleanup();
      reject(new Error("Network error during upload"));
    };

    xhr.onabort = () => {
      cleanup();
      // reject is already called by the timeout handler that triggered abort
    };

    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.send(file);
  });
}

export function useMediaUpload(groupId: string) {
  const [uploads, setUploads] = useState<Map<string, UploadProgress>>(
    new Map()
  );
  const [error, setError] = useState<string | null>(null);

  // Store file references for manual retry
  const fileMapRef = useRef<Map<string, File>>(new Map());

  // Clear all file references on unmount to prevent memory leaks
  useEffect(() => {
    const ref = fileMapRef.current;
    return () => {
      ref.clear();
    };
  }, []);

  // Safety net: purge file refs for completed/errored uploads every 30 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      for (const [fileId] of fileMapRef.current) {
        const upload = uploads.get(fileId);
        if (!upload || upload.status === "complete" || upload.status === "error") {
          fileMapRef.current.delete(fileId);
        }
      }
    }, 30 * 60 * 1000);

    return () => clearInterval(interval);
  }, [uploads]);

  const updateUpload = useCallback(
    (fileId: string, updates: Partial<UploadProgress>) => {
      setUploads((prev) => {
        const current = prev.get(fileId);
        if (!current) return prev;
        const next = new Map(prev);
        next.set(fileId, { ...current, ...updates });
        return next;
      });
    },
    []
  );

  const uploadFile = useCallback(
    async (file: File, existingFileId?: string): Promise<string> => {
      const fileId = existingFileId || generateUUID();

      // On iOS, file.type might be empty - try to infer from extension
      let fileToUpload = file;
      let mediaType = getMediaTypeFromMime(file.type);

      if (!mediaType) {
        const ext = file.name.split(".").pop()?.toLowerCase();
        const extToMime: Record<string, string> = {
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          png: "image/png",
          gif: "image/gif",
          webp: "image/webp",
          heic: "image/heic",
          heif: "image/heif",
          mp4: "video/mp4",
          mov: "video/quicktime",
          webm: "video/webm",
        };
        const inferredType = ext ? extToMime[ext] : null;
        if (inferredType) {
          // Create a new file with the correct type
          fileToUpload = new File([file], file.name, { type: inferredType });
          mediaType = getMediaTypeFromMime(inferredType);
        }
      }

      if (!mediaType) {
        throw new Error(`Unsupported file type: ${file.type || "unknown"}`);
      }

      // Store file reference for potential retry
      fileMapRef.current.set(fileId, file);

      const startedAt = Date.now();

      setUploads((prev) => {
        const next = new Map(prev);
        next.set(fileId, {
          fileId,
          filename: file.name,
          progress: 0,
          status: "pending",
          retryCount: 0,
          bytesLoaded: 0,
          bytesTotal: file.size,
          startedAt,
        });
        return next;
      });

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          if (attempt > 0) {
            updateUpload(fileId, {
              status: "retrying",
              retryCount: attempt,
              progress: 0,
              bytesLoaded: 0,
              startedAt: Date.now(),
            });
            await delay(BASE_DELAY_MS * Math.pow(2, attempt - 1));
          }

          // 1. Get presigned URL (0-5%)
          updateUpload(fileId, { status: "uploading", progress: 2 });

          const presignController = new AbortController();
          const presignTimeout = setTimeout(
            () => presignController.abort(),
            FETCH_TIMEOUT_MS
          );

          let presignResponse: Response;
          try {
            presignResponse = await fetch("/api/media/presign", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                groupId,
                filename: fileToUpload.name,
                contentType: fileToUpload.type,
                sizeBytes: fileToUpload.size,
              }),
              signal: presignController.signal,
            });
          } finally {
            clearTimeout(presignTimeout);
          }

          if (!presignResponse.ok) {
            const errorData = await presignResponse.json();
            throw new Error(errorData.error || "Failed to get upload URL");
          }

          const presignData: PresignResponse = await presignResponse.json();

          updateUpload(fileId, { progress: 5 });

          // 2. Upload to R2 via XHR (5-90%)
          await xhrUpload(
            presignData.uploadUrl,
            fileToUpload,
            fileToUpload.type,
            (loaded, total) => {
              const xhrFraction = total > 0 ? loaded / total : 0;
              const mappedProgress = Math.round(5 + xhrFraction * 85);
              updateUpload(fileId, {
                progress: mappedProgress,
                bytesLoaded: loaded,
                bytesTotal: total,
              });
            }
          );

          // 2b. For videos, capture a thumbnail frame and upload it
          let uploadedThumbnailKey: string | undefined;
          if (
            mediaType === "video" &&
            presignData.thumbnailUploadUrl &&
            presignData.thumbnailKey
          ) {
            try {
              const frameBlob = await captureVideoFrame(fileToUpload);
              if (frameBlob) {
                const thumbResp = await fetch(presignData.thumbnailUploadUrl, {
                  method: "PUT",
                  headers: { "Content-Type": "image/jpeg" },
                  body: frameBlob,
                });
                if (thumbResp.ok) {
                  uploadedThumbnailKey = presignData.thumbnailKey;
                }
              }
            } catch (thumbErr) {
              console.warn(
                `Video thumbnail capture failed for ${file.name}:`,
                thumbErr instanceof Error ? thumbErr.message : thumbErr
              );
            }
          }

          // 3. Confirm upload (90-95%)
          updateUpload(fileId, { status: "processing", progress: 90 });

          const confirmController = new AbortController();
          const confirmTimeout = setTimeout(
            () => confirmController.abort(),
            FETCH_TIMEOUT_MS
          );

          let confirmResponse: Response;
          try {
            confirmResponse = await fetch("/api/media/confirm", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                assetId: presignData.assetId,
                thumbnailKey: uploadedThumbnailKey,
              }),
              signal: confirmController.signal,
            });
          } finally {
            clearTimeout(confirmTimeout);
          }

          if (!confirmResponse.ok) {
            const errorData = await confirmResponse.json();
            throw new Error(errorData.error || "Failed to confirm upload");
          }

          updateUpload(fileId, {
            status: "complete",
            progress: 100,
            bytesLoaded: fileToUpload.size,
          });

          // Clean up file reference after successful upload
          fileMapRef.current.delete(fileId);

          return presignData.assetId;
        } catch (err) {
          if (attempt === MAX_RETRIES) {
            const message =
              err instanceof Error ? err.message : "Upload failed";
            updateUpload(fileId, { status: "error", error: message });
            // Clear file reference after max retries to prevent memory leak
            fileMapRef.current.delete(fileId);
            throw err;
          }
          // Will retry on next iteration
        }
      }

      // Should never reach here, but satisfy TypeScript
      throw new Error("Upload failed");
    },
    [groupId, updateUpload]
  );

  const uploadFiles = useCallback(
    async (files: File[]): Promise<string[]> => {
      setError(null);
      const results: string[] = [];
      const concurrencyLimit = getOptimalConcurrency();

      // Pre-seed all files into the uploads map so total count is accurate
      const fileIds = files.map(() => generateUUID());
      setUploads((prev) => {
        const next = new Map(prev);
        files.forEach((file, idx) => {
          next.set(fileIds[idx], {
            fileId: fileIds[idx],
            filename: file.name,
            progress: 0,
            status: "queued",
            retryCount: 0,
            bytesLoaded: 0,
            bytesTotal: file.size,
          });
          fileMapRef.current.set(fileIds[idx], file);
        });
        return next;
      });

      // Process files in batches of `concurrencyLimit`
      for (let i = 0; i < files.length; i += concurrencyLimit) {
        const batch = files.slice(i, i + concurrencyLimit);
        const batchFileIds = fileIds.slice(i, i + concurrencyLimit);
        const batchResults = await Promise.allSettled(
          batch.map((file, idx) => uploadFile(file, batchFileIds[idx]))
        );

        for (const result of batchResults) {
          if (result.status === "fulfilled") {
            results.push(result.value);
          } else {
            const message =
              result.reason instanceof Error
                ? result.reason.message
                : "Upload failed";
            setError(message);
          }
        }
      }

      return results;
    },
    [uploadFile]
  );

  /**
   * Pre-seed upload entries for a known batch of files before they are
   * available as File objects (e.g. Google Drive imports). Returns the
   * pre-assigned file IDs so callers can pass them to uploadFile() later.
   */
  const preSeedFiles = useCallback(
    (fileInfos: Array<{ name: string; sizeBytes: number }>): string[] => {
      const fileIds = fileInfos.map(() => generateUUID());
      setUploads((prev) => {
        const next = new Map(prev);
        fileInfos.forEach((info, idx) => {
          next.set(fileIds[idx], {
            fileId: fileIds[idx],
            filename: info.name,
            progress: 0,
            status: "queued",
            retryCount: 0,
            bytesLoaded: 0,
            bytesTotal: info.sizeBytes,
          });
        });
        return next;
      });
      return fileIds;
    },
    []
  );

  /**
   * Mark a pre-seeded entry as errored (e.g. when a Drive download fails
   * before uploadFile is ever called).
   */
  const markUploadError = useCallback(
    (fileId: string, message: string) => {
      updateUpload(fileId, { status: "error", error: message });
    },
    [updateUpload]
  );

  const retryUpload = useCallback(
    async (fileId: string): Promise<void> => {
      const file = fileMapRef.current.get(fileId);
      if (!file) {
        updateUpload(fileId, {
          status: "error",
          error: "File reference lost — please re-select the file",
        });
        return;
      }
      try {
        await uploadFile(file, fileId);
      } catch {
        // Error state is already set by uploadFile
      }
    },
    [uploadFile, updateUpload]
  );

  const retryAllFailed = useCallback(async () => {
    const failedUploads = Array.from(uploads.values()).filter(
      (u) => u.status === "error"
    );
    await Promise.allSettled(
      failedUploads.map((u) => retryUpload(u.fileId))
    );
  }, [uploads, retryUpload]);

  const isUploading = useMemo(() => {
    return Array.from(uploads.values()).some(
      (u) =>
        u.status === "queued" ||
        u.status === "pending" ||
        u.status === "uploading" ||
        u.status === "processing" ||
        u.status === "retrying"
    );
  }, [uploads]);

  const clearUploads = useCallback(() => {
    setUploads(new Map());
    setError(null);
    fileMapRef.current.clear();
  }, []);

  const removeUpload = useCallback((fileId: string) => {
    setUploads((prev) => {
      const next = new Map(prev);
      next.delete(fileId);
      return next;
    });
    fileMapRef.current.delete(fileId);
  }, []);

  return {
    uploads: Array.from(uploads.values()),
    error,
    isUploading,
    uploadFile,
    uploadFiles,
    preSeedFiles,
    markUploadError,
    retryUpload,
    retryAllFailed,
    clearUploads,
    removeUpload,
  };
}
