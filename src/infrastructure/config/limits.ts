// Central scalability constants — keep all magic numbers here.

/** Skip thumbnail generation for files larger than this (prevents OOM) */
export const THUMBNAIL_MAX_FILE_SIZE = 30 * 1024 * 1024; // 30 MB

/** Maximum allowed upload size for images */
export const MAX_IMAGE_UPLOAD_SIZE = 200 * 1024 * 1024; // 200 MB

/** Maximum allowed upload size for videos */
export const MAX_VIDEO_UPLOAD_SIZE = 2 * 1024 * 1024 * 1024; // 2 GB

/** Default page size for geo endpoint */
export const GEO_DEFAULT_LIMIT = 2000;

/** Maximum page size for geo endpoint */
export const GEO_MAX_LIMIT = 10_000;

/** Batch size for paginated group deletion (R2 keys per page) */
export const GROUP_DELETE_BATCH_SIZE = 500;

/** R2/S3 maximum keys per DeleteObjects request */
export const R2_DELETE_BATCH_SIZE = 1000;

/** Time budget for group deletion R2 cleanup (ms) */
export const GROUP_DELETE_TIME_BUDGET_MS = 45_000;
