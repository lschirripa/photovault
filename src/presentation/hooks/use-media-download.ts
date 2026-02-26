"use client";

import { useState, useCallback, useEffect } from "react";

// Feature detection for Web Share API with file support.
// Must only be called on the client (never during SSR).
function canShareFiles(): boolean {
  if (typeof navigator === "undefined") return false;
  if (!navigator.canShare) return false;
  try {
    const testFile = new File([""], "test.png", { type: "image/png" });
    return navigator.canShare({ files: [testFile] });
  } catch {
    return false;
  }
}

// Hook for UI components — evaluates after mount so it works with SSR.
export function useSupportsNativeShare(): boolean {
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    setSupported(canShareFiles());
  }, []);
  return supported;
}

function triggerAnchorDownload(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

function parseFilenameFromResponse(response: Response, fallback: string): string {
  const contentDisposition = response.headers.get("Content-Disposition");
  if (contentDisposition) {
    const match = contentDisposition.match(/filename="?([^"]+)"?/);
    if (match) {
      return decodeURIComponent(match[1]);
    }
  }
  return fallback;
}

export function useMediaDownload() {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const downloadSingle = useCallback(async (assetId: string) => {
    setIsDownloading(true);
    setDownloadError(null);

    try {
      const response = await fetch(`/api/media/download?assetId=${assetId}`);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Download failed");
      }

      const blob = await response.blob();
      const filename = parseFilenameFromResponse(response, "download");
      const mimeType = response.headers.get("Content-Type") || "application/octet-stream";

      // Callbacks only run on click (always client-side), so canShareFiles() is safe here
      if (canShareFiles()) {
        try {
          const file = new File([blob], filename, { type: mimeType });
          await navigator.share({ files: [file] });
          return;
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") return;
          // Share failed — fall back to anchor download
        }
      }

      triggerAnchorDownload(blob, filename);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Download failed";
      setDownloadError(message);
    } finally {
      setIsDownloading(false);
    }
  }, []);

  const downloadZip = useCallback(async (assetIds: string[]) => {
    if (assetIds.length === 0) return;

    setIsDownloading(true);
    setDownloadError(null);

    try {
      const response = await fetch("/api/media/download-zip", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ assetIds }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Download failed");
      }

      const blob = await response.blob();
      const filename = parseFilenameFromResponse(response, "photovault_download.zip");
      triggerAnchorDownload(blob, filename);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Download failed";
      setDownloadError(message);
    } finally {
      setIsDownloading(false);
    }
  }, []);

  const downloadSelected = useCallback(async (assetIds: string[]) => {
    if (assetIds.length === 0) return;

    if (!canShareFiles()) {
      return downloadZip(assetIds);
    }

    setIsDownloading(true);
    setDownloadError(null);

    try {
      // Fetch files with concurrency limit of 3
      const CONCURRENCY = 3;
      const files: File[] = [];
      let i = 0;

      while (i < assetIds.length) {
        const batch = assetIds.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
          batch.map(async (assetId) => {
            const response = await fetch(`/api/media/download?assetId=${assetId}`);
            if (!response.ok) throw new Error("Download failed");
            const blob = await response.blob();
            const filename = parseFilenameFromResponse(response, "download");
            const mimeType = response.headers.get("Content-Type") || "application/octet-stream";
            return new File([blob], filename, { type: mimeType });
          })
        );
        files.push(...results);
        i += CONCURRENCY;
      }

      try {
        await navigator.share({ files });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        // Share failed — fall back to zip download
      }

      // Fallback: download as zip
      setIsDownloading(false);
      return downloadZip(assetIds);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Download failed";
      setDownloadError(message);
    } finally {
      setIsDownloading(false);
    }
  }, [downloadZip]);

  return {
    downloadSingle,
    downloadSelected,
    downloadZip,
    isDownloading,
    downloadError,
    clearError: () => setDownloadError(null),
  };
}
