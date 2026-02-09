"use client";

import { useState, useEffect } from "react";
import { Button } from "@/presentation/components/ui/button";
import type { AlbumResponseDTO } from "@/application/dto/album-dto";

interface AlbumFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; description: string }) => void;
  album?: AlbumResponseDTO | null;
  loading?: boolean;
}

export function AlbumFormModal({
  isOpen,
  onClose,
  onSubmit,
  album,
  loading = false,
}: AlbumFormModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const isEditing = !!album;

  useEffect(() => {
    if (album) {
      setName(album.name);
      setDescription(album.description || "");
    } else {
      setName("");
      setDescription("");
    }
  }, [album, isOpen]);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), description: description.trim() });
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !loading) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md"
      onClick={handleBackdropClick}
    >
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-md w-full mx-4 p-6 border border-gray-200/80 dark:border-gray-800/80 animate-in fade-in zoom-in-95 duration-200">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          {isEditing ? "Edit Album" : "Create Album"}
        </h2>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="album-name"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Name
              </label>
              <input
                id="album-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Album name"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                disabled={loading}
                autoFocus
              />
            </div>

            <div>
              <label
                htmlFor="album-description"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Description (optional)
              </label>
              <textarea
                id="album-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add a description..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none transition-colors"
                disabled={loading}
              />
            </div>
          </div>

          <div className="mt-6 flex gap-3 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={loading}
              disabled={!name.trim()}
            >
              {isEditing ? "Save Changes" : "Create Album"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
