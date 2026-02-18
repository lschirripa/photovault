"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import Image from "next/image";
import type { MediaAsset } from "@/domain/entities/media-asset";
import { cn } from "@/lib/utils";

interface MediaGridProps {
  media: MediaAsset[];
  mediaUrls: Map<string, string>;
  selectionMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onMediaClick: (index: number) => void;
  onDeleteClick?: (asset: MediaAsset) => void;
  canDelete?: (asset: MediaAsset) => boolean;
  deletingId?: string | null;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}

/** Match the Tailwind breakpoints: grid-cols-2 sm:3 md:4 lg:5 */
function getColumnCount(width: number): number {
  if (width >= 1024) return 5;
  if (width >= 768) return 4;
  if (width >= 640) return 3;
  return 2;
}

function getGap(width: number): number {
  return width < 768 ? 12 : 8;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function MediaGrid({
  media,
  mediaUrls,
  selectionMode,
  selectedIds,
  onToggleSelect,
  onMediaClick,
  onDeleteClick,
  canDelete,
  deletingId,
  hasMore,
  loadingMore,
  onLoadMore,
}: MediaGridProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(2);
  const [gap, setGap] = useState(12);

  // Track container width for column count and responsive gap
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0].contentRect.width;
      setColumns(getColumnCount(width));
      setGap(getGap(width));
    });
    observer.observe(el);
    // Set initial value
    setColumns(getColumnCount(el.clientWidth));
    setGap(getGap(el.clientWidth));
    return () => observer.disconnect();
  }, []);

  const rowCount = Math.ceil(media.length / columns);
  // Each row is a square cell: height = (containerWidth - gaps) / columns
  const estimateSize = useCallback(() => {
    const width = parentRef.current?.clientWidth ?? 300;
    return Math.floor((width - gap * (columns - 1)) / columns);
  }, [columns, gap]);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize,
    gap,
    overscan: 3,
  });

  // Invalidate virtualizer cache when layout changes
  useEffect(() => {
    virtualizer.measure();
  }, [columns, gap, virtualizer]);

  // Infinite scroll: observe sentinel inside this scroll container
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sentinelRef.current || !parentRef.current || !onLoadMore) return;
    if (!hasMore || loadingMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          onLoadMore();
        }
      },
      { root: parentRef.current, rootMargin: "200px" }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onLoadMore]);

  return (
    <div
      ref={parentRef}
      className="w-full overflow-y-auto"
      style={{ height: "calc(100vh - 280px)", minHeight: 200 }}
    >
      <div
        className="w-full relative"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const startIdx = virtualRow.index * columns;
          const rowItems = media.slice(startIdx, startIdx + columns);

          return (
            <div
              key={virtualRow.key}
              className="absolute left-0 right-0 grid"
              style={{
                top: virtualRow.start,
                height: virtualRow.size,
                gridTemplateColumns: `repeat(${columns}, 1fr)`,
                gap: `${gap}px`,
              }}
            >
              {rowItems.map((item, colIdx) => {
                const flatIndex = startIdx + colIdx;
                const isSelected = selectedIds.has(item.id);
                const url = mediaUrls.get(item.id);
                const isReady = item.status === "ready";

                return (
                  <div
                    key={item.id}
                    className={cn(
                      "aspect-square bg-gray-100 dark:bg-gray-900 rounded-xl overflow-hidden relative group cursor-pointer transition-shadow duration-200 hover:shadow-lg",
                      isSelected && "ring-2 ring-inset ring-blue-500"
                    )}
                    onClick={() => {
                      if (selectionMode) {
                        onToggleSelect(item.id);
                      } else if (isReady) {
                        onMediaClick(flatIndex);
                      }
                    }}
                  >
                    {isReady && url ? (
                      <>
                        {item.mediaType === "video" && !item.thumbnailKey ? (
                          /* Video without thumbnail — styled placeholder */
                          <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900 flex flex-col items-center justify-center gap-1 p-2">
                            <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            <span className="text-[10px] text-gray-500 truncate max-w-full">{item.filename}</span>
                          </div>
                        ) : (
                          <Image
                            src={url}
                            alt={item.filename}
                            fill
                            unoptimized
                            className="object-cover animate-fade-in"
                            sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
                          />
                        )}

                        {/* Selection checkbox */}
                        {selectionMode && (
                          <div
                            className={cn(
                              "absolute top-2 left-2 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors",
                              isSelected
                                ? "bg-blue-500 border-blue-500 text-white"
                                : "bg-white/80 border-gray-400"
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleSelect(item.id);
                            }}
                          >
                            {isSelected && (
                              <svg
                                className="w-4 h-4"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            )}
                          </div>
                        )}

                        {/* Hover overlay with actions */}
                        {!selectionMode && (
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-start justify-end p-2 opacity-0 group-hover:opacity-100">
                            {canDelete?.(item) && onDeleteClick && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteClick(item);
                                }}
                                disabled={deletingId === item.id}
                                className="p-1.5 bg-red-600 hover:bg-red-700 rounded-full text-white transition-colors"
                                title="Delete"
                              >
                                <svg
                                  className="w-4 h-4"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
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
                      </>
                    ) : isReady ? (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-xs text-gray-500">Loading...</span>
                      </div>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                        <span className="text-xs text-gray-500 capitalize">
                          {item.status}
                        </span>
                        {(item.status === "uploading" ||
                          item.status === "failed") &&
                          canDelete?.(item) &&
                          onDeleteClick && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteClick(item);
                              }}
                              className="text-xs text-red-500 hover:text-red-700"
                            >
                              Remove
                            </button>
                          )}
                      </div>
                    )}

                    {/* Video play icon overlay */}
                    {item.mediaType === "video" && isReady && (
                      <>
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center">
                            <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M6.5 5.5v9l7-4.5-7-4.5z" />
                            </svg>
                          </div>
                        </div>
                        {item.durationSeconds != null && (
                          <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1 rounded pointer-events-none">
                            {formatDuration(item.durationSeconds)}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      {/* Infinite scroll sentinel — inside the scroll container */}
      {onLoadMore && <div ref={sentinelRef} className="h-4" />}
      {loadingMore && (
        <div className="flex justify-center py-4">
          <p className="text-sm text-gray-500">Loading more...</p>
        </div>
      )}
    </div>
  );
}
