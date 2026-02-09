# Metadata Filters, Sorting & Info Panel for Groups & Albums

## Context

The `media_assets` table already stores rich EXIF metadata (camera, lens, exposure settings, GPS, date taken, etc.) extracted during thumbnail processing, but none of it is exposed in the UI. Users have no way to filter, sort, or view metadata for their photos. This plan adds:

1. **Filter bar** with media type toggle, camera picker, date range, **location filter (country/state)**, and file size presets
2. **Configurable sorting** by date taken, date uploaded, filename, or file size
3. **Quick camera chips** — top cameras shown as one-click toggles (innovative shortcut)
4. **EXIF metadata panel** in the lightbox — slide-out panel showing camera, exposure, location, and file details
5. **Active filter chips** with clear-all, and a "no results" state with clear button
6. **Reverse geocoding** — converts GPS lat/lon to human-readable country/state/city during thumbnail processing, stored in DB for filtering

Both the group detail page and album detail page get the same filter/sort capabilities.

---

## Files to Create

| # | File | Purpose |
|---|------|---------|
| 1 | `src/domain/types/media-filters.ts` | Filter/sort type definitions, sort options config, size presets |
| 2 | `src/presentation/hooks/use-media-filter-options.ts` | Hook to fetch distinct cameras, locations, date range, GPS availability for a group/album |
| 3 | `src/presentation/components/gallery/media-filter-bar.tsx` | Collapsible filter toolbar with sort dropdown, media type toggle, camera select, location select, date inputs, size pills, active filter chips |
| 4 | `src/presentation/components/gallery/metadata-panel.tsx` | Slide-out EXIF info panel for the lightbox (file info, camera, exposure, date, location with map link) |
| 5 | `supabase/migrations/005_filter_sort_indexes.sql` | Add `location_country`, `location_state`, `location_city` columns; composite indexes for sort/filter performance |
| 6 | `src/infrastructure/services/reverse-geocoding-service.ts` | Reverse geocoding service that converts lat/lon to country/state/city using OpenStreetMap Nominatim API |

## Files to Modify

| # | File | Changes |
|---|------|---------|
| 7 | `src/infrastructure/services/metadata-extraction-service.ts` | Add `locationCountry`, `locationState`, `locationCity` to `ExtractedMetadata`; call reverse geocoding after EXIF extraction |
| 8 | `src/domain/entities/media-asset.ts` | Add `locationCountry`, `locationState`, `locationCity` to `MediaMetadata` interface |
| 9 | `src/app/api/webhooks/thumbnail/route.ts` | Include `location_country`, `location_state`, `location_city` in the DB update |
| 10 | `src/presentation/hooks/use-infinite-media.ts` | Accept `filters`/`sort` params; add `applyFilters()` helper; adapt cursor field to sort field; populate `metadata` in `mapRow`; reset on filter/sort change |
| 11 | `src/presentation/components/gallery/lightbox.tsx` | Add info toggle button; render `MetadataPanel`; keyboard shortcut "i" to toggle; adjust main content width when panel open |
| 12 | `src/app/(dashboard)/groups/[groupId]/page.tsx` | Add `filters`/`sort` state; pass to `useInfiniteMedia`; call `useMediaFilterOptions`; render `<MediaFilterBar>` between heading and grid; filtered empty state |
| 13 | `src/app/(dashboard)/groups/[groupId]/albums/[albumId]/page.tsx` | Same pattern as group page — filters/sort state, filter options hook, filter bar, filtered empty state |

---

## Implementation Steps

### Step 1: Domain types (`src/domain/types/media-filters.ts`)

Create the file with:
- `SortField` type: `"created_at" | "date_taken" | "filename" | "size_bytes"`
- `SortDirection` type: `"asc" | "desc"`
- `MediaSort` interface: `{ field: SortField; direction: SortDirection }`
- `MediaFilters` interface: `{ mediaType?, camera? (as "make|model"), dateFrom?, dateTo?, hasLocation?, locationCountry?, locationState?, minSizeBytes?, maxSizeBytes? }`
- `DEFAULT_SORT` constant: `{ field: "created_at", direction: "desc" }`
- `SORT_OPTIONS` array: 8 entries (date uploaded newest/oldest, date taken newest/oldest, filename A-Z/Z-A, size largest/smallest)
- `SIZE_PRESETS`: small (<1MB), medium (1-10MB), large (>10MB)

