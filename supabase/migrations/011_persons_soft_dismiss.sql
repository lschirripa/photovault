-- Soft dismiss for person clusters
-- Instead of deleting dismissed persons, mark them so the worker can still
-- match future faces against their centroid and suppress them from the UI.

-- 1. Add dismissed flag
ALTER TABLE public.persons
    ADD COLUMN dismissed BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Partial index: fast lookup of non-dismissed persons per group
CREATE INDEX idx_persons_active ON public.persons(group_id, face_count DESC)
    WHERE dismissed = FALSE;

-- 3. Update find_nearest_person RPC to exclude dismissed clusters
--    so the worker won't merge new faces into a dismissed identity.
CREATE OR REPLACE FUNCTION find_nearest_person(p_group_id UUID, p_embedding vector(512))
RETURNS TABLE(id UUID, distance FLOAT, face_count INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT p.id, (p.centroid <=> p_embedding)::FLOAT AS distance, p.face_count
    FROM persons p
    WHERE p.group_id = p_group_id
      AND p.dismissed = FALSE
    ORDER BY p.centroid <=> p_embedding
    LIMIT 1;
$$;
