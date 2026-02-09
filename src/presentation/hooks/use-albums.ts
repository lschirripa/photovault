"use client";

import { useState, useCallback } from "react";
import type { AlbumResponseDTO } from "@/application/dto/album-dto";

interface UseAlbumsOptions {
  groupId: string;
}

export function useAlbums({ groupId }: UseAlbumsOptions) {
  const [albums, setAlbums] = useState<AlbumResponseDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAlbums = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/albums?groupId=${groupId}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to fetch albums");
      }

      const data = await response.json();
      setAlbums(data.albums);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch albums");
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  const createAlbum = useCallback(
    async (name: string, description?: string): Promise<AlbumResponseDTO | null> => {
      try {
        const response = await fetch("/api/albums", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ groupId, name, description }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to create album");
        }

        const album = await response.json();
        setAlbums((prev) => [album, ...prev]);
        return album;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create album");
        return null;
      }
    },
    [groupId]
  );

  const updateAlbum = useCallback(
    async (
      albumId: string,
      updates: { name?: string; description?: string | null }
    ): Promise<boolean> => {
      try {
        const response = await fetch(`/api/albums/${albumId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to update album");
        }

        const updated = await response.json();
        setAlbums((prev) =>
          prev.map((a) => (a.id === albumId ? { ...a, ...updated } : a))
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update album");
        return false;
      }
    },
    []
  );

  const deleteAlbum = useCallback(async (albumId: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/albums/${albumId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete album");
      }

      setAlbums((prev) => prev.filter((a) => a.id !== albumId));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete album");
      return false;
    }
  }, []);

  const addMediaToAlbum = useCallback(
    async (albumId: string, mediaIds: string[]): Promise<boolean> => {
      try {
        const response = await fetch(`/api/albums/${albumId}/media`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mediaIds }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to add media to album");
        }

        // Update media count
        setAlbums((prev) =>
          prev.map((a) =>
            a.id === albumId
              ? { ...a, mediaCount: (a.mediaCount || 0) + mediaIds.length }
              : a
          )
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add media");
        return false;
      }
    },
    []
  );

  const removeMediaFromAlbum = useCallback(
    async (albumId: string, mediaIds: string[]): Promise<boolean> => {
      try {
        const response = await fetch(`/api/albums/${albumId}/media`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mediaIds }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to remove media from album");
        }

        // Update media count
        setAlbums((prev) =>
          prev.map((a) =>
            a.id === albumId
              ? { ...a, mediaCount: Math.max(0, (a.mediaCount || 0) - mediaIds.length) }
              : a
          )
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to remove media");
        return false;
      }
    },
    []
  );

  return {
    albums,
    loading,
    error,
    fetchAlbums,
    createAlbum,
    updateAlbum,
    deleteAlbum,
    addMediaToAlbum,
    removeMediaFromAlbum,
    clearError: () => setError(null),
  };
}
