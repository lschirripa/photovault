"use client";

import { useEffect, useRef, useState } from "react";
import { useGroupActivity } from "@/presentation/hooks/use-group-activity";
import { ActivityFeed } from "@/presentation/components/groups/activity-feed";

export function ActivityDropdown() {
  const [open, setOpen] = useState(false);
  const { events, loading, fetchActivity } = useGroupActivity();
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch activity on first open
  useEffect(() => {
    if (open) {
      fetchActivity();
    }
  }, [open, fetchActivity]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;

    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-foreground hover:bg-gray-50 dark:hover:bg-gray-900 rounded-lg transition-colors"
        aria-label="Activity feed"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 max-h-[28rem] overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#0a0a0a] shadow-lg z-50">
          <div className="sticky top-0 bg-white dark:bg-[#0a0a0a] border-b border-gray-200 dark:border-gray-800 px-4 py-3">
            <h3 className="text-sm font-semibold">Recent Activity</h3>
          </div>
          <div className="p-4">
            <ActivityFeed events={events} loading={loading} />
          </div>
        </div>
      )}
    </div>
  );
}
