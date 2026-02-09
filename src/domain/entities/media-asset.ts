import { MediaType, MediaStatus } from "../enums/media-type";

export interface MediaMetadata {
  dateTaken: Date | null;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  cameraMake: string | null;
  cameraModel: string | null;
  lensModel: string | null;
  iso: number | null;
  fNumber: number | null;
  exposureTime: string | null;
  focalLength: number | null;
  orientation: number | null;
  locationCountry: string | null;
  locationState: string | null;
  locationCity: string | null;
}

export interface MediaAsset {
  id: string;
  groupId: string;
  uploadedBy: string;
  filename: string;
  originalKey: string;
  thumbnailKey: string | null;
  mediaType: MediaType;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  status: MediaStatus;
  createdAt: Date;
  metadata?: MediaMetadata;
}

export interface CreateMediaAssetInput {
  groupId: string;
  uploadedBy: string;
  filename: string;
  originalKey: string;
  mediaType: MediaType;
  mimeType: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
}

export interface UpdateMediaAssetInput {
  thumbnailKey?: string | null;
  status?: MediaStatus;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  dateTaken?: Date | null;
  latitude?: number | null;
  longitude?: number | null;
  altitude?: number | null;
  cameraMake?: string | null;
  cameraModel?: string | null;
  lensModel?: string | null;
  iso?: number | null;
  fNumber?: number | null;
  exposureTime?: string | null;
  focalLength?: number | null;
  orientation?: number | null;
  locationCountry?: string | null;
  locationState?: string | null;
  locationCity?: string | null;
}