### Step 1b: DB migration (`supabase/migrations/005_filter_sort_indexes.sql`)

Add 3 new columns to `media_assets`:
- `location_country TEXT` — e.g. "Germany", "United States"
- `location_state TEXT` — e.g. "Bavaria", "California"
- `location_city TEXT` — e.g. "Munich", "San Francisco"

Plus composite indexes for sorting and the new location columns:
```sql
ALTER TABLE public.media_assets ADD COLUMN IF NOT EXISTS location_country TEXT;
ALTER TABLE public.media_assets ADD COLUMN IF NOT EXISTS location_state TEXT;
ALTER TABLE public.media_assets ADD COLUMN IF NOT EXISTS location_city TEXT;

CREATE INDEX IF NOT EXISTS idx_media_assets_group_date_taken ON public.media_assets(group_id, date_taken DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_media_assets_group_filename ON public.media_assets(group_id, filename ASC);
CREATE INDEX IF NOT EXISTS idx_media_assets_group_size ON public.media_assets(group_id, size_bytes DESC);
CREATE INDEX IF NOT EXISTS idx_media_assets_group_media_type ON public.media_assets(group_id, media_type);
CREATE INDEX IF NOT EXISTS idx_media_assets_group_has_location ON public.media_assets(group_id) WHERE latitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_media_assets_group_country ON public.media_assets(group_id, location_country);
CREATE INDEX IF NOT EXISTS idx_media_assets_group_state ON public.media_assets(group_id, location_country, location_state);
```

### Step 1c: Reverse geocoding service (`src/infrastructure/services/reverse-geocoding-service.ts`)

Create a service that calls the OpenStreetMap Nominatim API:
- `reverseGeocode(lat: number, lon: number): Promise<{ country, state, city } | null>`
- Uses `https://nominatim.openstreetmap.org/reverse?lat=...&lon=...&format=json&zoom=10`
- Extracts `address.country`, `address.state`, `address.city` (or `address.town`/`address.village` fallback)
- Best-effort: returns null on any failure (network, rate limit, etc.)
- Includes `User-Agent` header as required by Nominatim usage policy

### Step 1d: Update metadata extraction + webhook

**`src/infrastructure/services/metadata-extraction-service.ts`**: Add `locationCountry`, `locationState`, `locationCity` to `ExtractedMetadata`. After extracting GPS coords, call `reverseGeocode()` if lat/lon are present.

**`src/domain/entities/media-asset.ts`**: Add `locationCountry`, `locationState`, `locationCity` to `MediaMetadata` interface.

**`src/app/api/webhooks/thumbnail/route.ts`**: Include the 3 new location columns in the `metadataUpdate` object written to DB.

### Step 2: Extend `useInfiniteMedia` hook

**File**: `src/presentation/hooks/use-infinite-media.ts`

Key changes:
- **Options interface** — add `filters?: MediaFilters` and `sort?: MediaSort`
- **`mapRow` function** — populate the `metadata` field from all EXIF columns (`date_taken`, `camera_make`, `camera_model`, `lens_model`, `iso`, `f_number`, `exposure_time`, `focal_length`, `latitude`, `longitude`, `altitude`, `orientation`, `location_country`, `location_state`, `location_city`). Currently `mapRow` skips these entirely.
- **`applyFilters()` helper** — chains Supabase `.eq()`, `.gte()`, `.lte()`, `.not(..., "is", null)` based on active filters. Applied to the `media_assets` query in both group and album mode. For location filters: `.eq("location_country", filters.locationCountry)` and optionally `.eq("location_state", filters.locationState)`.
- **Group mode sort/cursor** — replace hardcoded `created_at` ordering with `sort.field`. Cursor comparison uses `.lt()` for desc, `.gt()` for asc. When sorting by `date_taken`, also filter out nulls (`.not("date_taken", "is", null)`) and add secondary sort on `created_at` for stability.
- **Album mode** — filters applied to the `media_assets` fetch (after getting IDs from `album_media`). If sort is non-default, re-sort results client-side by the chosen sort field after the join (50 items max, trivial).
- **Dependency tracking** — use `JSON.stringify(filters)` and `JSON.stringify(sort)` as stable dependencies for `useCallback`. Reset cursor and media state when they change via `useEffect`.

