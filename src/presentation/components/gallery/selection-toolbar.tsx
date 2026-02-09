"use client";

import { Button } from "@/presentation/components/ui/button";

interface SelectionToolbarProps {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onDownloadZip: () => void;
  onDelete: () => void;
  onCancel: () => void;
  isDownloading: boolean;
  isDeleting: boolean;
  canDelete: boolean;
}

export function SelectionToolbar({
  selectedCount,
  totalCount,
  onSelectAll,
  onDeselectAll,
  onDownloadZip,
  onDelete,
  onCancel,
  isDownloading,
  isDeleting,
  canDelete,
}: SelectionToolbarProps) {
  const allSelected = selectedCount === totalCount && totalCount > 0;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 shadow-lg animate-in slide-in-from-bottom duration-200">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium">
            {selectedCount} selected
          </span>
          <button
            onClick={allSelected ? onDeselectAll : onSelectAll}
            className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            {allSelected ? "Deselect All" : "Select All"}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={isDownloading || isDeleting}
          >
            Cancel
          </Button>

          {canDelete && selectedCount > 0 && (
            <Button
              variant="danger"
              size="sm"
              onClick={onDelete}
              loading={isDeleting}
              disabled={isDownloading}
            >
              Delete ({selectedCount})
            </Button>
          )}

          <Button
            variant="primary"
            size="sm"
            onClick={onDownloadZip}
            loading={isDownloading}
            disabled={selectedCount === 0 || isDeleting}
          >
            <svg
              className="w-4 h-4 mr-1.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Download Zip
          </Button>
        </div>
      </div>
    </div>
  );
}
