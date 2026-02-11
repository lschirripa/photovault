"use client";

import { memo } from "react";
import Image from "next/image";
import Link from "next/link";
import type { GroupWithStats } from "@/domain/entities/group";
import { formatRelativeTime } from "@/lib/utils";

interface GroupHeroProps {
  group: GroupWithStats;
  thumbnailUrls: Record<string, string>;
  recentMediaIds: string[];
  onUnpin: () => void;
}

function GroupHeroInner({ group, thumbnailUrls, recentMediaIds, onUnpin }: GroupHeroProps) {
  const photoIds = recentMediaIds.slice(0, 4);

  return (
    <div className="relative">
      <Link
        href={`/groups/${group.id}`}
        className="group block relative h-40 sm:h-52 lg:h-60 rounded-2xl overflow-hidden"
      >
        {/* Background: 4-column photo strip */}
        {photoIds.length > 0 ? (
          <div className="absolute inset-0 grid grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => {
              const mediaId = photoIds[i % photoIds.length];
              const url = mediaId ? thumbnailUrls[mediaId] : null;
              return url ? (
                <div key={i} className="relative overflow-hidden">
                  <Image
                    src={url}
                    alt=""
                    fill
                    unoptimized
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                    sizes="25vw"
                  />
                </div>
              ) : (
                <div key={i} className="bg-gray-300 dark:bg-gray-700" />
              );
            })}
          </div>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-gray-300 to-gray-400 dark:from-gray-700 dark:to-gray-800" />
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-transparent" />

        {/* Content */}
        <div className="absolute inset-0 flex flex-col justify-end p-5 sm:p-7 text-white">
          <span className="text-xs font-medium uppercase tracking-wider text-gray-300 mb-1">
            Pinned
          </span>
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold truncate">
            {group.name}
          </h2>
          {group.description && (
            <p className="text-sm text-gray-300 line-clamp-1 mt-1 max-w-lg">
              {group.description}
            </p>
          )}
          <div className="flex items-center gap-4 text-sm text-gray-300 mt-2">
            <span>{group.memberCount} {group.memberCount === 1 ? "member" : "members"}</span>
            <span>{group.mediaCount} {group.mediaCount === 1 ? "photo" : "photos"}</span>
            {group.lastActivityAt && (
              <span>Active {formatRelativeTime(group.lastActivityAt)}</span>
            )}
          </div>
        </div>
      </Link>

      {/* Unpin button */}
      <button
        onClick={onUnpin}
        className="absolute top-3 right-3 px-3 py-1.5 rounded-full bg-black/50 hover:bg-black/70 text-white text-xs font-medium transition-colors"
      >
        Unpin
      </button>
    </div>
  );
}

export const GroupHero = memo(GroupHeroInner);
GroupHero.displayName = "GroupHero";
