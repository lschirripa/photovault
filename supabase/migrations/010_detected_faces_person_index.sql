-- Composite index on detected_faces for person-media queries.
-- Eliminates full-table scan + sort when fetching media for a given person.
CREATE INDEX IF NOT EXISTS idx_detected_faces_person_created
    ON public.detected_faces(person_id, created_at DESC);
