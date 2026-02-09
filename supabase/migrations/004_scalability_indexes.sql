-- Composite indexes for scalability
-- These supplement the existing single-column indexes from previous migrations

-- Main gallery query: media by group ordered by date (cursor pagination)
CREATE INDEX IF NOT EXISTS idx_media_assets_group_created
    ON public.media_assets(group_id, created_at DESC);

-- Filtering media by group and status (e.g., finding processing items)
CREATE INDEX IF NOT EXISTS idx_media_assets_group_status
    ON public.media_assets(group_id, status);

-- Album media listing ordered by added_at (cursor pagination)
CREATE INDEX IF NOT EXISTS idx_album_media_album_added
    ON public.album_media(album_id, added_at DESC);
