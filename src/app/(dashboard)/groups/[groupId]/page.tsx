"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/infrastructure/supabase/browser";
import { useAuth } from "@/presentation/providers/auth-provider";
import { useMediaUpload } from "@/presentation/hooks/use-media-upload";
import type { UploadProgress } from "@/presentation/hooks/use-media-upload";
import { formatBytes } from "@/lib/utils";
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
import { useAlbums } from "@/presentation/hooks/use-albums";
import { AlbumCard } from "@/presentation/components/albums/album-card";
import { AlbumFormModal } from "@/presentation/components/albums/album-form-modal";
import { AddToAlbumModal } from "@/presentation/components/albums/add-to-album-modal";
import { InviteModal } from "@/presentation/components/groups/invite-modal";
import { useInvites } from "@/presentation/hooks/use-invites";
import { usePersons } from "@/presentation/hooks/use-persons";
import { PersonCard } from "@/presentation/components/persons/person-card";
import type { Group } from "@/domain/entities/group";
import type { MediaAsset } from "@/domain/entities/media-asset";
import type { AlbumResponseDTO } from "@/application/dto/album-dto";
import { MediaStatus } from "@/domain/enums/media-type";
import { MemberRole, hasPermission } from "@/domain/enums/member-role";
import type { Tables } from "@/types/supabase";

function getUploadSpeed(upload: UploadProgress): string | null {
  if (!upload.startedAt || !upload.bytesLoaded || upload.status !== "uploading") return null;
  const elapsed = (Date.now() - upload.startedAt) / 1000;
  if (elapsed < 1) return null;
  const bytesPerSec = upload.bytesLoaded / elapsed;
  return `${formatBytes(bytesPerSec)}/s`;
}

