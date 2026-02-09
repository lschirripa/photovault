-- Add metadata columns to media_assets table for EXIF data
ALTER TABLE media_assets
ADD COLUMN IF NOT EXISTS date_taken TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS altitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS camera_make TEXT,
ADD COLUMN IF NOT EXISTS camera_model TEXT,
ADD COLUMN IF NOT EXISTS lens_model TEXT,
ADD COLUMN IF NOT EXISTS iso INTEGER,
ADD COLUMN IF NOT EXISTS f_number DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS exposure_time TEXT,
ADD COLUMN IF NOT EXISTS focal_length DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS orientation INTEGER;

-- Create index on date_taken for efficient date-based queries
CREATE INDEX IF NOT EXISTS idx_media_assets_date_taken ON media_assets(date_taken);

-- Create index on location for efficient geo queries
CREATE INDEX IF NOT EXISTS idx_media_assets_location ON media_assets(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Create index on camera_make and camera_model for filtering
CREATE INDEX IF NOT EXISTS idx_media_assets_camera ON media_assets(camera_make, camera_model);
