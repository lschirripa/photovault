"use client";

import { useState, useCallback } from "react";

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

      // Get the blob and trigger download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      // Get filename from Content-Disposition header or use default
      const contentDisposition = response.headers.get("Content-Disposition");
      let filename = "download";
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match) {
          filename = decodeURIComponent(match[1]);
        }
      }

      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
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

      // Get the blob and trigger download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      // Get filename from Content-Disposition header or use default
      const contentDisposition = response.headers.get("Content-Disposition");
      let filename = "photovault_download.zip";
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match) {
          filename = match[1];
        }
      }

      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Download failed";
      setDownloadError(message);
    } finally {
      setIsDownloading(false);
    }
  }, []);

  return {
    downloadSingle,
    downloadZip,
    isDownloading,
    downloadError,
    clearError: () => setDownloadError(null),
  };
}
