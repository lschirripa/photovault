export type SortField = "created_at" | "date_taken" | "filename" | "size_bytes";
export type SortDirection = "asc" | "desc";

export interface MediaSort {
  field: SortField;
  direction: SortDirection;
}

export interface MediaFilters {
  mediaType?: "image" | "video";
  camera?: string; // "make|model" format
  dateFrom?: string; // ISO date string
  dateTo?: string; // ISO date string
  hasLocation?: boolean;
  locationCountry?: string;
  locationState?: string;
  locationCity?: string;
  minSizeBytes?: number;
  maxSizeBytes?: number;
}

export const DEFAULT_SORT: MediaSort = {
  field: "created_at",
  direction: "desc",
};

export const SORT_OPTIONS: { label: string; field: SortField; direction: SortDirection }[] = [
  { label: "Date uploaded (newest)", field: "created_at", direction: "desc" },
  { label: "Date uploaded (oldest)", field: "created_at", direction: "asc" },
  { label: "Date taken (newest)", field: "date_taken", direction: "desc" },
  { label: "Date taken (oldest)", field: "date_taken", direction: "asc" },
  { label: "Filename (A-Z)", field: "filename", direction: "asc" },
  { label: "Filename (Z-A)", field: "filename", direction: "desc" },
  { label: "Size (largest)", field: "size_bytes", direction: "desc" },
  { label: "Size (smallest)", field: "size_bytes", direction: "asc" },
];

export const SIZE_PRESETS = [
  { label: "Any", minSizeBytes: undefined, maxSizeBytes: undefined },
  { label: "<1 MB", minSizeBytes: undefined, maxSizeBytes: 1_000_000 },
  { label: "1-10 MB", minSizeBytes: 1_000_000, maxSizeBytes: 10_000_000 },
  { label: ">10 MB", minSizeBytes: 10_000_000, maxSizeBytes: undefined },
] as const;

export function isFiltersActive(filters: MediaFilters): boolean {
  return !!(
    filters.mediaType ||
    filters.camera ||
    filters.dateFrom ||
    filters.dateTo ||
    filters.hasLocation ||
    filters.locationCountry ||
    filters.locationState ||
    filters.locationCity ||
    filters.minSizeBytes ||
    filters.maxSizeBytes
  );
}

export function countActiveFilters(filters: MediaFilters): number {
  let count = 0;
  if (filters.mediaType) count++;
  if (filters.camera) count++;
  if (filters.dateFrom || filters.dateTo) count++;
  if (filters.hasLocation) count++;
  if (filters.locationCountry) count++;
  if (filters.locationState) count++;
  if (filters.locationCity) count++;
  if (filters.minSizeBytes !== undefined || filters.maxSizeBytes !== undefined) count++;
  return count;
}
