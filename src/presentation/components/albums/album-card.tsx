"use client";

import Image from "next/image";
import Link from "next/link";
import type { AlbumResponseDTO } from "@/application/dto/album-dto";

interface AlbumCardProps {
  album: AlbumResponseDTO;
  coverUrl?: string | null;
  onEdit?: () => void;
  onDelete?: () => void;
  canManage?: boolean;
}

export function AlbumCard({
  album,
  coverUrl,
  onEdit,
  onDelete,
  canManage = false,
}: AlbumCardProps) {
  return (
    <div className="group relative bg-gray-100 dark:bg-gray-900 rounded-lg overflow-hidden">
      <Link href={`/groups/${album.groupId}/albums/${album.id}`}>
        <div className="aspect-square relative">
          {coverUrl ? (
            <Image
              src={coverUrl}
              alt={album.name}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-200 dark:bg-gray-800">
              <svg
                className="w-12 h-12 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
            </div>
          )}
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          {/* Album info */}
          <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
            <h3 className="font-semibold truncate">{album.name}</h3>
            <p className="text-xs text-gray-300">
              {album.mediaCount ?? 0} {album.mediaCount === 1 ? "item" : "items"}
            </p>
          </div>
        </div>
      </Link>

      {/* Action buttons on hover */}
      {canManage && (onEdit || onDelete) && (
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onEdit && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onEdit();
              }}
              className="p-1.5 bg-white/90 hover:bg-white rounded-full text-gray-700 transition-colors"
              title="Edit album"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete();
              }}
              className="p-1.5 bg-red-500 hover:bg-red-600 rounded-full text-white transition-colors"
              title="Delete album"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
