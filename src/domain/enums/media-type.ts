export enum MediaType {
  IMAGE = "image",
  VIDEO = "video",
}

export enum MediaStatus {
  UPLOADING = "uploading",
  PROCESSING = "processing",
  READY = "ready",
  FAILED = "failed",
}

export const SUPPORTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export const SUPPORTED_VIDEO_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-msvideo",
] as const;

export function getMediaTypeFromMime(mimeType: string): MediaType | null {
  if (SUPPORTED_IMAGE_TYPES.includes(mimeType as (typeof SUPPORTED_IMAGE_TYPES)[number])) {
    return MediaType.IMAGE;
  }
  if (SUPPORTED_VIDEO_TYPES.includes(mimeType as (typeof SUPPORTED_VIDEO_TYPES)[number])) {
    return MediaType.VIDEO;
  }
  return null;
}
