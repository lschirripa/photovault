"use client";

import { useState, useCallback } from "react";

export interface PersonDTO {
  id: string;
  name: string | null;
  faceCount: number;
  faceCropUrl: string | null;
  createdAt: string;
}

interface UsePersonsOptions {
  groupId: string;
}

export function usePersons({ groupId }: UsePersonsOptions) {
  const [persons, setPersons] = useState<PersonDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPersons = useCallback(async () => {
    if (!groupId) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/persons?groupId=${groupId}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to fetch persons");
      }
      const data = await response.json();
      setPersons(data.persons);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch persons");
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  const renamePerson = useCallback(
    async (personId: string, name: string): Promise<boolean> => {
      try {
        const response = await fetch(`/api/persons/${personId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to rename person");
        }
        setPersons((prev) =>
          prev.map((p) => (p.id === personId ? { ...p, name } : p))
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to rename");
        return false;
      }
    },
    []
  );

  const mergePersons = useCallback(
    async (sourceId: string, targetId: string): Promise<boolean> => {
      try {
        const response = await fetch("/api/persons/merge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceId, targetId }),
        });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to merge persons");
        }
        const result = await response.json();
        // Remove source, update target face count
        setPersons((prev) =>
          prev
            .filter((p) => p.id !== sourceId)
            .map((p) =>
              p.id === targetId
                ? { ...p, faceCount: result.totalFaceCount }
                : p
            )
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to merge");
        return false;
      }
    },
    []
  );

  const dismissPerson = useCallback(
    async (personId: string): Promise<boolean> => {
      try {
        const response = await fetch(`/api/persons/${personId}`, {
          method: "DELETE",
        });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to dismiss person");
        }
        setPersons((prev) => prev.filter((p) => p.id !== personId));
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to dismiss");
        return false;
      }
    },
    []
  );

  return {
    persons,
    loading,
    error,
    fetchPersons,
    renamePerson,
    mergePersons,
    dismissPerson,
    clearError: () => setError(null),
  };
}
