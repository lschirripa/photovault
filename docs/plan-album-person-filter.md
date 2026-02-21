# Plan: Filter by Person in Albums View

## Context

The main gallery (group page) supports filtering photos by detected persons via `PersonCard` selection + `find_media_by_persons()` RPC. The album detail page has no person filter support. Additionally, the `useInfiniteMedia` hook has a latent bug: if both `albumId` and `personIds` are set, the person filter mode takes priority and searches the **entire group** instead of scoping to the album.

This plan adds a "People in this Album" section to the album view with efficient, cursor-paginated filtering.

---

## Approach: Full (recommended for production use)

### Step 1: New DB migration — `find_album_media_by_persons` RPC

**Create:** `supabase/migrations/013_find_album_media_by_persons.sql`

```sql
CREATE OR REPLACE FUNCTION find_album_media_by_persons(
  p_album_id UUID,
  p_person_ids UUID[],
  p_limit INTEGER DEFAULT 50,
  p_cursor TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(media_asset_id UUID, added_at TIMESTAMPTZ)
```

- Mirrors `find_media_by_persons` (007) but scoped to an album
- Joins `album_media` + `detected_faces`, AND logic via `HAVING COUNT(DISTINCT person_id)`
- Cursor on `added_at` (consistent with album pagination)
- `SECURITY INVOKER` so RLS is respected
- **No new indexes needed** — covered by existing `idx_album_media_album_added`, `idx_detected_faces_person_created`, `idx_detected_faces_asset`

### Step 2: New API endpoint — `GET /api/albums/[albumId]/persons`

**Create:** `src/app/api/albums/[albumId]/persons/route.ts`

- Auth + group membership check (via album's `group_id`)
- Joins `album_media` → `detected_faces` → `persons` to find distinct persons in the album
- Filters: non-dismissed, face_count >= 2
- Generates signed face crop URLs (same pattern as `GET /api/persons`)
- Returns `{ persons: PersonDTO[] }` sorted by face_count DESC

### Step 3: New hook — `useAlbumPersons`

**Create:** `src/presentation/hooks/use-album-persons.ts`

- Read-only hook: fetches `GET /api/albums/${albumId}/persons`
- Returns `{ persons: PersonDTO[], loading, error, fetchPersons }`
- Reuses `PersonDTO` type from `use-persons.ts`
- Separate from `usePersons` because album persons is read-only (no rename/dismiss/merge)

### Step 4: Modify `useInfiniteMedia` — add album+person combo mode

**Modify:** `src/presentation/hooks/use-infinite-media.ts`

Insert a 4th query mode before existing checks (at ~line 122):

```
if (albumId && personIds?.length) {
  // Album + Person filter → call find_album_media_by_persons RPC
  // Cursor on added_at (not created_at)
  // Then fetch full media_assets + applyFilters (excluding personIds)
}
else if (personIds?.length) { /* existing group-wide person search */ }
else if (albumId) { /* existing album mode */ }
else { /* existing group mode */ }
```

Fixes the bug where `personIds` took priority over `albumId`.

### Step 5: Modify album detail page — add People section + filter state

**Modify:** `src/app/(dashboard)/groups/[groupId]/albums/[albumId]/page.tsx`

Changes (following the group page pattern at lines 65-76, 645-769):

1. **New state:** `selectedPersonIds: string[]`
2. **New hook:** `useAlbumPersons({ albumId })` — fetch on mount
3. **Combined filters:** `combinedFilters = { ...filters, personIds: selectedPersonIds }`
4. **People section UI** between header and MediaFilterBar — grid of `PersonCard` components
5. **Filter chip:** "Filtering by N people" badge with clear button
6. **Clear filters:** update empty-state handler to clear `selectedPersonIds`

---

## Alternative: Lightweight (fewer files, UX trade-offs)

If the full approach adds too much overhead, a simpler alternative:

**Changes: 2 file modifications only, no new files**

1. **Modify `useInfiniteMedia`**: When `albumId + personIds` are both set, first query `album_media` for the album's media IDs, then query `detected_faces` filtering by those IDs and the selected person_ids, group + HAVING for AND logic. Uses Supabase queries (no RPC). Pagination may be sparse (some pages partially empty).

2. **Modify album detail page**: Add `usePersons({ groupId })` (existing hook, no new hook needed) and render PersonCard grid. Shows ALL group persons, not just those in the album — some may yield empty results.

**Trade-offs:**
- Shows persons not present in the album (confusing but harmless)
- Sparse pagination: if a person appears in 5/1000 photos, pages may load mostly empty
- No new SQL migration, API route, or hook to maintain

---

## Files Summary (Full Approach)

| Action | File |
|--------|------|
| Create | `supabase/migrations/013_find_album_media_by_persons.sql` |
| Create | `src/app/api/albums/[albumId]/persons/route.ts` |
| Create | `src/presentation/hooks/use-album-persons.ts` |
| Modify | `src/presentation/hooks/use-infinite-media.ts` |
| Modify | `src/app/(dashboard)/groups/[groupId]/albums/[albumId]/page.tsx` |

## Verification

1. `npm run type-check` — no TS errors
2. `npm run lint` — no lint errors
3. Manual testing:
   - Navigate to an album with photos containing detected faces
   - Verify "People in this album" section shows correct persons
   - Click person → grid filters to only their photos
   - Click second person → AND filter (photos with both)
   - Clear filter → resets
   - Infinite scroll works with filter active
   - Combine person filter with date/type filters → both apply
