"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/presentation/components/ui/button";
import type { LocationData } from "@/presentation/hooks/use-media-filter-options";
import type { MediaFilters, MediaSort } from "@/domain/types/media-filters";
import {
  SORT_OPTIONS,
  SIZE_PRESETS,
  countActiveFilters,
  isFiltersActive,
} from "@/domain/types/media-filters";

interface MediaFilterBarProps {
  filters: MediaFilters;
  sort: MediaSort;
  onFiltersChange: (filters: MediaFilters) => void;
  onSortChange: (sort: MediaSort) => void;
  locationData: LocationData;
  hasAnyLocation: boolean;
  dateRange: { earliest: string | null; latest: string | null };
  fetchLocationChildren: (country?: string, state?: string) => void;
  resultCount?: number;
}

export function MediaFilterBar({
  filters,
  sort,
  onFiltersChange,
  onSortChange,
  locationData,
  hasAnyLocation,
  dateRange,
  fetchLocationChildren,
}: MediaFilterBarProps) {
  const [expanded, setExpanded] = useState(false);
  const activeCount = countActiveFilters(filters);

  const sortIndex = SORT_OPTIONS.findIndex(
    (o) => o.field === sort.field && o.direction === sort.direction
  );

  // Refresh location children when country/state changes
  useEffect(() => {
    fetchLocationChildren(filters.locationCountry, filters.locationState);
  }, [filters.locationCountry, filters.locationState, fetchLocationChildren]);

  const handleSortChange = (index: number) => {
    const opt = SORT_OPTIONS[index];
    if (opt) {
      onSortChange({ field: opt.field, direction: opt.direction });
    }
  };

  const clearAll = () => {
    onFiltersChange({});
  };

  // Build active filter chips
  const activeChips: { label: string; key: string }[] = [];
  if (filters.mediaType) {
    activeChips.push({
      label: filters.mediaType === "image" ? "Photos" : "Videos",
      key: "mediaType",
    });
  }
  if (filters.dateFrom || filters.dateTo) {
    const parts = [];
    if (filters.dateFrom) parts.push(`from ${filters.dateFrom}`);
    if (filters.dateTo) parts.push(`to ${filters.dateTo}`);
    activeChips.push({ label: `Date: ${parts.join(" ")}`, key: "date" });
  }
  if (filters.hasLocation) {
    activeChips.push({ label: "Has location", key: "hasLocation" });
  }
  if (filters.locationCountry) {
    activeChips.push({ label: filters.locationCountry, key: "locationCountry" });
  }
  if (filters.locationState) {
    activeChips.push({ label: filters.locationState, key: "locationState" });
  }
  if (filters.locationCity) {
    activeChips.push({ label: filters.locationCity, key: "locationCity" });
  }
  if (filters.minSizeBytes !== undefined || filters.maxSizeBytes !== undefined) {
    const preset = SIZE_PRESETS.find(
      (p) => p.minSizeBytes === filters.minSizeBytes && p.maxSizeBytes === filters.maxSizeBytes
    );
    activeChips.push({ label: `Size: ${preset?.label ?? "Custom"}`, key: "size" });
  }

  const removeChip = (key: string) => {
    const updated = { ...filters };
    switch (key) {
      case "mediaType":
        delete updated.mediaType;
        break;
      case "date":
        delete updated.dateFrom;
        delete updated.dateTo;
        break;
      case "hasLocation":
        delete updated.hasLocation;
        break;
      case "locationCountry":
        delete updated.locationCountry;
        delete updated.locationState;
        delete updated.locationCity;
        break;
      case "locationState":
        delete updated.locationState;
        delete updated.locationCity;
        break;
      case "locationCity":
        delete updated.locationCity;
        break;
      case "size":
        delete updated.minSizeBytes;
        delete updated.maxSizeBytes;
        break;
    }
    onFiltersChange(updated);
  };

  const selectClass =
    "h-8 px-2 text-sm rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="mb-4 space-y-2">
      {/* Top row: Sort + filter toggle */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Sort dropdown */}
        <select
          value={sortIndex}
          onChange={(e) => handleSortChange(Number(e.target.value))}
          className={selectClass}
        >
          {SORT_OPTIONS.map((opt, i) => (
            <option key={i} value={i}>
              {opt.label}
            </option>
          ))}
        </select>

        <div className="flex-1" />

        {/* Filter toggle button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          className="relative"
        >
          Filter
          {activeCount > 0 && (
            <span className="ml-1 inline-flex items-center justify-center w-5 h-5 text-xs rounded-full bg-blue-600 text-white">
              {activeCount}
            </span>
          )}
          <svg
            className={cn("w-4 h-4 ml-1 transition-transform", expanded && "rotate-180")}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </Button>
      </div>

      {/* Expanded filter panel */}
      {expanded && (
        <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 space-y-3">
          {/* Type */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400 w-16 shrink-0">Type:</span>
            <div className="flex gap-1">
              {(["all", "image", "video"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() =>
                    onFiltersChange({
                      ...filters,
                      mediaType: type === "all" ? undefined : type,
                    })
                  }
                  className={cn(
                    "px-3 py-1 text-xs rounded-md transition-colors",
                    (type === "all" && !filters.mediaType) ||
                      filters.mediaType === type
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-700"
                  )}
                >
                  {type === "all" ? "All" : type === "image" ? "Photos" : "Videos"}
                </button>
              ))}
            </div>
          </div>

          {/* Date range */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400 w-16 shrink-0">Date:</span>
            <input
              type="date"
              value={filters.dateFrom ?? ""}
              min={dateRange.earliest?.slice(0, 10) ?? undefined}
              max={filters.dateTo ?? dateRange.latest?.slice(0, 10) ?? undefined}
              onChange={(e) =>
                onFiltersChange({
                  ...filters,
                  dateFrom: e.target.value || undefined,
                })
              }
              className={selectClass}
            />
            <span className="text-sm text-gray-500">&mdash;</span>
            <input
              type="date"
              value={filters.dateTo ?? ""}
              min={filters.dateFrom ?? dateRange.earliest?.slice(0, 10) ?? undefined}
              max={dateRange.latest?.slice(0, 10) ?? undefined}
              onChange={(e) =>
                onFiltersChange({
                  ...filters,
                  dateTo: e.target.value || undefined,
                })
              }
              className={selectClass}
            />
          </div>

          {/* Location — cascading Country → State/Province → City */}
          {(locationData.countries.length > 0 || hasAnyLocation) && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-600 dark:text-gray-400 w-16 shrink-0">Location:</span>

              {/* Country */}
              <select
                value={filters.locationCountry ?? ""}
                onChange={(e) =>
                  onFiltersChange({
                    ...filters,
                    locationCountry: e.target.value || undefined,
                    locationState: undefined,
                    locationCity: undefined,
                  })
                }
                className={selectClass}
              >
                <option value="">All countries</option>
                {locationData.countries.map((loc) => (
                  <option key={loc.value} value={loc.value}>
                    {loc.label} ({loc.count})
                  </option>
                ))}
              </select>

              {/* State/Province — only when country selected and states exist */}
              {filters.locationCountry && locationData.states.length > 0 && (
                <select
                  value={filters.locationState ?? ""}
                  onChange={(e) =>
                    onFiltersChange({
                      ...filters,
                      locationState: e.target.value || undefined,
                      locationCity: undefined,
                    })
                  }
                  className={selectClass}
                >
                  <option value="">All states/provinces</option>
                  {locationData.states.map((loc) => (
                    <option key={loc.value} value={loc.value}>
                      {loc.label} ({loc.count})
                    </option>
                  ))}
                </select>
              )}

              {/* City — only when state selected and cities exist */}
              {filters.locationState && locationData.cities.length > 0 && (
                <select
                  value={filters.locationCity ?? ""}
                  onChange={(e) =>
                    onFiltersChange({
                      ...filters,
                      locationCity: e.target.value || undefined,
                    })
                  }
                  className={selectClass}
                >
                  <option value="">All cities</option>
                  {locationData.cities.map((loc) => (
                    <option key={loc.value} value={loc.value}>
                      {loc.label} ({loc.count})
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Size presets */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400 w-16 shrink-0">Size:</span>
            <div className="flex gap-1">
              {SIZE_PRESETS.map((preset) => {
                const isActive =
                  filters.minSizeBytes === preset.minSizeBytes &&
                  filters.maxSizeBytes === preset.maxSizeBytes;
                return (
                  <button
                    key={preset.label}
                    onClick={() =>
                      onFiltersChange({
                        ...filters,
                        minSizeBytes: preset.minSizeBytes,
                        maxSizeBytes: preset.maxSizeBytes,
                      })
                    }
                    className={cn(
                      "px-3 py-1 text-xs rounded-md transition-colors",
                      isActive
                        ? "bg-blue-600 text-white"
                        : "bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-700"
                    )}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Active filter chips */}
      {activeChips.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {activeChips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200"
            >
              {chip.label}
              <button
                onClick={() => removeChip(chip.key)}
                className="hover:text-blue-600 dark:hover:text-blue-100"
              >
                &times;
              </button>
            </span>
          ))}
          {isFiltersActive(filters) && (
            <button
              onClick={clearAll}
              className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
