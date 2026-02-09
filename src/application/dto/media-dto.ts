import { MediaType, MediaStatus } from "@/domain/enums/media-type";

export interface PresignUploadRequestDTO {
  groupId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
}

export interface PresignUploadResponseDTO {
  uploadUrl: string;
  assetId: string;
  key: string;
  expiresAt: string;
  thumbnailUploadUrl?: string;
  thumbnailKey?: string;
}

export interface ConfirmUploadRequestDTO {
  assetId: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  thumbnailKey?: string;
}

export interface MediaAssetResponseDTO {
  id: string;
  groupId: string;
  uploadedBy: string;
  uploaderName: string;
  filename: string;
  originalUrl: string;
  thumbnailUrl: string | null;
  mediaType: MediaType;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  status: MediaStatus;
  createdAt: string;
}

export interface MediaListResponseDTO {
  assets: MediaAssetResponseDTO[];
  total: number;
  hasMore: boolean;
}

export interface ThumbnailWebhookRequestDTO {
  assetId: string;
  thumbnailKey: string;
  width: number;
  height: number;
}
