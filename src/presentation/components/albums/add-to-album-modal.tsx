"use client";

import { useState, useEffect } from "react";
import { Button } from "@/presentation/components/ui/button";
import type { AlbumResponseDTO } from "@/application/dto/album-dto";

interface AddToAlbumModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddToAlbum: (albumId: string) => void;
  onCreateNew: () => void;
  albums: AlbumResponseDTO[];
  selectedCount: number;
  loading?: boolean;
}

export function AddToAlbumModal({
  isOpen,
  onClose,
  onAddToAlbum,
  onCreateNew,
  albums,
  selectedCount,
  loading = false,
}: AddToAlbumModalProps) {
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setSelectedAlbumId(null);
    }
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !loading) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, loading]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !loading) {
      onClose();
    }
  };

  const handleSubmit = () => {
    if (selectedAlbumId) {
      onAddToAlbum(selectedAlbumId);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-md w-full mx-4 p-6 animate-in fade-in zoom-in-95 duration-200">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Add to Album
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Add {selectedCount} {selectedCount === 1 ? "item" : "items"} to an album
        </p>

        {albums.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              No albums yet
            </p>
            <Button variant="primary" onClick={onCreateNew} disabled={loading}>
              Create First Album
            </Button>
          </div>
        ) : (
          <>
            <div className="max-h-64 overflow-y-auto space-y-2 mb-4">
              {albums.map((album) => (
                <button
                  key={album.id}
                  onClick={() => setSelectedAlbumId(album.id)}
                  disabled={loading}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedAlbumId === album.id
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                      : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                  }`}
                >
                  <div className="font-medium text-gray-900 dark:text-white">
                    {album.name}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {album.mediaCount ?? 0} {album.mediaCount === 1 ? "item" : "items"}
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={onCreateNew}
              disabled={loading}
              className="w-full text-left p-3 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 text-gray-600 dark:text-gray-400 transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create New Album
            </button>
          </>
        )}

        <div className="mt-6 flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          {albums.length > 0 && (
            <Button
              variant="primary"
              onClick={handleSubmit}
              loading={loading}
              disabled={!selectedAlbumId}
            >
              Add to Album
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
