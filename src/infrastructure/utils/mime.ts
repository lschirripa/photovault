const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/svg+xml",
  "image/bmp",
  "image/tiff",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-msvideo",
  "video/x-matroska",
]);

/**
 * Returns the MIME type if it's in the allowlist, otherwise falls back
 * to "application/octet-stream" to prevent serving unexpected content types.
 */
export function sanitizeMimeType(mimeType: string): string {
  return ALLOWED_MIME_TYPES.has(mimeType)
    ? mimeType
    : "application/octet-stream";
}
