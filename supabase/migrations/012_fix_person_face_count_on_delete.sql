-- Fix stale person face_count when media assets are deleted
--
-- When a media_asset is deleted, detected_faces cascade-delete automatically,
-- but person.face_count was never decremented. This left ghost person records
-- with face_count > 0 even after all their photos were removed.
--
-- Fix: trigger that decrements face_count on each face deletion and removes
-- the person record if no faces remain.

-- 1. Trigger function
CREATE OR REPLACE FUNCTION public.handle_face_deleted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF OLD.person_id IS NOT NULL THEN
        UPDATE public.persons
        SET face_count = face_count - 1
        WHERE id = OLD.person_id;

        -- Remove person when all faces are gone
        DELETE FROM public.persons
        WHERE id = OLD.person_id AND face_count <= 0;
    END IF;
    RETURN OLD;
END;
$$;

-- 2. Attach trigger to detected_faces (fires after each row deletion)
CREATE TRIGGER on_face_deleted
    AFTER DELETE ON public.detected_faces
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_face_deleted();

-- 3. Fix existing stale data: recalculate face_count from actual rows
UPDATE public.persons p
SET face_count = (
    SELECT COUNT(*)::INTEGER
    FROM public.detected_faces df
    WHERE df.person_id = p.id
);

-- 4. Delete ghost person records that have no faces
DELETE FROM public.persons WHERE face_count <= 0;