### Step 3: Filter options hook (`src/presentation/hooks/use-media-filter-options.ts`)

Create hook `useMediaFilterOptions(groupId, albumId?)` that returns:
- `cameras: CameraOption[]` — distinct `{make, model, label, value, count}` sorted by count desc
- `locations: LocationOption[]` — distinct `{country, state?, label, count}` sorted by count desc (hierarchical: countries first, states within selected country)
- `hasAnyLocation: boolean` — whether any media has GPS
- `dateRange: { earliest, latest }` — min/max `date_taken`
- `loading: boolean`

Uses Supabase browser client to query `media_assets` (scoped to group or album media IDs). Runs once on mount. The existing indexes cover the queries.

For locations, query distinct `location_country` values with counts. When a country is selected, query distinct `location_state` values within that country.

### Step 4: Filter bar component (`src/presentation/components/gallery/media-filter-bar.tsx`)

Props: `filters`, `sort`, `onFiltersChange`, `onSortChange`, `cameras`, `locations`, `hasAnyLocation`, `dateRange`, `resultCount?`

**Layout (collapsed — default state)**:
```
[Sort: dropdown ▾]  [camera chip] [camera chip] [camera chip]  [Filter (N)]
```

**Layout (expanded when Filter clicked)**:
```
[Sort: dropdown ▾]  [camera chip] [camera chip] [camera chip]  [Filter (N) ▴]
┌──────────────────────────────────────────────────────────────────────────┐
│ Type: [All] [Photos] [Videos]                                           │
│ Camera: [All cameras ▾]           Date: [From ____] — [To ____]        │
│ Location: [All countries ▾] [All states ▾]                              │
│ Size: [Any] [<1MB] [1-10MB] [>10MB]                                    │
├──────────────────────────────────────────────────────────────────────────┤
│ Active: [Camera: iPhone 15 Pro ×] [Germany ×]  ← Clear all             │
└──────────────────────────────────────────────────────────────────────────┘
```

- Quick camera chips (top 3 most-used cameras) always visible — one-click filter toggle
- Sort dropdown uses native `<select>` styled with Tailwind
- Date inputs use native `<input type="date">`
- Location: hierarchical — country dropdown, then state dropdown (only shown when country selected)
- Active filter count badge on the Filter button
- Active filter chips row with individual clear (×) and "Clear all"
- All Tailwind, no external dependencies

### Step 5: Metadata panel for lightbox (`src/presentation/components/gallery/metadata-panel.tsx`)

A right-side slide-out panel (`w-80`, `bg-black/80 backdrop-blur-sm`) displaying:
- **File** section: filename, type, size (using existing `formatBytes` from `src/lib/utils/index.ts`), dimensions, upload date
- **Camera** section: make, model, lens (if present)
- **Exposure** section: focal length, aperture (f/N), shutter speed, ISO (if present)
- **Date** section: date taken (if present)
- **Location** section: country/state/city (human-readable), lat/lon, altitude, "View on map" link to Google Maps (if present)

Each section conditionally renders only when relevant data exists.

### Step 6: Lightbox integration

**File**: `src/presentation/components/gallery/lightbox.tsx`

- Add `showInfo` state (`useState(false)`)
- Add info toggle button (ℹ icon) in the header between download and close buttons
- Render `<MetadataPanel asset={currentMedia} isOpen={showInfo} onClose={...} />` inside the main content area
- When panel is open, shrink the image container from `right-0` to `right-80` (or use flex with the panel taking 320px)
- Add keyboard shortcut: "i" key toggles the panel (in the existing `handleKeyDown`)
- Panel stays open when navigating between images (content updates automatically)

### Step 7: Group page integration

**File**: `src/app/(dashboard)/groups/[groupId]/page.tsx`

