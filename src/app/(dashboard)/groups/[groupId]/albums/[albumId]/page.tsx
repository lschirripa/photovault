"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/infrastructure/supabase/browser";
import { useAuth } from "@/presentation/providers/auth-provider";
import { useMediaActions } from "@/presentation/hooks/use-media-actions";
import { useMediaSelection } from "@/presentation/hooks/use-media-selection";
import { useMediaDownload } from "@/presentation/hooks/use-media-download";
import { useInfiniteMedia } from "@/presentation/hooks/use-infinite-media";
import { useUrlCache } from "@/presentation/hooks/use-url-cache";
import { useMediaFilterOptions } from "@/presentation/hooks/use-media-filter-options";
import { MediaFilterBar } from "@/presentation/components/gallery/media-filter-bar";
import type { MediaFilters, MediaSort } from "@/domain/types/media-filters";
import { DEFAULT_SORT, isFiltersActive } from "@/domain/types/media-filters";
import { ConfirmDialog } from "@/presentation/components/ui/confirm-dialog";
import { MediaGrid } from "@/presentation/components/gallery/media-grid";
import { Lightbox } from "@/presentation/components/gallery/lightbox";
import { Button } from "@/presentation/components/ui/button";
import type { MediaAsset } from "@/domain/entities/media-asset";
import type { AlbumResponseDTO } from "@/application/dto/album-dto";
import { MemberRole, hasPermission } from "@/domain/enums/member-role";

