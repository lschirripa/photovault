"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/infrastructure/supabase/browser";
import { useAuth } from "@/presentation/providers/auth-provider";
import { useMediaActions } from "@/presentation/hooks/use-media-actions";
import { useMediaSelection } from "@/presentation/hooks/use-media-selection";
import { useMediaDownload, useSupportsNativeShare } from "@/presentation/hooks/use-media-download";
import { useInfiniteMedia } from "@/presentation/hooks/use-infinite-media";
import { useUrlCache } from "@/presentation/hooks/use-url-cache";
import { useMediaFilterOptions } from "@/presentation/hooks/use-media-filter-options";
import { useAlbumPersons } from "@/presentation/hooks/use-album-persons";
import { MediaFilterBar } from "@/presentation/components/gallery/media-filter-bar";
import { PersonCard } from "@/presentation/components/persons/person-card";
import type { MediaFilters, MediaSort } from "@/domain/types/media-filters";
import { DEFAULT_SORT, isFiltersActive } from "@/domain/types/media-filters";
import { ConfirmDialog } from "@/presentation/components/ui/confirm-dialog";
import { MediaGrid } from "@/presentation/components/gallery/media-grid";
import { Lightbox } from "@/presentation/components/gallery/lightbox";
import { Button } from "@/presentation/components/ui/button";
import { CoverToast } from "@/presentation/components/ui/cover-toast";
import { useGroupUpdate } from "@/presentation/hooks/use-group-update";
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
  const [selectedPersonIds, setSelectedPersonIds] = useState<string[]>([]);
  const [coverToastVisible, setCoverToastVisible] = useState(false);
  const [coverToastMessage, setCoverToastMessage] = useState("");
  const supabase = createClient();

  const { setCover: setGroupCover } = useGroupUpdate(groupId);

  const { persons: albumPersons, fetchPersons: fetchAlbumPersons, renamePerson } = useAlbumPersons({ albumId });

  // Combine explicit filters with person selection
  const combinedFilters = useMemo<MediaFilters>(() => {
    if (selectedPersonIds.length === 0) return filters;
    return { ...filters, personIds: selectedPersonIds };
  }, [filters, selectedPersonIds]);

  // Infinite media pagination for album
  const {
    media,
    loading: mediaLoading,
    loadingMore,
    hasMore,
    error: mediaError,
    loadMore,
    removeItems,
  } = useInfiniteMedia({ groupId, albumId, filters: combinedFilters, sort });

  const { locationData, hasAnyLocation, dateRange, cameraOptions, fetchLocationChildren } = useMediaFilterOptions(groupId, albumId);

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

  const { downloadSingle, downloadSelected, isDownloading } = useMediaDownload();
  const supportsNativeShare = useSupportsNativeShare();

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
      fetchAlbumPersons();
    }
  }, [user, albumId, fetchAlbumInfo, fetchAlbumPersons]);

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

  // Load more media when lightbox navigates near the end of loaded items
  useEffect(() => {
    if (lightboxIndex === null || !hasMore || loadingMore) return;
    if (lightboxIndex >= readyMedia.length - 5) {
      loadMore();
    }
  }, [lightboxIndex, readyMedia.length, hasMore, loadingMore, loadMore]);

  // Infinite scroll is handled inside MediaGrid (sentinel inside its scroll container)

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

  const handleDownloadSelected = () => {
    downloadSelected(Array.from(selectedIds));
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

      {/* People in this Album */}
      {albumPersons.length > 0 && (
        <section className="mb-6">
          <h2 className="text-lg font-semibold tracking-tight mb-3">People in this Album</h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
            {albumPersons.map((person) => (
              <PersonCard
                key={person.id}
                person={person}
                groupId={groupId}
                onRename={renamePerson}
                onDismiss={() => {}}
                selected={selectedPersonIds.includes(person.id)}
                onToggleSelect={(personId) => {
                  setSelectedPersonIds((prev) =>
                    prev.includes(personId)
                      ? prev.filter((id) => id !== personId)
                      : [...prev, personId]
                  );
                }}
              />
            ))}
          </div>
        </section>
      )}

      <MediaFilterBar
        filters={filters}
        sort={sort}
        onFiltersChange={setFilters}
        onSortChange={setSort}
        locationData={locationData}
        hasAnyLocation={hasAnyLocation}
        dateRange={dateRange}
        fetchLocationChildren={fetchLocationChildren}
        cameraOptions={cameraOptions}
      />

      {selectedPersonIds.length > 0 && (
        <div className="mb-4 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 text-sm">
            Filtering by {selectedPersonIds.length} {selectedPersonIds.length === 1 ? "person" : "people"}
            <button
              onClick={() => setSelectedPersonIds([])}
              className="ml-1 hover:text-blue-600 dark:hover:text-blue-100"
              title="Clear person filter"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        </div>
      )}

      {media.length === 0 ? (
        isFiltersActive(combinedFilters) ? (
          <div className="text-center py-12">
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              No media matches your filters
            </p>
            <button
              onClick={() => { setFilters({}); setSelectedPersonIds([]); }}
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
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={loadMore}
          />
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
                onClick={handleDownloadSelected}
                loading={isDownloading}
                disabled={selectedCount === 0 || removing}
              >
                {supportsNativeShare ? "Save" : "Download Zip"}
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
        onSetAsCover={async (assetId) => {
          const result = await setGroupCover(assetId);
          if (result) {
            setCoverToastMessage("Group cover updated");
            setCoverToastVisible(true);
          }
        }}
        onSetAsAlbumCover={async (assetId) => {
          try {
            const response = await fetch(`/api/albums/${albumId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ coverAssetId: assetId }),
            });
            if (response.ok) {
              setAlbum((prev) => prev ? { ...prev, coverAssetId: assetId, coverIsDefault: false } : prev);
              setCoverToastMessage("Album cover updated");
              setCoverToastVisible(true);
            } else {
              setCoverToastMessage("Failed to update album cover");
              setCoverToastVisible(true);
            }
          } catch {
            setCoverToastMessage("Failed to update album cover");
            setCoverToastVisible(true);
          }
        }}
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

      {/* Cover Toast */}
      <CoverToast
        message={coverToastMessage}
        visible={coverToastVisible}
        onHidden={() => setCoverToastVisible(false)}
      />
    </div>
  );
}
