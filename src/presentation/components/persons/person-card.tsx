"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { PersonDTO } from "@/presentation/hooks/use-persons";

interface PersonCardProps {
  person: PersonDTO;
  groupId: string;
  onRename: (personId: string, name: string) => Promise<boolean>;
  onDismiss: (personId: string) => Promise<boolean>;
}

export function PersonCard({ person, groupId, onRename, onDismiss }: PersonCardProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(person.name || "");

  const handleRename = async () => {
    if (!name.trim()) return;
    const ok = await onRename(person.id, name.trim());
    if (ok) setEditing(false);
  };

  return (
    <div className="group relative text-center">
      <Link href={`/groups/${groupId}/people/${person.id}`}>
        <div className="w-full aspect-square rounded-full overflow-hidden bg-gray-200 dark:bg-gray-800 mx-auto mb-2 relative">
          {person.faceCropUrl ? (
            <Image
              src={person.faceCropUrl}
              alt={person.name || "Unknown person"}
              fill
              unoptimized
              className="object-cover"
              sizes="120px"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <svg
                className="w-10 h-10 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
          )}
        </div>
      </Link>

      {editing ? (
        <div className="flex gap-1 items-center justify-center">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename();
              if (e.key === "Escape") setEditing(false);
            }}
            autoFocus
            className="w-20 px-1 py-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-transparent text-center"
          />
          <button
            onClick={handleRename}
            className="text-xs text-blue-600 hover:text-blue-700"
          >
            Save
          </button>
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="text-sm truncate max-w-full hover:underline"
          title="Click to rename"
        >
          {person.name || "Add name"}
        </button>
      )}

      <p className="text-xs text-gray-500">
        {person.faceCount} photo{person.faceCount !== 1 ? "s" : ""}
      </p>

      {/* Dismiss button on hover */}
      <button
        onClick={() => onDismiss(person.id)}
        className="absolute -top-1 -right-1 p-1 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
        title="Dismiss this person"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
