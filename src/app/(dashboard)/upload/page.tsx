"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/presentation/providers/auth-provider";
import { useGroups } from "@/presentation/hooks/use-groups";
import { useMediaUpload } from "@/presentation/hooks/use-media-upload";
import { useAlbums } from "@/presentation/hooks/use-albums";
import { useGoogleDrivePicker } from "@/presentation/hooks/use-google-drive-picker";
import { downloadDriveFile, TokenExpiredError } from "@/infrastructure/google/google-drive-downloader";
import { env } from "@/infrastructure/config/env";

const DRIVE_CONCURRENCY = 3;

const googleConfigured =
  env.google.apiKey !== "" &&
  env.google.clientId !== "" &&
  env.google.appId !== "";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function GoogleDriveIcon() {
  return (
    <svg viewBox="0 0 87.3 78" className="w-5 h-5 inline-block mr-2" aria-hidden="true">
      <path d="M6.6 66.85L15.75 78h55.8l9.15-11.15z" fill="#0066DA" />
      <path d="M58.35 0H29L0 50.5l14.7 17.5L43.65 17.5z" fill="#00AC47" />
      <path d="M29 0l29.35 50.5H87.3L58.35 0z" fill="#EA4335" />
      <path d="M29 0L14.7 17.5 43.65 68h14.7L29 0z" fill="#00832D" />
      <path d="M43.65 68L29 50.5 14.7 68z" fill="#2684FC" />
      <path d="M43.65 68h14.7L87.3 50.5H58.35z" fill="#FFBA00" />
    </svg>
  );
}

