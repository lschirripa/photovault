"use client";

import { useEffect, useCallback, useState } from "react";
import Image from "next/image";
import type { MediaAsset } from "@/domain/entities/media-asset";
import { cn } from "@/lib/utils";
import { MetadataPanel } from "./metadata-panel";

interface LightboxProps {
  media: MediaAsset[];
  currentIndex: number;
  mediaUrls: Map<string, string>;
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (index: number) => void;
  onDownload: (assetId: string) => void;
  onDelete?: (asset: MediaAsset) => void;
  canDelete?: (asset: MediaAsset) => boolean;
}

export function Lightbox({
  media,
  currentIndex,
  mediaUrls,
  isOpen,
  onClose,
  onNavigate,
  onDownload,
  onDelete,
  canDelete,
}: LightboxProps) {
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  const currentMedia = media[currentIndex];
  const hasNext = currentIndex < media.length - 1;
  const hasPrev = currentIndex > 0;

  const goNext = useCallback(() => {
    if (hasNext) {
      onNavigate(currentIndex + 1);
    }
  }, [hasNext, currentIndex, onNavigate]);

  const goPrev = useCallback(() => {
    if (hasPrev) {
      onNavigate(currentIndex - 1);
    }
  }, [hasPrev, currentIndex, onNavigate]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          onClose();
          break;
        case "ArrowLeft":
          goPrev();
          break;
        case "ArrowRight":
          goNext();
          break;
        case "i":
          setShowInfo((prev) => !prev);
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, goNext, goPrev]);

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

  // Touch handlers for swipe navigation
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const distance = touchStart - touchEnd;
    const minSwipeDistance = 50;

    if (distance > minSwipeDistance) {
      goNext();
    } else if (distance < -minSwipeDistance) {
      goPrev();
    }

    setTouchStart(null);
    setTouchEnd(null);
  };

  // Preload adjacent images for instant navigation
  useEffect(() => {
    if (!isOpen) return;

    const toPreload: string[] = [];
    if (hasPrev) {
      const prevUrl = mediaUrls.get(media[currentIndex - 1]?.id);
      if (prevUrl) toPreload.push(prevUrl);
    }
    if (hasNext) {
      const nextUrl = mediaUrls.get(media[currentIndex + 1]?.id);
      if (nextUrl) toPreload.push(nextUrl);
    }

    const images = toPreload.map((url) => {
      const img = new window.Image();
      img.src = url;
      return img;
    });

    // Keep references alive for the duration of the effect
    return () => {
      images.forEach((img) => { img.src = ""; });
    };
  }, [isOpen, currentIndex, media, mediaUrls, hasPrev, hasNext]);

  if (!isOpen || !currentMedia) return null;

  const originalUrl = mediaUrls.get(currentMedia.id);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex flex-col"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 text-white">
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">
            {currentIndex + 1} / {media.length}
          </span>
          <span className="text-sm truncate max-w-[200px]">
            {currentMedia.filename}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Download button */}
          <button
            onClick={() => onDownload(currentMedia.id)}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
            title="Download"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
          </button>

          {/* Info button */}
          <button
            onClick={() => setShowInfo((prev) => !prev)}
            className={cn(
              "p-2 rounded-full transition-colors",
              showInfo ? "bg-white/20 text-white" : "hover:bg-white/10 text-gray-300"
            )}
            title="Info (i)"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </button>

          {/* Delete button */}
          {onDelete && canDelete?.(currentMedia) && (
            <button
              onClick={() => onDelete(currentMedia)}
              className="p-2 hover:bg-red-600/50 rounded-full transition-colors text-red-400 hover:text-red-300"
              title="Delete"
            >
              <svg
                className="w-5 h-5"
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

          {/* Close button */}
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
            title="Close"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden">
        {/* Previous button */}
        <button
          onClick={goPrev}
          disabled={!hasPrev}
          className={cn(
            "absolute left-4 z-10 p-3 rounded-full bg-black/50 text-white transition-all",
            hasPrev
              ? "hover:bg-black/70 opacity-100"
              : "opacity-30 cursor-not-allowed"
          )}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Image/Video */}
        <div
          className={cn(
            "relative max-w-full max-h-full w-full h-full flex items-center justify-center p-4 transition-all duration-200",
            showInfo && "mr-80"
          )}
        >
          {currentMedia.mediaType === "video" ? (
            <video
              key={currentMedia.id}
              src={originalUrl}
              controls
              autoPlay
              className="max-w-full max-h-full object-contain"
            />
          ) : originalUrl ? (
            <Image
              key={currentMedia.id}
              src={originalUrl}
              alt={currentMedia.filename}
              fill
              unoptimized
              className="object-contain"
              sizes="100vw"
              priority
            />
          ) : (
            <div className="text-gray-400">Loading...</div>
          )}
        </div>

        {/* Next button */}
        <button
          onClick={goNext}
          disabled={!hasNext}
          className={cn(
            "absolute z-10 p-3 rounded-full bg-black/50 text-white transition-all",
            showInfo ? "right-[21rem]" : "right-4",
            hasNext
              ? "hover:bg-black/70 opacity-100"
              : "opacity-30 cursor-not-allowed"
          )}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Metadata panel */}
        <MetadataPanel
          asset={currentMedia}
          isOpen={showInfo}
          onClose={() => setShowInfo(false)}
        />
      </div>

      {/* Thumbnail strip */}
      <div className="p-4 overflow-x-auto">
        <div className="flex gap-2 justify-center">
          {media.map((item, index) => {
            const thumbUrl = mediaUrls.get(item.id);
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(index)}
                className={cn(
                  "w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all",
                  index === currentIndex
                    ? "border-white opacity-100"
                    : "border-transparent opacity-50 hover:opacity-75"
                )}
              >
                {thumbUrl && !(item.mediaType === "video" && !item.thumbnailKey) ? (
                  <Image
                    src={thumbUrl}
                    alt={item.filename}
                    width={64}
                    height={64}
                    unoptimized
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                    {item.mediaType === "video" ? (
                      <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    ) : null}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
