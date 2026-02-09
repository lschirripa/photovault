-- Add location columns for reverse-geocoded place names
ALTER TABLE public.media_assets ADD COLUMN IF NOT EXISTS location_country TEXT;
ALTER TABLE public.media_assets ADD COLUMN IF NOT EXISTS location_state TEXT;
ALTER TABLE public.media_assets ADD COLUMN IF NOT EXISTS location_city TEXT;

-- Composite indexes for sorting and filtering
CREATE INDEX IF NOT EXISTS idx_media_assets_group_date_taken ON public.media_assets(group_id, date_taken DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_media_assets_group_filename ON public.media_assets(group_id, filename ASC);
CREATE INDEX IF NOT EXISTS idx_media_assets_group_size ON public.media_assets(group_id, size_bytes DESC);
CREATE INDEX IF NOT EXISTS idx_media_assets_group_media_type ON public.media_assets(group_id, media_type);
CREATE INDEX IF NOT EXISTS idx_media_assets_group_has_location ON public.media_assets(group_id) WHERE latitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_media_assets_group_country ON public.media_assets(group_id, location_country);
CREATE INDEX IF NOT EXISTS idx_media_assets_group_state ON public.media_assets(group_id, location_country, location_state);
