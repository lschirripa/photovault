-- Find media assets in an album containing ALL specified persons (AND logic)
-- Used for person-based photo filtering on the album detail page

CREATE OR REPLACE FUNCTION find_album_media_by_persons(
  p_album_id UUID,
  p_person_ids UUID[],
  p_limit INTEGER DEFAULT 50,
  p_cursor TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(media_asset_id UUID, added_at TIMESTAMPTZ)
AS $$
  WITH matching AS (
    SELECT df.media_asset_id
    FROM detected_faces df
    WHERE df.person_id = ANY(p_person_ids)
    GROUP BY df.media_asset_id
    HAVING COUNT(DISTINCT df.person_id) = array_length(p_person_ids, 1)
  )
  SELECT am.media_id, am.added_at
  FROM album_media am
  JOIN matching m ON m.media_asset_id = am.media_id
  WHERE am.album_id = p_album_id
    AND (p_cursor IS NULL OR am.added_at < p_cursor)
  ORDER BY am.added_at DESC
  LIMIT p_limit;
$$
LANGUAGE sql STABLE SECURITY INVOKER;
