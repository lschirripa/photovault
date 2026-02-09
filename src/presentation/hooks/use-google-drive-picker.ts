"use client";

import { useCallback, useRef, useState } from "react";
import { env } from "@/infrastructure/config/env";
import { ensureGoogleLoaded } from "@/infrastructure/google/google-api-loader";

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export interface UseGoogleDrivePickerReturn {
  openPicker: () => Promise<void>;
  isPickerOpen: boolean;
  isResolving: boolean;
  resolvedFiles: GoogleDriveFile[];
  accessToken: string | null;
  error: string | null;
  reset: () => void;
}

const MEDIA_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

const PICKER_MIME_FILTER = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "application/vnd.google-apps.folder",
].join(",");

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const MAX_FOLDER_DEPTH = 5;

function isMediaMime(mimeType: string): boolean {
  return MEDIA_MIME_TYPES.has(mimeType);
}

function isFolder(mimeType: string): boolean {
  return mimeType === "application/vnd.google-apps.folder";
}

export function useGoogleDrivePicker(): UseGoogleDrivePickerReturn {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [resolvedFiles, setResolvedFiles] = useState<GoogleDriveFile[]>([]);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);

  const requestToken = useCallback(async (): Promise<string> => {
    const { google } = await ensureGoogleLoaded();

    return new Promise<string>((resolve, reject) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: env.google.clientId,
        scope: DRIVE_SCOPE,
        callback: (response) => {
          if (response.error) {
            reject(new Error(response.error));
            return;
          }
          tokenRef.current = response.access_token;
          setAccessToken(response.access_token);
          resolve(response.access_token);
        },
        error_callback: (err) => {
          reject(new Error(err.message || "OAuth failed"));
        },
      });

      client.requestAccessToken({ prompt: "" });
    });
  }, []);

  const listFolderContents = useCallback(
    async (folderId: string, token: string, depth: number): Promise<GoogleDriveFile[]> => {
      if (depth > MAX_FOLDER_DEPTH) return [];

      const files: GoogleDriveFile[] = [];
      let pageToken: string | undefined;

      do {
        const params = new URLSearchParams({
          q: `'${folderId}' in parents and trashed = false and (mimeType contains 'image/' or mimeType contains 'video/' or mimeType = 'application/vnd.google-apps.folder')`,
          fields: "nextPageToken,files(id,name,mimeType,size)",
          pageSize: "1000",
        });
        if (pageToken) params.set("pageToken", pageToken);

        const resp = await fetch(
          `https://www.googleapis.com/drive/v3/files?${params}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!resp.ok) {
          throw new Error(`Failed to list folder contents (HTTP ${resp.status})`);
        }

        const data = await resp.json();
        const items: Array<{ id: string; name: string; mimeType: string; size?: string }> =
          data.files || [];

        for (const item of items) {
          if (isFolder(item.mimeType)) {
            const subFiles = await listFolderContents(item.id, token, depth + 1);
            files.push(...subFiles);
          } else if (isMediaMime(item.mimeType)) {
            files.push({
              id: item.id,
              name: item.name,
              mimeType: item.mimeType,
              sizeBytes: parseInt(item.size || "0", 10),
            });
          }
        }

        pageToken = data.nextPageToken;
      } while (pageToken);

      return files;
    },
    []
  );

  const resolvePickerResults = useCallback(
    async (docs: google.picker.Document[], token: string) => {
      setIsResolving(true);
      setError(null);

      try {
        const allFiles: GoogleDriveFile[] = [];

        for (const doc of docs) {
          if (isFolder(doc.mimeType)) {
            const folderFiles = await listFolderContents(doc.id, token, 0);
            allFiles.push(...folderFiles);
          } else if (isMediaMime(doc.mimeType)) {
            allFiles.push({
              id: doc.id,
              name: doc.name,
              mimeType: doc.mimeType,
              sizeBytes: doc.sizeBytes || 0,
            });
          }
          // Skip Google Docs / non-media types silently
        }

        // Deduplicate by file ID
        const uniqueMap = new Map<string, GoogleDriveFile>();
        for (const f of allFiles) {
          uniqueMap.set(f.id, f);
        }
        const unique = Array.from(uniqueMap.values());

        if (unique.length === 0) {
          setError("No media files found in the selected items");
        }

        setResolvedFiles(unique);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to resolve folder contents");
      } finally {
        setIsResolving(false);
      }
    },
    [listFolderContents]
  );

  const openPicker = useCallback(async () => {
    setError(null);

    try {
      const token = tokenRef.current || (await requestToken());
      await ensureGoogleLoaded();

      setIsPickerOpen(true);

      const filesView = new google.picker.DocsView()
        .setMimeTypes(PICKER_MIME_FILTER)
        .setIncludeFolders(true)
        .setSelectFolderEnabled(true);

      const picker = new google.picker.PickerBuilder()
        .addView(filesView)
        .setOAuthToken(token)
        .setDeveloperKey(env.google.apiKey)
        .setAppId(env.google.appId)
        .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
        .setTitle("Select photos, videos, or folders")
        .setCallback((data) => {
          if (data.action === google.picker.Action.PICKED && data.docs) {
            setIsPickerOpen(false);
            resolvePickerResults(data.docs, token);
          } else if (data.action === google.picker.Action.CANCEL) {
            setIsPickerOpen(false);
          }
        })
        .build();

      picker.setVisible(true);
    } catch (err) {
      setIsPickerOpen(false);
      const msg = err instanceof Error ? err.message : "Failed to open Google Drive picker";
      // Don't show error for user-cancelled OAuth popups
      if (msg !== "popup_closed_by_user") {
        setError(msg);
      }
    }
  }, [requestToken, resolvePickerResults]);

  const reset = useCallback(() => {
    setResolvedFiles([]);
    setError(null);
    setIsResolving(false);
    setIsPickerOpen(false);
  }, []);

  return {
    openPicker,
    isPickerOpen,
    isResolving,
    resolvedFiles,
    accessToken,
    error,
    reset,
  };
}