export default function AlbumDetailPage() {
  const params = useParams();
  const groupId = params.groupId as string;
  const albumId = params.albumId as string;
  const { user, loading: authLoading } = useAuth();
  const [album, setAlbum] = useState<AlbumResponseDTO | null>(null);
  const [albumLoading, setAlbumLoading] = useState(true);
  const [albumError, setAlbumError] = useState<string | null>(null);
  const [mediaUrls, setMediaUrls] = useState<Map<string, string>>(new Map());
  const [originalUrls, setOriginalUrls] = useState<Map<string, string>>(new Map());
  const [userRole, setUserRole] = useState<MemberRole | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MediaAsset | null>(null);
  const [bulkRemoveConfirm, setBulkRemoveConfirm] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [filters, setFilters] = useState<MediaFilters>({});
  const [sort, setSort] = useState<MediaSort>(DEFAULT_SORT);
  const supabase = createClient();

  // Infinite media pagination for album
  const {
    media,
    loading: mediaLoading,
    loadingMore,
    hasMore,
    error: mediaError,
    loadMore,
    removeItems,
  } = useInfiniteMedia({ groupId, albumId, filters, sort });

  const { cameras, locationData, hasAnyLocation, dateRange, fetchLocationChildren } = useMediaFilterOptions(groupId, albumId);

  const readyMedia = useMemo(
    () => media.filter((m) => m.status === "ready"),
    [media]
  );
  const readyMediaIds = useMemo(
    () => readyMedia.map((m) => m.id),
    [readyMedia]
  );

  const {
    selectedIds,
    selectionMode,
    selectedCount,
    toggleSelect,
    selectAll,
    deselectAll,
    enterSelectionMode,
    exitSelectionMode,
  } = useMediaSelection(readyMediaIds);

  const { downloadSingle, downloadZip, isDownloading } = useMediaDownload();

  const { deleteMedia, deletingId } = useMediaActions({
    onDeleteSuccess: (assetId) => {
      removeItems([assetId]);
      setDeleteTarget(null);
    },
    onDeleteError: (error) => {
      console.error("Delete error:", error);
      setDeleteTarget(null);
    },
  });

  const [removing, setRemoving] = useState(false);

  // Fetch album info and user role only (media comes from useInfiniteMedia)
  const fetchAlbumInfo = useCallback(async () => {
    setAlbumLoading(true);
    setAlbumError(null);

    try {
      const albumResponse = await fetch(`/api/albums/${albumId}`);
      if (!albumResponse.ok) {
        throw new Error("Album not found");
      }
      const albumData: AlbumResponseDTO = await albumResponse.json();
      setAlbum(albumData);

      const { data: { user: authUser } } = await supabase.auth.getUser();
      const { data: memberData } = (await supabase
        .from("group_members")
        .select("role")
        .eq("group_id", groupId)
        .eq("user_id", authUser?.id ?? "")
        .single()) as unknown as { data: { role: string } | null; error: Error | null };

      if (memberData) {
        setUserRole(memberData.role as MemberRole);
      }
    } catch (err) {
      setAlbumError(err instanceof Error ? err.message : "Failed to load album");
    } finally {
      setAlbumLoading(false);
    }
  }, [albumId, groupId, supabase]);

  const { fetchUrl: fetchMediaUrl, fetchUrls: fetchBatchUrls } = useUrlCache();

  const canDeleteMedia = useCallback(
    (mediaItem: MediaAsset): boolean => {
      if (!user) return false;
      if (mediaItem.uploadedBy === user.id) return true;
      if (userRole && hasPermission(userRole, MemberRole.ADMIN)) return true;
      return false;
    },
    [user, userRole]
  );

  const canManageAlbum = useMemo(() => {
    if (!user || !album) return false;
    if (album.createdBy === user.id) return true;
    if (userRole && hasPermission(userRole, MemberRole.ADMIN)) return true;
    return false;
  }, [user, album, userRole]);

  useEffect(() => {
    if (user && albumId) {
      fetchAlbumInfo();
    }
  }, [user, albumId, fetchAlbumInfo]);

  // Fetch thumbnail URLs in batch (cache handles dedup/TTL)
  useEffect(() => {
    const readyIds = media
      .filter((m) => m.status === "ready")
      .map((m) => m.id);

    if (readyIds.length === 0) return;

    fetchBatchUrls(readyIds, "thumbnail").then((urls) => {
      setMediaUrls((prev) => {
        const next = new Map(prev);
        for (const [id, url] of Object.entries(urls)) {
          next.set(id, url);
        }
        return next;
      });
    });
  }, [media, fetchBatchUrls]);

  useEffect(() => {
    if (lightboxIndex !== null && readyMedia[lightboxIndex]) {
      const currentItem = readyMedia[lightboxIndex];
      if (!originalUrls.has(currentItem.id)) {
        fetchMediaUrl(currentItem.id, "original").then((url) => {
          if (url) {
            setOriginalUrls((prev) => new Map(prev).set(currentItem.id, url));
          }
        });
      }
    }
  }, [lightboxIndex, readyMedia, originalUrls, fetchMediaUrl]);

  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadMore();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loadMore]);

  const handleRemoveFromAlbum = async (mediaIds: string[]) => {
    setRemoving(true);
    try {
      const response = await fetch(`/api/albums/${albumId}/media`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaIds }),
      });

      if (!response.ok) {
        throw new Error("Failed to remove from album");
      }

      removeItems(mediaIds);
      setBulkRemoveConfirm(false);
      exitSelectionMode();
    } catch (err) {
      console.error("Remove from album error:", err);
    } finally {
      setRemoving(false);
    }
  };

  const handleMediaClick = useCallback((index: number) => {
    setLightboxIndex(index);
  }, []);

  const handleDownloadZip = () => {
    downloadZip(Array.from(selectedIds));
  };

  const lightboxUrls = useMemo(() => {
    const combined = new Map<string, string>();
    for (const [id, url] of originalUrls) {
      combined.set(id, url);
    }
    for (const [id, url] of mediaUrls) {
      if (!combined.has(id)) {
        combined.set(id, url);
      }
    }
    return combined;
  }, [mediaUrls, originalUrls]);

  const loading = albumLoading || (mediaLoading && media.length === 0);
  const error = albumError || mediaError;

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="mb-4">Please sign in</p>
          <Link href="/signin" className="text-blue-600 hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  if (error || !album) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || "Album not found"}</p>
          <Link href={`/groups/${groupId}`} className="text-blue-600 hover:underline">
            Back to group
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen p-4 sm:p-8 ${selectionMode ? "pb-24" : ""}`}>
      <header className="mb-8">
        <Link
          href={`/groups/${groupId}`}
          className="text-sm text-gray-600 dark:text-gray-400 hover:underline mb-2 inline-block"
        >
          &larr; Back to group
        </Link>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold">{album.name}</h1>
            {album.description && (
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                {album.description}
              </p>
            )}
            <p className="text-sm text-gray-500 mt-2">
              {media.length} {media.length === 1 ? "item" : "items"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {readyMedia.length > 0 && !selectionMode && (
              <Button variant="outline" size="sm" onClick={enterSelectionMode}>
                Select
              </Button>
            )}
          </div>
        </div>
      </header>

      <MediaFilterBar
        filters={filters}
        sort={sort}
        onFiltersChange={setFilters}
        onSortChange={setSort}
        cameras={cameras}
        locationData={locationData}
        hasAnyLocation={hasAnyLocation}
        dateRange={dateRange}
        fetchLocationChildren={fetchLocationChildren}
      />

      {media.length === 0 ? (
        isFiltersActive(filters) ? (
          <div className="text-center py-12">
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              No media matches your filters
            </p>
            <button
              onClick={() => setFilters({})}
              className="text-blue-600 hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              No photos in this album yet
            </p>
            <Link
              href={`/groups/${groupId}`}
              className="text-blue-600 hover:underline"
            >
              Go back to add photos
            </Link>
          </div>
        )
      ) : (
        <>
          <MediaGrid
            media={media}
            mediaUrls={mediaUrls}
            selectionMode={selectionMode}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onMediaClick={handleMediaClick}
            onDeleteClick={setDeleteTarget}
            canDelete={canDeleteMedia}
            deletingId={deletingId}
          />
          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-4" />
          {loadingMore && (
            <div className="flex justify-center py-4">
              <p className="text-sm text-gray-500">Loading more...</p>
            </div>
          )}
        </>
      )}

      {/* Selection Toolbar - modified for album context */}
      {selectionMode && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 shadow-lg animate-in slide-in-from-bottom duration-200">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium">{selectedCount} selected</span>
              <button
                onClick={selectedCount === readyMedia.length ? deselectAll : selectAll}
                className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
              >
                {selectedCount === readyMedia.length ? "Deselect All" : "Select All"}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={exitSelectionMode}>
                Cancel
              </Button>
              {canManageAlbum && selectedCount > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setBulkRemoveConfirm(true)}
                  disabled={removing || isDownloading}
                >
                  Remove from Album
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                onClick={handleDownloadZip}
                loading={isDownloading}
                disabled={selectedCount === 0 || removing}
              >
                Download Zip
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      <Lightbox
        media={readyMedia}
        currentIndex={lightboxIndex ?? 0}
        mediaUrls={lightboxUrls}
        isOpen={lightboxIndex !== null}
        onClose={() => setLightboxIndex(null)}
        onNavigate={setLightboxIndex}
        onDownload={downloadSingle}
        onDelete={setDeleteTarget}
        canDelete={canDeleteMedia}
        groupId={groupId}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMedia(deleteTarget.id)}
        title="Delete Photo"
        message={`Are you sure you want to delete "${deleteTarget?.filename}"? This will permanently delete the photo from the group, not just this album.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        loading={deletingId !== null}
      />

      {/* Remove from Album Confirmation */}
      <ConfirmDialog
        isOpen={bulkRemoveConfirm}
        onClose={() => setBulkRemoveConfirm(false)}
        onConfirm={() => handleRemoveFromAlbum(Array.from(selectedIds))}
        title="Remove from Album"
        message={`Remove ${selectedCount} ${selectedCount === 1 ? "item" : "items"} from this album? The photos will remain in the group.`}
        confirmLabel="Remove"
        cancelLabel="Cancel"
        variant="primary"
        loading={removing}
      />
    </div>
  );
}