function UploadRow({
  upload,
  onRetry,
  onRemove,
}: {
  upload: UploadProgress;
  onRetry: (fileId: string) => void;
  onRemove: (fileId: string) => void;
}) {
  const isActive = upload.status === "uploading" || upload.status === "retrying";
  const isError = upload.status === "error";
  const isComplete = upload.status === "complete";
  const speed = getUploadSpeed(upload);

  const barColor = isError
    ? "bg-red-500"
    : isComplete
      ? "bg-green-500"
      : upload.status === "retrying"
        ? "bg-yellow-500"
        : "bg-blue-500";

  const statusIcon = isError
    ? "\u26A0" // warning
    : isComplete
      ? "\u2713" // checkmark
      : upload.status === "retrying"
        ? "\u21BB" // retry arrow
        : null; // spinner handled via CSS

  return (
    <div
      className={`relative overflow-hidden rounded-xl ${
        isError ? "bg-red-50 dark:bg-red-900/20" : "bg-gray-50 dark:bg-gray-900"
      }`}
    >
      {/* Progress bar */}
      <div
        className={`absolute bottom-0 left-0 h-1 transition-all duration-300 ${barColor}`}
        style={{ width: `${upload.progress}%` }}
      />
      <div className="flex items-center gap-3 p-3">
        {/* Status icon */}
        <span className="flex-shrink-0 w-5 text-center">
          {statusIcon ? (
            <span className={isError ? "text-red-500" : isComplete ? "text-green-600" : "text-yellow-500"}>
              {statusIcon}
            </span>
          ) : (
            <span className="inline-block w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          )}
        </span>

        {/* Filename + details */}
        <div className="flex-1 min-w-0">
          <div className="truncate text-sm font-medium">{upload.filename}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2 mt-0.5">
            {isError ? (
              <span className="text-red-600 dark:text-red-400">{upload.error || "Failed"}</span>
            ) : (
              <>
                {upload.bytesLoaded != null && upload.bytesTotal != null && upload.bytesTotal > 0 && (
                  <span>{formatBytes(upload.bytesLoaded)} / {formatBytes(upload.bytesTotal)}</span>
                )}
                {speed && <span>{speed}</span>}
                {isActive && upload.retryCount > 0 && (
                  <span>Retry {upload.retryCount}/{3}</span>
                )}
                {upload.status === "processing" && <span>Processing...</span>}
                {upload.status === "pending" && <span>Waiting...</span>}
              </>
            )}
          </div>
        </div>

        {/* Progress percentage */}
        {!isError && !isComplete && (
          <span className="text-sm tabular-nums text-gray-500 flex-shrink-0">{upload.progress}%</span>
        )}

        {/* Retry button for errors */}
        {isError && (
          <button
            onClick={() => onRetry(upload.fileId)}
            className="text-xs px-2 py-1 rounded bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-800/60 flex-shrink-0"
          >
            Retry
          </button>
        )}

        {/* Dismiss */}
        <button
          onClick={() => onRemove(upload.fileId)}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 flex-shrink-0"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export default function GroupDetailPage() {
  const params = useParams();
  const groupId = params.groupId as string;
  const { user, loading: authLoading } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [groupLoading, setGroupLoading] = useState(true);
  const [groupError, setGroupError] = useState<string | null>(null);
  const { uploads, uploadFiles, retryUpload, removeUpload, clearUploads } = useMediaUpload(groupId);
  const [mediaUrls, setMediaUrls] = useState<Map<string, string>>(new Map());
  const [originalUrls, setOriginalUrls] = useState<Map<string, string>>(new Map());
  const [userRole, setUserRole] = useState<MemberRole | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MediaAsset | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [showAlbumForm, setShowAlbumForm] = useState(false);
  const [editingAlbum, setEditingAlbum] = useState<AlbumResponseDTO | null>(null);
  const [showAddToAlbum, setShowAddToAlbum] = useState(false);
  const [albumCoverUrls, setAlbumCoverUrls] = useState<Map<string, string>>(new Map());
  const [albumToDelete, setAlbumToDelete] = useState<AlbumResponseDTO | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [filters, setFilters] = useState<MediaFilters>({});
  const [sort, setSort] = useState<MediaSort>(DEFAULT_SORT);
  const [selectedPersonIds, setSelectedPersonIds] = useState<string[]>([]);
  const supabase = createClient();

  // Combine explicit filters with person selection
  const combinedFilters = useMemo<MediaFilters>(() => {
    if (selectedPersonIds.length === 0) return filters;
    return { ...filters, personIds: selectedPersonIds };
  }, [filters, selectedPersonIds]);

  // Infinite media pagination
  const {
    media,
    loading: mediaLoading,
    loadingMore,
    hasMore,
    error: mediaError,
    loadMore,
    refresh: refreshMedia,
    removeItems,
    updateItems,
  } = useInfiniteMedia({ groupId, filters: combinedFilters, sort });

  const { cameras, locationData, hasAnyLocation, dateRange, fetchLocationChildren } = useMediaFilterOptions(groupId);

  const {
    invites,
    loading: invitesLoading,
    fetchInvites,
    createInvite,
    revokeInvite,
  } = useInvites({ groupId });

  // Check if user is admin/owner
  const isAdmin = useMemo(() => {
    return userRole && hasPermission(userRole, MemberRole.ADMIN);
  }, [userRole]);

  const {
    albums,
    loading: _albumsLoading,
    fetchAlbums,
    createAlbum,
    updateAlbum,
    deleteAlbum,
    addMediaToAlbum,
  } = useAlbums({ groupId });

  const {
    persons,
    fetchPersons,
    renamePerson,
    dismissPerson,
  } = usePersons({ groupId });

  // Filter ready media for selection
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
      // If in lightbox, adjust index
      if (lightboxIndex !== null) {
        const currentMedia = readyMedia[lightboxIndex];
        if (currentMedia?.id === assetId) {
          if (readyMedia.length <= 1) {
            setLightboxIndex(null);
          } else if (lightboxIndex >= readyMedia.length - 1) {
            setLightboxIndex(lightboxIndex - 1);
          }
        }
      }
    },
    onDeleteError: (error) => {
      console.error("Delete error:", error);
      setDeleteTarget(null);
    },
  });

  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Fetch group info and user role (no longer fetches media)
  const fetchGroup = useCallback(async () => {
    setGroupLoading(true);
    setGroupError(null);

    try {
      const { data: groupData, error: groupErr } = (await supabase
        .from("groups")
        .select("*")
        .eq("id", groupId)
        .single()) as unknown as { data: Tables<"groups"> | null; error: Error | null };

      if (groupErr) throw groupErr;
      if (!groupData) throw new Error("Group not found");

      setGroup({
        id: groupData.id,
        name: groupData.name,
        description: groupData.description,
        coverImageUrl: groupData.cover_image_url,
        createdBy: groupData.created_by,
        createdAt: new Date(groupData.created_at),
        updatedAt: new Date(groupData.updated_at),
      });

      // Fetch user's role in the group
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
      setGroupError(err instanceof Error ? err.message : "Failed to load group");
    } finally {
      setGroupLoading(false);
    }
  }, [groupId, supabase]);

  const { fetchUrl: fetchMediaUrl, fetchUrls: fetchBatchUrls } = useUrlCache();

  // Check if user can delete a specific media item
  const canDeleteMedia = useCallback(
    (mediaItem: MediaAsset): boolean => {
      if (!user) return false;
      if (mediaItem.uploadedBy === user.id) return true;
      if (userRole && hasPermission(userRole, MemberRole.ADMIN)) return true;
      return false;
    },
    [user, userRole]
  );

  // Check if user can delete any selected items
  const canDeleteSelected = useMemo(() => {
    if (!user) return false;
    return Array.from(selectedIds).some((id) => {
      const item = media.find((m) => m.id === id);
      return item && canDeleteMedia(item);
    });
  }, [user, selectedIds, media, canDeleteMedia]);

  useEffect(() => {
    if (user && groupId) {
      fetchGroup();
      fetchAlbums();
      fetchPersons();
    }
  }, [user, groupId, fetchGroup, fetchAlbums, fetchPersons]);

  // Fetch invites when modal opens (for admins)
  useEffect(() => {
    if (showInviteModal && isAdmin) {
      fetchInvites();
    }
  }, [showInviteModal, isAdmin, fetchInvites]);

  // Fetch album cover URLs in batch (cache handles dedup/TTL)
  useEffect(() => {
    const albumsWithCovers = albums.filter((a) => a.coverAssetId);
    if (albumsWithCovers.length === 0) return;

    const assetIds = albumsWithCovers.map((a) => a.coverAssetId!);
    const assetToAlbum = new Map<string, string>();
    for (const a of albumsWithCovers) {
      assetToAlbum.set(a.coverAssetId!, a.id);
    }

    fetchBatchUrls(assetIds, "thumbnail").then((urls) => {
      setAlbumCoverUrls((prev) => {
        const next = new Map(prev);
        for (const [assetId, url] of Object.entries(urls)) {
          const albumId = assetToAlbum.get(assetId);
          if (albumId) next.set(albumId, url);
        }
        return next;
      });
    });
  }, [albums, fetchBatchUrls]);

  // Fetch thumbnail URLs for ready media in batch (cache handles dedup/TTL)
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

  // Poll for processing media to become ready
  useEffect(() => {
    const processingMedia = media.filter((m) => m.status === "processing");
    if (processingMedia.length === 0) return;

    const pollInterval = setInterval(async () => {
      const processingIds = processingMedia.map((m) => m.id);

      const { data: updatedMedia } = (await supabase
        .from("media_assets")
        .select("id, status, thumbnail_key")
        .in("id", processingIds)) as unknown as {
        data: { id: string; status: string; thumbnail_key: string | null }[] | null;
        error: Error | null;
      };

      if (updatedMedia && updatedMedia.length > 0) {
        const changed = updatedMedia
          .filter((u) => {
            const existing = media.find((m) => m.id === u.id);
            return existing && (u.status !== existing.status || u.thumbnail_key !== existing.thumbnailKey);
          })
          .map((u) => ({
            id: u.id,
            status: u.status as MediaStatus,
            thumbnailKey: u.thumbnail_key,
          }));

        if (changed.length > 0) {
          updateItems(changed);
        }
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [media, supabase, updateItems]);

  // Fetch original URL when opening lightbox
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

  // Infinite scroll: IntersectionObserver on sentinel element
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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    e.target.value = "";

    await uploadFiles(fileArray);
    refreshMedia();
  };

  const handleMediaClick = useCallback((index: number) => {
    setLightboxIndex(index);
  }, []);

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    const idsToDelete = Array.from(selectedIds).filter((id) => {
      const item = media.find((m) => m.id === id);
      return item && canDeleteMedia(item);
    });

    for (const id of idsToDelete) {
      await deleteMedia(id);
    }

    setBulkDeleting(false);
    setBulkDeleteConfirm(false);
    exitSelectionMode();
  };

  const handleDownloadZip = () => {
    downloadZip(Array.from(selectedIds));
  };

  const [albumFormLoading, setAlbumFormLoading] = useState(false);

  const handleCreateAlbum = async (data: { name: string; description: string }) => {
    setAlbumFormLoading(true);
    const album = await createAlbum(data.name, data.description);
    setAlbumFormLoading(false);
    if (album) {
      setShowAlbumForm(false);
    }
  };

  const handleUpdateAlbum = async (data: { name: string; description: string }) => {
    if (!editingAlbum) return;
    setAlbumFormLoading(true);
    await updateAlbum(editingAlbum.id, { name: data.name, description: data.description });
    setAlbumFormLoading(false);
    setEditingAlbum(null);
  };

  const handleDeleteAlbum = async () => {
    if (!albumToDelete) return;
    await deleteAlbum(albumToDelete.id);
    setAlbumToDelete(null);
  };

  const [addingToAlbum, setAddingToAlbum] = useState(false);

  const handleAddToAlbum = async (albumId: string) => {
    setAddingToAlbum(true);
    await addMediaToAlbum(albumId, Array.from(selectedIds));
    setAddingToAlbum(false);
    setShowAddToAlbum(false);
    exitSelectionMode();
  };

  // Combine thumbnail and original URLs for lightbox
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

  const loading = groupLoading || (mediaLoading && media.length === 0);
  const error = groupError || mediaError;

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

  if (error || !group) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || "Group not found"}</p>
          <Link href="/groups" className="text-blue-600 hover:underline">
            Back to groups
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen p-4 sm:p-8 ${selectionMode ? "pb-24" : ""}`}>
      <header className="mb-8">
        <Link
          href="/groups"
          className="text-sm text-gray-600 dark:text-gray-400 hover:underline mb-2 inline-block"
        >
          &larr; Back to groups
        </Link>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{group.name}</h1>
            {group.description && (
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                {group.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={() => setShowInviteModal(true)}>
                Invite
              </Button>
            )}
            {readyMedia.length > 0 && !selectionMode && (
              <Button variant="outline" size="sm" onClick={enterSelectionMode}>
                Select
              </Button>
            )}
            <label className="relative px-4 py-2 bg-foreground text-background rounded-lg shadow-sm hover:shadow-md hover:brightness-90 cursor-pointer text-sm font-medium overflow-hidden transition-all duration-200">
              Upload
              <input
                type="file"
                multiple
                accept="image/*,video/*,.heic,.heif"
                onChange={handleFileSelect}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </label>
          </div>
        </div>
      </header>

      {/* Albums Section */}
      <section className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold tracking-tight">Albums</h2>
          <Button variant="outline" size="sm" onClick={() => setShowAlbumForm(true)}>
            New Album
          </Button>
        </div>
        {albums.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No albums yet. Create one to organize your photos.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 sm:gap-3">
            {albums.map((album) => (
              <AlbumCard
                key={album.id}
                album={album}
                coverUrl={albumCoverUrls.get(album.id)}
                canManage={
                  user?.id === album.createdBy ||
                  !!(userRole && hasPermission(userRole, MemberRole.ADMIN))
                }
                onEdit={() => setEditingAlbum(album)}
                onDelete={() => setAlbumToDelete(album)}
              />
            ))}
          </div>
        )}
      </section>

      {/* People Section */}
      {persons.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold tracking-tight mb-4">People</h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
            {persons.map((person) => (
              <PersonCard
                key={person.id}
                person={person}
                groupId={groupId}
                onRename={renamePerson}
                onDismiss={dismissPerson}
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

      {/* Photos Section */}
      <section>
        <h2 className="text-lg font-semibold tracking-tight mb-4">All Photos</h2>

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

      {uploads.length > 0 && (
        <div className="mb-6 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">Uploads</span>
            <button
              onClick={clearUploads}
              className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              Clear all
            </button>
          </div>
          {uploads.map((upload) => (
            <UploadRow
              key={upload.fileId}
              upload={upload}
              onRetry={retryUpload}
              onRemove={removeUpload}
            />
          ))}
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
              No photos or videos yet
            </p>
            <label className="relative text-blue-600 hover:underline cursor-pointer">
              Upload your first photo
              <input
                type="file"
                multiple
                accept="image/*,video/*,.heic,.heif"
                onChange={handleFileSelect}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </label>
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
      </section>

      {/* Selection Toolbar - Extended with Add to Album */}
      {selectionMode && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border-t border-gray-200 dark:border-gray-800 shadow-lg animate-in slide-in-from-bottom duration-200 pb-[env(safe-area-inset-bottom)]">
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
              {selectedCount > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowAddToAlbum(true)}
                  disabled={isDownloading || bulkDeleting}
                >
                  Add to Album
                </Button>
              )}
              {canDeleteSelected && selectedCount > 0 && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setBulkDeleteConfirm(true)}
                  loading={bulkDeleting}
                  disabled={isDownloading}
                >
                  Delete
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                onClick={handleDownloadZip}
                loading={isDownloading}
                disabled={selectedCount === 0 || bulkDeleting}
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

      {/* Single Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteTarget !== null && !bulkDeleteConfirm}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMedia(deleteTarget.id)}
        title="Delete Photo"
        message={`Are you sure you want to delete "${deleteTarget?.filename}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        loading={deletingId !== null}
      />

      {/* Bulk Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={bulkDeleteConfirm}
        onClose={() => setBulkDeleteConfirm(false)}
        onConfirm={handleBulkDelete}
        title="Delete Selected Photos"
        message={`Are you sure you want to delete ${selectedCount} selected item(s)? This action cannot be undone.`}
        confirmLabel={`Delete ${selectedCount}`}
        cancelLabel="Cancel"
        variant="danger"
        loading={bulkDeleting}
      />

      {/* Album Form Modal */}
      <AlbumFormModal
        isOpen={showAlbumForm || editingAlbum !== null}
        onClose={() => {
          setShowAlbumForm(false);
          setEditingAlbum(null);
        }}
        onSubmit={editingAlbum ? handleUpdateAlbum : handleCreateAlbum}
        album={editingAlbum}
        loading={albumFormLoading}
      />

      {/* Add to Album Modal */}
      <AddToAlbumModal
        isOpen={showAddToAlbum}
        onClose={() => setShowAddToAlbum(false)}
        onAddToAlbum={handleAddToAlbum}
        onCreateNew={() => {
          setShowAddToAlbum(false);
          setShowAlbumForm(true);
        }}
        albums={albums}
        selectedCount={selectedCount}
        loading={addingToAlbum}
      />

      {/* Delete Album Confirmation */}
      <ConfirmDialog
        isOpen={albumToDelete !== null}
        onClose={() => setAlbumToDelete(null)}
        onConfirm={handleDeleteAlbum}
        title="Delete Album"
        message={`Are you sure you want to delete the album "${albumToDelete?.name}"? The photos will remain in the group.`}
        confirmLabel="Delete Album"
        cancelLabel="Cancel"
        variant="danger"
      />

      {/* Invite Modal */}
      <InviteModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        groupId={groupId}
        invites={invites}
        onCreateInvite={async (options) => {
          await createInvite(options);
        }}
        onRevokeInvite={async (inviteId) => {
          await revokeInvite(inviteId);
        }}
        loading={invitesLoading}
      />
    </div>
  );
}
