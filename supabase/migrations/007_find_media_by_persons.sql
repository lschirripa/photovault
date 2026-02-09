-- Find media assets containing ALL specified persons (AND logic)
-- Used for person-based photo filtering on the group page

CREATE OR REPLACE FUNCTION find_media_by_persons(
  p_group_id UUID,
  p_person_ids UUID[],
  p_limit INTEGER DEFAULT 50,
  p_cursor TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(media_asset_id UUID, created_at TIMESTAMPTZ)
AS $$
  WITH matching AS (
    SELECT df.media_asset_id
    FROM detected_faces df
    WHERE df.person_id = ANY(p_person_ids)
    GROUP BY df.media_asset_id
    HAVING COUNT(DISTINCT df.person_id) = array_length(p_person_ids, 1)
  )
  SELECT ma.id, ma.created_at
  FROM media_assets ma
  JOIN matching m ON m.media_asset_id = ma.id
  WHERE ma.group_id = p_group_id
    AND ma.status = 'ready'
    AND (p_cursor IS NULL OR ma.created_at < p_cursor)
  ORDER BY ma.created_at DESC
  LIMIT p_limit;
$$
LANGUAGE sql STABLE SECURITY INVOKER;

-- Allow group members to update detected_faces (for face reassignment)
CREATE POLICY detected_faces_update ON public.detected_faces FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.media_assets ma
        JOIN public.group_members gm ON gm.group_id = ma.group_id
        WHERE ma.id = detected_faces.media_asset_id
          AND gm.user_id = auth.uid()
    )
);
