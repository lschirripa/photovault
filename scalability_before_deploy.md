⏺ How Images Are Actually Uploaded

The Full Pipeline

1. Client selects files → No processing happens
- Files are sent exactly as-is - no client-side compression, resizing, or format conversion
- The only client processing is MIME type inference for iOS (where file.type can be empty)
- For videos only: a thumbnail frame is captured client-side at 1s mark using <canvas> (400px max width, JPEG @ 80% quality)

2. Presign → Upload to R2 → No transformation
- Client calls POST /api/media/presign to get a presigned PUT URL
- The file is uploaded directly to Cloudflare R2 via XHR (xhr.send(file)) - raw binary, single PUT request
- No compression, no resizing, no format conversion - original bytes are stored exactly as the user captured them
- Storage key: media/{groupId}/{userId}/{timestamp}-{sanitizedFilename}

3. Confirm → Webhook triggers server-side processing
- After upload, /api/media/confirm sets status to "processing" and fires a webhook
- The webhook (/api/webhooks/thumbnail) does the only image processing:
  ┌───────────────────────┬─────────────────────────────────────────────────────────────────────┬─────────────────────────────────────┐
  │         What          │                               Details                               │            Quality Loss?            │
  ├───────────────────────┼─────────────────────────────────────────────────────────────────────┼─────────────────────────────────────┤
  │ Thumbnail             │ Sharp resizes to 400x400 max (aspect preserved), outputs JPEG @ 80% │ Yes - lossy compression + downscale │
  ├───────────────────────┼─────────────────────────────────────────────────────────────────────┼─────────────────────────────────────┤
  │ HEIC/HEIF web version │ Sharp converts to JPEG @ 90% at full resolution                     │ Yes - lossy but near-original       │
  ├───────────────────────┼─────────────────────────────────────────────────────────────────────┼─────────────────────────────────────┤
  │ EXIF extraction       │ Reads camera, GPS, exposure, orientation via exifr                  │ No - metadata stored in DB          │
  ├───────────────────────┼─────────────────────────────────────────────────────────────────────┼─────────────────────────────────────┤
  │ Original file         │ Untouched in R2                                                     │ No loss ever                        │
  └───────────────────────┴─────────────────────────────────────────────────────────────────────┴─────────────────────────────────────┘
4. Display flow
- Gallery grid shows the 400x400 JPEG thumbnail (lossy)
- Lightbox shows the original file (or JPEG web-version for HEIC/HEIF)
- Download gives you the original file (except HEIC/HEIF → serves the 90% JPEG version)

Upload reliability features

- Adaptive concurrency: 1 slot on 2G/3G, 2 on mobile 4G, 3 on desktop
- Stall timeout: 30s with no progress → abort + retry
- Overall timeout: 10 min per file
- Retry: up to 3 attempts with exponential backoff (1s, 2s, 4s)

  ---
Scalability Weak Points

Critical

1. Thumbnail webhook buffers entire image in memory
   /api/webhooks/thumbnail/route.ts - The entire original image is loaded into a Buffer before Sharp processes it. For a 50MB HEIC file, this
   means ~200MB in RAM (original + encoded output). With 10 concurrent uploads, that's a 500MB+ RAM spike that can crash the Vercel function
   or block the event loop for seconds. This should be moved to a background job queue with stream-based processing.

2. Geo endpoint has no pagination
   /api/media/geo/route.ts - Fetches ALL geotagged media across all groups in a single query with no cursor/limit. At 10k+ geotagged photos,
   this will timeout or OOM.

High Priority

3. No rate limiting on any endpoint - /api/media/presign, /api/media/urls, etc. are all unprotected. A single user could spam thousands of
   presign requests, creating orphaned DB records and R2 slots.

4. Group deletion is O(N) on assets - DELETE /api/groups/[groupId] fetches all media assets to get their R2 keys, then deletes them one
   batch at a time. For a group with 100k photos, this will timeout on Vercel's function limit.

5. File reference memory leak - use-media-upload.ts holds File objects in a fileMapRef for retries but never clears them on permanent
   failure. Failed large video uploads stay in browser RAM indefinitely.

6. No upload size validation - The presign endpoint accepts any sizeBytes without validation. There's no max file size enforced
   server-side.

Medium Priority

7. No connection pooling - Every API request creates a fresh Supabase client. At high RPS, connection overhead becomes a bottleneck. Should
   use PgBouncer or pooled client.

8. Missing database index - detected_faces(person_id, created_at) is missing, making person-media queries do full table scans.

9. No caching layer - No Redis/Memcached for frequently accessed data (group metadata, album contents). Every request hits Supabase
   directly.

10. No server-side video thumbnails - If the client-side canvas capture fails (common with certain codecs), the video has no thumbnail at
    all. No ffmpeg or server-side fallback exists.

Architecture Gaps
┌──────────────────────┬───────────────────────────────────────────────────────────┬───────────────────────────────────────────┐
│       Missing        │                          Impact                           │              Recommendation               │
├──────────────────────┼───────────────────────────────────────────────────────────┼───────────────────────────────────────────┤
│ Background job queue │ Webhook processing blocks, no retry for failed thumbnails │ Add Bull/Redis or similar                 │
├──────────────────────┼───────────────────────────────────────────────────────────┼───────────────────────────────────────────┤
│ CDN for media        │ All images served through presigned R2 URLs via origin    │ Add Cloudflare CDN in front of R2         │
├──────────────────────┼───────────────────────────────────────────────────────────┼───────────────────────────────────────────┤
│ Rate limiting        │ Abuse/DoS risk on all endpoints                           │ Add @vercel/edge-ratelimit or middleware  │
├──────────────────────┼───────────────────────────────────────────────────────────┼───────────────────────────────────────────┤
│ Resumable uploads    │ Large files on flaky networks fail completely             │ Consider Tus protocol for files >50MB     │
├──────────────────────┼───────────────────────────────────────────────────────────┼───────────────────────────────────────────┤
│ File validation      │ No virus scan or magic-number check                       │ Validate before marking as "ready"        │
├──────────────────────┼───────────────────────────────────────────────────────────┼───────────────────────────────────────────┤
│ Edge functions       │ Auth + presign generation always hits origin              │ Move to Cloudflare Workers or Vercel Edge │
└──────────────────────┴───────────────────────────────────────────────────────────┴───────────────────────────────────────────┘
What's Already Done Well

- Batch URL endpoint eliminates N+1 fetches
- Client-side URL cache with matching TTL (45min)
- DOM virtualization handles 10k+ thumbnails smoothly
- Cursor-based pagination on all main queries
- Adaptive upload concurrency based on network
- Retry with exponential backoff
- Orphaned upload cleanup cron

The biggest wins for scalability right now would be: (1) moving thumbnail processing to a queue, (2) adding rate limiting, and (3) fixing
the geo query pagination.