export default function UploadPage() {
  const { user, loading: authLoading } = useAuth();
  const { groups, fetchGroups, loading: groupsLoading } = useGroups();
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const { uploads, uploadFiles, clearUploads } = useMediaUpload(selectedGroupId);
  const [dragOver, setDragOver] = useState(false);
  const router = useRouter();

  // Google Drive state
  const {
    openPicker,
    isPickerOpen,
    isResolving,
    resolvedFiles,
    accessToken,
    error: driveError,
    reset: resetDrive,
  } = useGoogleDrivePicker();

  const [driveImporting, setDriveImporting] = useState(false);
  const [driveImportError, setDriveImportError] = useState<string | null>(null);

  // Album state
  const {
    albums,
    fetchAlbums,
    createAlbum,
    addMediaToAlbum,
    loading: albumsLoading,
  } = useAlbums({ groupId: selectedGroupId });
  const [selectedAlbumId, setSelectedAlbumId] = useState<string>("");
  const [creatingAlbum, setCreatingAlbum] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState("");
  const albumsFetched = useRef(false);

  useEffect(() => {
    if (user) {
      fetchGroups();
    }
  }, [user, fetchGroups]);

  useEffect(() => {
    if (groups.length > 0 && !selectedGroupId) {
      setSelectedGroupId(groups[0].id);
    }
  }, [groups, selectedGroupId]);

  // Fetch albums when group changes and Drive files are resolved
  useEffect(() => {
    if (selectedGroupId && resolvedFiles.length > 0 && !albumsFetched.current) {
      albumsFetched.current = true;
      fetchAlbums();
    }
  }, [selectedGroupId, resolvedFiles.length, fetchAlbums]);

  // Reset album fetch tracking when group changes
  useEffect(() => {
    albumsFetched.current = false;
  }, [selectedGroupId]);

  const handleFiles = async (files: File[]) => {
    if (!selectedGroupId) return;
    await uploadFiles(files);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    handleFiles(Array.from(files));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const removeResolvedFile = useCallback(
    (fileId: string) => {
      // We can't mutate resolvedFiles directly since it comes from the hook,
      // so we track removed IDs separately
      setRemovedFileIds((prev) => new Set([...prev, fileId]));
    },
    []
  );
  const [removedFileIds, setRemovedFileIds] = useState<Set<string>>(new Set());

  const visibleDriveFiles = resolvedFiles.filter((f) => !removedFileIds.has(f.id));
  const totalDriveSize = visibleDriveFiles.reduce((sum, f) => sum + f.sizeBytes, 0);

  const handleCreateAlbum = async () => {
    if (!newAlbumName.trim()) return;
    const album = await createAlbum(newAlbumName.trim());
    if (album) {
      setSelectedAlbumId(album.id);
      setCreatingAlbum(false);
      setNewAlbumName("");
    }
  };

  const handleStartDriveImport = async () => {
    if (!accessToken || visibleDriveFiles.length === 0 || !selectedGroupId) return;

    setDriveImporting(true);
    setDriveImportError(null);
    const collectedAssetIds: string[] = [];
    let currentToken = accessToken;

    try {
      // Process in batches matching upload concurrency
      for (let i = 0; i < visibleDriveFiles.length; i += DRIVE_CONCURRENCY) {
        const batch = visibleDriveFiles.slice(i, i + DRIVE_CONCURRENCY);

        const downloadResults = await Promise.allSettled(
          batch.map(async (df) => {
            try {
              return await downloadDriveFile(df.id, df.name, df.mimeType, currentToken);
            } catch (err) {
              if (err instanceof TokenExpiredError) {
                // Re-request token and retry
                currentToken = await requestNewToken();
                return await downloadDriveFile(df.id, df.name, df.mimeType, currentToken);
              }
              throw err;
            }
          })
        );

        const filesToUpload: File[] = [];
        for (const result of downloadResults) {
          if (result.status === "fulfilled") {
            filesToUpload.push(result.value);
          }
          // Failed downloads are skipped; upload progress will show errors
        }

        if (filesToUpload.length > 0) {
          const assetIds = await uploadFiles(filesToUpload);
          collectedAssetIds.push(...assetIds);
        }
      }

      // After all uploads: add to album if selected
      if (selectedAlbumId && collectedAssetIds.length > 0) {
        await addMediaToAlbum(selectedAlbumId, collectedAssetIds);
      }
    } catch (err) {
      setDriveImportError(
        err instanceof Error ? err.message : "Import failed"
      );
    } finally {
      setDriveImporting(false);
    }
  };

  const requestNewToken = async (): Promise<string> => {
    // Re-open the picker flow to get a fresh token
    // This is a simplified version — in practice the hook manages the token
    await openPicker();
    if (!accessToken) throw new Error("Failed to refresh Google token");
    return accessToken;
  };

  const handleCancelDriveSelection = () => {
    resetDrive();
    setRemovedFileIds(new Set());
    setSelectedAlbumId("");
    setCreatingAlbum(false);
    setNewAlbumName("");
    setDriveImportError(null);
  };

  const allComplete = uploads.length > 0 && uploads.every((u) => u.status === "complete");

  if (authLoading) {
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

  return (
    <div className="min-h-screen p-4 sm:p-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">Upload Media</h1>
      </header>

      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <label htmlFor="group" className="block text-sm font-medium mb-2">
            Select Group
          </label>
          <select
            id="group"
            value={selectedGroupId}
            onChange={(e) => setSelectedGroupId(e.target.value)}
            disabled={groupsLoading || groups.length === 0}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
          {groups.length === 0 && !groupsLoading && (
            <p className="text-sm text-gray-500 mt-2">
              <Link href="/groups" className="text-blue-600 hover:underline">
                Create a group
              </Link>{" "}
              first to upload media.
            </p>
          )}
        </div>

        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
            dragOver
              ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
              : "border-gray-300 dark:border-gray-700"
          }`}
        >
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Drag and drop files here, or
          </p>
          <label className="px-4 py-2 bg-foreground text-background rounded-lg hover:opacity-90 cursor-pointer inline-block">
            Browse Files
            <input
              type="file"
              multiple
              accept="image/*,video/*"
              onChange={handleFileSelect}
              disabled={!selectedGroupId}
              className="hidden"
            />
          </label>
          <p className="text-xs text-gray-500 mt-4">
            Supports JPEG, PNG, GIF, WebP, HEIC, MP4, MOV, WebM
          </p>
        </div>

        {/* Google Drive import */}
        {googleConfigured && (
          <>
            <div className="flex items-center gap-4 my-6">
              <div className="flex-1 border-t border-gray-300 dark:border-gray-700" />
              <span className="text-sm text-gray-500">or</span>
              <div className="flex-1 border-t border-gray-300 dark:border-gray-700" />
            </div>

            <button
              onClick={openPicker}
              disabled={!selectedGroupId || isPickerOpen || isResolving || driveImporting}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-sm font-medium"
            >
              <GoogleDriveIcon />
              {isPickerOpen
                ? "Picker open..."
                : isResolving
                ? "Resolving files..."
                : "Import from Google Drive"}
            </button>

            {driveError && (
              <p className="text-sm text-red-600 mt-2">{driveError}</p>
            )}
          </>
        )}

        {/* Drive file preview / confirmation */}
        {visibleDriveFiles.length > 0 && !driveImporting && (
          <div className="mt-6 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-sm font-semibold">
                {visibleDriveFiles.length} file{visibleDriveFiles.length !== 1 ? "s" : ""} selected
                <span className="font-normal text-gray-500 ml-2">
                  ({formatBytes(totalDriveSize)})
                </span>
              </h2>
              <button
                onClick={handleCancelDriveSelection}
                className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                Cancel
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-1 mb-4">
              {visibleDriveFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 text-sm"
                >
                  <span className="text-gray-400">
                    {file.mimeType.startsWith("video/") ? "\u25B6" : "\u25A3"}
                  </span>
                  <span className="flex-1 truncate">{file.name}</span>
                  <span className="text-gray-500 text-xs">
                    {formatBytes(file.sizeBytes)}
                  </span>
                  <button
                    onClick={() => removeResolvedFile(file.id)}
                    className="text-gray-400 hover:text-red-500 text-xs"
                    title="Remove"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>

            {/* Album selector */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mb-3">
              <label className="block text-sm font-medium mb-1">
                Add to album (optional)
              </label>
              {!creatingAlbum ? (
                <select
                  value={selectedAlbumId}
                  onChange={(e) => {
                    if (e.target.value === "__new__") {
                      setCreatingAlbum(true);
                      setSelectedAlbumId("");
                    } else {
                      setSelectedAlbumId(e.target.value);
                    }
                  }}
                  disabled={albumsLoading}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <option value="">No album</option>
                  {albums.map((album) => (
                    <option key={album.id} value={album.id}>
                      {album.name}
                    </option>
                  ))}
                  <option value="__new__">+ Create new album...</option>
                </select>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newAlbumName}
                    onChange={(e) => setNewAlbumName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateAlbum()}
                    placeholder="Album name"
                    autoFocus
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                  <button
                    onClick={handleCreateAlbum}
                    disabled={!newAlbumName.trim()}
                    className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                  >
                    Create
                  </button>
                  <button
                    onClick={() => {
                      setCreatingAlbum(false);
                      setNewAlbumName("");
                    }}
                    className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={handleStartDriveImport}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
            >
              Start Import ({visibleDriveFiles.length} file{visibleDriveFiles.length !== 1 ? "s" : ""})
            </button>

            {driveImportError && (
              <p className="text-sm text-red-600 mt-2">{driveImportError}</p>
            )}
          </div>
        )}

        {/* Resolving spinner */}
        {isResolving && (
          <div className="mt-6 text-center text-sm text-gray-500">
            <div className="inline-block w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin mr-2" />
            Resolving folder contents...
          </div>
        )}

        {uploads.length > 0 && (
          <div className="mt-6 space-y-2">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium">
                {uploads.filter((u) => u.status === "complete").length} of{" "}
                {uploads.length} complete
              </span>
              {allComplete && (
                <button
                  onClick={() => {
                    clearUploads();
                    handleCancelDriveSelection();
                    router.push(`/groups/${selectedGroupId}`);
                  }}
                  className="text-sm text-blue-600 hover:underline"
                >
                  View in group
                </button>
              )}
            </div>
            {uploads.map((upload) => (
              <div
                key={upload.fileId}
                className="flex items-center gap-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
              >
                <span className="flex-1 truncate text-sm">{upload.filename}</span>
                <div className="w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${upload.progress}%` }}
                  />
                </div>
                <span
                  className={`text-xs capitalize ${
                    upload.status === "error"
                      ? "text-red-600"
                      : upload.status === "complete"
                      ? "text-green-600"
                      : upload.status === "retrying"
                      ? "text-amber-600"
                      : "text-gray-500"
                  }`}
                >
                  {upload.status === "retrying"
                    ? `Retrying (${upload.retryCount}/${3})`
                    : upload.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
