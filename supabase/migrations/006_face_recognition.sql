-- Face Recognition & Clustering Schema
-- Requires: pgvector extension on Supabase (enable via Dashboard → Database → Extensions)

-- 1. Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Person clusters (one per distinct face identity per group)
CREATE TABLE public.persons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    name TEXT,                          -- NULL until user names them
    representative_face_id UUID,       -- best face crop for display (FK added below)
    centroid vector(512) NOT NULL,     -- running average embedding for matching
    face_count INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- HNSW index for fast nearest-neighbor on centroids (cosine distance)
CREATE INDEX idx_persons_centroid ON public.persons
    USING hnsw (centroid vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

CREATE INDEX idx_persons_group ON public.persons(group_id);
CREATE INDEX idx_persons_group_face_count ON public.persons(group_id, face_count DESC);

-- 3. Detected faces (one row per face per photo)
CREATE TABLE public.detected_faces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    media_asset_id UUID NOT NULL REFERENCES public.media_assets(id) ON DELETE CASCADE,
    person_id UUID REFERENCES public.persons(id) ON DELETE SET NULL,
    embedding vector(512) NOT NULL,
    -- Bounding box normalized 0.0-1.0 relative to image dimensions
    bbox_x REAL NOT NULL,
    bbox_y REAL NOT NULL,
    bbox_w REAL NOT NULL,
    bbox_h REAL NOT NULL,
    confidence REAL NOT NULL,          -- detection confidence 0.0-1.0
    face_crop_key TEXT,                -- R2 key for cropped face JPEG
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_detected_faces_asset ON public.detected_faces(media_asset_id);
CREATE INDEX idx_detected_faces_person ON public.detected_faces(person_id);

-- FK for representative_face_id (deferred because detected_faces didn't exist yet)
ALTER TABLE public.persons
    ADD CONSTRAINT fk_persons_representative_face
    FOREIGN KEY (representative_face_id) REFERENCES public.detected_faces(id)
    ON DELETE SET NULL;

-- 4. Face processing job queue
CREATE TABLE public.face_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    media_asset_id UUID NOT NULL REFERENCES public.media_assets(id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    error TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_face_jobs_pending ON public.face_jobs(created_at)
    WHERE status = 'pending';
CREATE INDEX idx_face_jobs_retry ON public.face_jobs(created_at)
    WHERE status = 'failed' AND attempts < 3;
CREATE INDEX idx_face_jobs_asset ON public.face_jobs(media_asset_id);

-- 5. RLS policies
ALTER TABLE public.persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detected_faces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.face_jobs ENABLE ROW LEVEL SECURITY;

-- Persons: visible to group members
CREATE POLICY persons_select ON public.persons FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.group_members
        WHERE group_members.group_id = persons.group_id
          AND group_members.user_id = auth.uid()
    )
);

-- Persons: updatable by group members (renaming, merging)
CREATE POLICY persons_update ON public.persons FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.group_members
        WHERE group_members.group_id = persons.group_id
          AND group_members.user_id = auth.uid()
    )
);

-- Persons: deletable by group members (dismiss false positives)
CREATE POLICY persons_delete ON public.persons FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM public.group_members
        WHERE group_members.group_id = persons.group_id
          AND group_members.user_id = auth.uid()
    )
);

-- Detected faces: visible to group members (via media_asset join)
CREATE POLICY detected_faces_select ON public.detected_faces FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.media_assets ma
        JOIN public.group_members gm ON gm.group_id = ma.group_id
        WHERE ma.id = detected_faces.media_asset_id
          AND gm.user_id = auth.uid()
    )
);

-- Face jobs: no user-facing policies (worker uses service role key)

-- 6. updated_at trigger for persons
CREATE TRIGGER update_persons_updated_at
    BEFORE UPDATE ON public.persons
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 7. RPC: Atomically claim a batch of pending/retryable jobs
CREATE OR REPLACE FUNCTION claim_face_jobs(batch_size INTEGER DEFAULT 10)
RETURNS SETOF face_jobs
LANGUAGE sql
SECURITY DEFINER
AS $$
    UPDATE face_jobs
    SET status = 'processing',
        started_at = NOW(),
        attempts = attempts + 1
    WHERE id IN (
        SELECT id FROM face_jobs
        WHERE status = 'pending'
           OR (status = 'failed' AND attempts < 3)
        ORDER BY created_at
        LIMIT batch_size
        FOR UPDATE SKIP LOCKED
    )
    RETURNING *;
$$;

-- 8. RPC: Find nearest person centroid by cosine distance
CREATE OR REPLACE FUNCTION find_nearest_person(p_group_id UUID, p_embedding vector(512))
RETURNS TABLE(id UUID, distance FLOAT, face_count INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT p.id, (p.centroid <=> p_embedding)::FLOAT AS distance, p.face_count
    FROM persons p
    WHERE p.group_id = p_group_id
    ORDER BY p.centroid <=> p_embedding
    LIMIT 1;
$$;
