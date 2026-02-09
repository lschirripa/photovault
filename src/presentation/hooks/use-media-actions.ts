"use client";

import { useState, useCallback } from "react";

interface UseMediaActionsOptions {
  onDeleteSuccess?: (assetId: string) => void;
  onDeleteError?: (error: string) => void;
}

export function useMediaActions(options: UseMediaActionsOptions = {}) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const deleteMedia = useCallback(
    async (assetId: string): Promise<boolean> => {
      setDeletingId(assetId);

      try {
        const response = await fetch(`/api/media/${assetId}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to delete media");
        }

        options.onDeleteSuccess?.(assetId);
        return true;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to delete media";
        options.onDeleteError?.(message);
        return false;
      } finally {
        setDeletingId(null);
      }
    },
    [options]
  );

  return {
    deleteMedia,
    deletingId,
    isDeleting: deletingId !== null,
  };
}
