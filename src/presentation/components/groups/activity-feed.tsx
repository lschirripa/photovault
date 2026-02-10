"use client";

import Link from "next/link";
import type { ActivityEvent } from "@/presentation/hooks/use-group-activity";
import { formatRelativeTime } from "@/lib/utils";

interface ActivityFeedProps {
  events: ActivityEvent[];
  loading: boolean;
}

export function ActivityFeed({ events, loading }: ActivityFeedProps) {
  if (loading) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 py-4">
        Loading activity...
      </p>
    );
  }

  if (events.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 py-4">
        No recent activity across your groups
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {events.map((event) => {
        const initial = event.displayName.charAt(0).toUpperCase();

        return (
          <li key={event.id} className="flex items-start gap-3">
            {/* Avatar initial */}
            <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                {initial}
              </span>
            </div>

            {/* Description */}
            <div className="flex-1 min-w-0 text-sm">
              <p className="text-gray-700 dark:text-gray-300">
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {event.displayName}
                </span>{" "}
                {event.type === "upload"
                  ? "uploaded a photo to"
                  : event.type === "member_join"
                    ? "joined"
                    : event.type === "cover_changed"
                      ? "changed the cover photo in"
                      : "renamed"}{" "}
                <Link
                  href={`/groups/${event.groupId}`}
                  className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {event.groupName}
                </Link>
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {formatRelativeTime(event.timestamp)}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
