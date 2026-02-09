export const APP_NAME = "PhotoVault";

export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export const SUPPORTED_IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".heic",
  ".heif",
] as const;

export const SUPPORTED_VIDEO_EXTENSIONS = [
  ".mp4",
  ".mov",
  ".webm",
  ".avi",
] as const;

export const PRESIGNED_URL_EXPIRY = 3600; // 1 hour in seconds

export const THUMBNAIL_SIZE = {
  width: 400,
  height: 400,
} as const;

export const PAGINATION_DEFAULTS = {
  limit: 20,
  offset: 0,
} as const;