- Import `MediaFilterBar`, `useMediaFilterOptions`, types
- Add state: `const [filters, setFilters] = useState<MediaFilters>({})` and `const [sort, setSort] = useState<MediaSort>(DEFAULT_SORT)`
- Pass to `useInfiniteMedia({ groupId, filters, sort })`
- Call `const { cameras, locations, hasAnyLocation, dateRange } = useMediaFilterOptions(groupId)`
- Insert `<MediaFilterBar ... />` between the "All Photos" heading (line 522) and the uploads section (line 524)
- Add filtered empty state: when `media.length === 0` and filters are active, show "No media matches your filters" with a "Clear filters" button

### Step 8: Album page integration

**File**: `src/app/(dashboard)/groups/[groupId]/albums/[albumId]/page.tsx`

Same pattern as step 7:
- Add filter/sort state
- Pass to `useInfiniteMedia({ groupId, albumId, filters, sort })`
- Call `useMediaFilterOptions(groupId, albumId)`
- Insert `<MediaFilterBar>` between the `</header>` (line 297) and the media section (line 299)
- Add filtered empty state

### Step 9: Verification

Run `npm run build` and fix any TS errors.

---

## Key Design Decisions

1. **Client-side Supabase queries preserved** — filters are applied directly on Supabase query builder, no new API routes needed. RLS handles authorization.
2. **Sorting by `date_taken` filters out nulls** — "sort by date taken" implicitly shows only images with EXIF dates. This is the correct UX; items without date_taken have no meaningful sort position.
3. **Album mode: client-side re-sort** — when a non-default sort is applied in album view, the 50-item page is sorted in-memory after the join. This keeps the album_media cursor pagination intact.
4. **No external UI libraries** — native `<select>` and `<input type="date">` plus Tailwind. Matches existing patterns.
5. **Quick camera chips** — innovative shortcut showing the 3 most-used cameras as always-visible toggle chips above the filter panel.
6. **Reverse geocoding via Nominatim** — free OpenStreetMap API, called best-effort during thumbnail processing. No npm dependency needed (uses native `fetch`). Stores country/state/city in DB for fast filtering. Existing photos with lat/lon but no location names can be backfilled later.
7. **Hierarchical location filter** — first select country (dropdown populated from data), then optionally narrow by state/province. Both stored as indexed columns.

## Existing Code to Reuse

- `formatBytes()` from `src/lib/utils/index.ts:5` — for file size display in metadata panel and filter labels
- `cn()` from `src/lib/utils/index.ts:1` — conditional classnames
- `MediaType` enum from `src/domain/enums/media-type.ts` — for filter type matching
- `MediaMetadata` interface from `src/domain/entities/media-asset.ts:3` — already defines all metadata fields (will be extended with location names)
- `Button` from `src/presentation/components/ui/button.tsx` — for filter bar buttons
- `extractMetadata()` from `src/infrastructure/services/metadata-extraction-service.ts` — extend to include geocoding
- Thumbnail webhook at `src/app/api/webhooks/thumbnail/route.ts:128-141` — where metadata is written to DB

## Verification

1. **Build check**: `npm run build` should pass with no new TS errors
2. **Group page**: Navigate to a group, verify filter bar appears below "All Photos" heading. Toggle media type, select a camera, apply date range. Verify media grid updates after each filter change. Verify sort dropdown changes ordering.
3. **Album page**: Same as group page but within an album context.
4. **Cursor pagination**: Apply a filter, scroll to load more pages. Verify items load correctly without duplicates.
5. **Quick camera chips**: Verify top 3 cameras shown, clicking toggles filter, active state highlighted.
6. **Lightbox metadata**: Open an image in lightbox, press "i" or click info button. Verify EXIF data displayed. Navigate between images — panel content updates. Check "View on map" link opens correct coordinates.
7. **Empty state**: Apply filters that match nothing → "No media matches your filters" with clear button works.
8. **No filters**: Verify default behavior (no filters, sort by created_at desc) is unchanged from before.
9. **Location filter**: Select a country in the location dropdown. Verify media is filtered to that country. Select a state within the country for further narrowing.
10. **Metadata panel location**: Open an image with GPS data in lightbox, press "i". Verify country/state/city shown alongside coordinates.
