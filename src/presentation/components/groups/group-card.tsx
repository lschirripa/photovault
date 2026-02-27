"use client";

import { memo } from "react";
import Image from "next/image";
import Link from "next/link";
import type { GroupWithStats } from "@/domain/entities/group";
import { MemberRole } from "@/domain/enums/member-role";
import { formatRelativeTime } from "@/lib/utils";

interface GroupCardProps {
  group: GroupWithStats;
  coverUrl: string | null;
  isOwner: boolean;
  isPinned?: boolean;
  onDelete: () => void;
  onPin?: () => void;
}

const roleBadge: Record<MemberRole, { label: string; className: string }> = {
  [MemberRole.OWNER]: {
    label: "Owner",
    className: "bg-amber-500/90 text-white",
  },
  [MemberRole.ADMIN]: {
    label: "Admin",
    className: "bg-blue-500/90 text-white",
  },
  [MemberRole.MEMBER]: {
    label: "Member",
    className: "bg-white/80 text-gray-700",
  },
};

function GroupCardInner({ group, coverUrl, isOwner, isPinned, onDelete, onPin }: GroupCardProps) {
  const badge = roleBadge[group.userRole];

  return (
    <div className="group relative rounded-xl overflow-hidden transition-all duration-200 hover:scale-[1.02] hover:shadow-lg">
      <Link href={`/groups/${group.id}`}>
        <div className="aspect-[4/3] relative">
          {/* Background: single cover image or gradient fallback */}
          {coverUrl ? (
            <Image
              src={coverUrl}
              alt=""
              fill
              unoptimized
              className="object-cover"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-800 dark:to-gray-700 flex items-center justify-center">
              <svg
                className="w-12 h-12 text-gray-400 dark:text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
          )}

          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

          {/* Role badge — top left */}
          <span
            className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs font-medium ${badge.className}`}
          >
            {badge.label}
          </span>

          {/* Bottom content */}
          <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
            <h3 className="font-semibold truncate">{group.name}</h3>
            <div className="flex items-center gap-3 text-xs text-gray-300 mt-1">
              <span>{group.memberCount} {group.memberCount === 1 ? "member" : "members"}</span>
              <span>{group.mediaCount} {group.mediaCount === 1 ? "photo" : "photos"}</span>
              {group.lastActivityAt && (
                <span>{formatRelativeTime(group.lastActivityAt)}</span>
              )}
            </div>
          </div>
        </div>
      </Link>

      {/* Pin button — top right area, visible on hover */}
      {onPin && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onPin();
          }}
          className={`absolute top-2 right-10 p-1.5 rounded-full text-white transition-opacity ${
            isPinned
              ? "bg-blue-500 opacity-100"
              : "bg-black/50 hover:bg-black/70 opacity-0 group-hover:opacity-100"
          }`}
          title={isPinned ? "Unpin group" : "Pin group"}
        >
          <svg className="w-4 h-4" fill={isPinned ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 4h6v7l2 3H7l2-3V4z"
            />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14v7" />
          </svg>
        </button>
      )}

      {/* Delete button — owner only, visible on hover */}
      {isOwner && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete();
          }}
          className="absolute top-2 right-2 p-1.5 bg-red-500 hover:bg-red-600 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
          title="Delete group"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

export const GroupCard = memo(GroupCardInner);
GroupCard.displayName = "GroupCard";
