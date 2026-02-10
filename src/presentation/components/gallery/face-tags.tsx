"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Image from "next/image";

interface FaceInfo {
  id: string;
  personId: string | null;
  personName: string | null;
  faceCropUrl: string | null;
  confidence: number;
  bbox: { x: number; y: number; w: number; h: number };
}

interface PersonOption {
  id: string;
  name: string | null;
  faceCropUrl: string | null;
}

interface FaceTagsProps {
  assetId: string;
  groupId: string;
}

export function FaceTags({ assetId, groupId }: FaceTagsProps) {
  const [faces, setFaces] = useState<FaceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFaceId, setActiveFaceId] = useState<string | null>(null);
  const [persons, setPersons] = useState<PersonOption[]>([]);
  const [personsLoading, setPersonsLoading] = useState(false);
  const [reassigning, setReassigning] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch faces for the current asset
  useEffect(() => {
    let cancelled = false;

    async function fetchFaces() {
      setLoading(true);
      try {
        const res = await fetch(`/api/media/${assetId}/faces`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setFaces(data.faces ?? []);
        }
      } catch {
        // silently fail - faces are non-critical
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchFaces();
    return () => { cancelled = true; };
  }, [assetId]);

  // Fetch all persons in group when dropdown opens
  const fetchPersons = useCallback(async () => {
    if (persons.length > 0) return; // already fetched
    setPersonsLoading(true);
    try {
      const res = await fetch(`/api/persons?groupId=${groupId}`);
      if (!res.ok) return;
      const data = await res.json();
      setPersons(
        (data.persons ?? []).map((p: { id: string; name: string | null; faceCropUrl: string | null }) => ({
          id: p.id,
          name: p.name,
          faceCropUrl: p.faceCropUrl,
        }))
      );
    } catch {
      // silently fail
    } finally {
      setPersonsLoading(false);
    }
  }, [groupId, persons.length]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setActiveFaceId(null);
      }
    }
    if (activeFaceId) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [activeFaceId]);

  const handleOpenDropdown = (faceId: string) => {
    if (activeFaceId === faceId) {
      setActiveFaceId(null);
    } else {
      setActiveFaceId(faceId);
      fetchPersons();
    }
  };

  const handleReassign = async (faceId: string, targetPersonId: string) => {
    setReassigning(faceId);
    try {
      const res = await fetch(`/api/detected-faces/${faceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetPersonId }),
      });

      if (!res.ok) return;

      const result = await res.json();

      // Update face in local state
      setFaces((prev) =>
        prev.map((f) => {
          if (f.id !== faceId) return f;
          const targetPerson = persons.find((p) => p.id === targetPersonId);
          return {
            ...f,
            personId: result.personId,
            personName: targetPerson?.name ?? null,
          };
        })
      );

      setActiveFaceId(null);
    } catch {
      // silently fail
    } finally {
      setReassigning(null);
    }
  };

  if (loading) return null;
  if (faces.length === 0) return null;

  return (
    <div className="px-4 pb-2">
      <div className="flex items-center gap-2 justify-center flex-wrap">
        <span className="text-xs text-gray-400 mr-1">Faces:</span>
        {faces.map((face) => (
          <div key={face.id} className="relative" ref={activeFaceId === face.id ? dropdownRef : undefined}>
            <button
              onClick={() => handleOpenDropdown(face.id)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs transition-colors ${
                activeFaceId === face.id
                  ? "bg-white/20 text-white"
                  : "bg-white/10 text-gray-300 hover:bg-white/15"
              } ${reassigning === face.id ? "opacity-50" : ""}`}
              disabled={reassigning === face.id}
            >
              {face.faceCropUrl ? (
                <Image
                  src={face.faceCropUrl}
                  alt={face.personName || "Unknown"}
                  width={20}
                  height={20}
                  className="w-5 h-5 rounded-full object-cover"
                  sizes="20px"
                />
              ) : (
                <span className="w-5 h-5 rounded-full bg-gray-600 flex items-center justify-center text-[10px]">?</span>
              )}
              <span>{face.personName || "Unknown"}</span>
            </button>

            {/* Dropdown */}
            {activeFaceId === face.id && (
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-56 max-h-64 overflow-y-auto bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50">
                <div className="p-2 border-b border-gray-700">
                  <span className="text-xs text-gray-400">Reassign to...</span>
                </div>
                {personsLoading ? (
                  <div className="p-3 text-center text-xs text-gray-400">Loading...</div>
                ) : (
                  <div className="py-1">
                    {persons
                      .filter((p) => p.id !== face.personId)
                      .map((person) => (
                        <button
                          key={person.id}
                          onClick={() => handleReassign(face.id, person.id)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 transition-colors"
                        >
                          {person.faceCropUrl ? (
                            <Image
                              src={person.faceCropUrl}
                              alt={person.name || "Unknown"}
                              width={24}
                              height={24}
                              className="w-6 h-6 rounded-full object-cover"
                              sizes="24px"
                            />
                          ) : (
                            <span className="w-6 h-6 rounded-full bg-gray-600 flex items-center justify-center text-xs">?</span>
                          )}
                          <span className="truncate">{person.name || "Unnamed"}</span>
                        </button>
                      ))}
                    {persons.filter((p) => p.id !== face.personId).length === 0 && (
                      <div className="px-3 py-2 text-xs text-gray-400">No other people found</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
