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
  const [dismissedPersons, setDismissedPersons] = useState<PersonDTO[]>([]);
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

  const fetchDismissedPersons = useCallback(async () => {
    if (!groupId) return;
    try {
      const response = await fetch(`/api/persons?groupId=${groupId}&dismissed=true`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to fetch dismissed persons");
      }
      const data = await response.json();
      setDismissedPersons(data.persons);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch dismissed persons");
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

  // Optimistic dismiss — removes from local state immediately and returns an undo fn.
  // The caller is responsible for the actual API call (DELETE) after the undo window.
  const dismissPerson = useCallback((personId: string): () => void => {
    let removed: PersonDTO | undefined;
    let removedIndex: number | undefined;

    setPersons((prev) => {
      removedIndex = prev.findIndex((p) => p.id === personId);
      if (removedIndex === -1) return prev;
      removed = prev[removedIndex];
      return prev.filter((p) => p.id !== personId);
    });

    // Undo: re-insert the person sorted by faceCount desc
    return () => {
      if (!removed) return;
      const person = removed;
      setPersons((prev) => {
        // Insert back in sorted position (by faceCount desc)
        const insertAt = prev.findIndex((p) => p.faceCount < person.faceCount);
        if (insertAt === -1) return [...prev, person];
        const next = [...prev];
        next.splice(insertAt, 0, person);
        return next;
      });
    };
  }, []);

  const restorePerson = useCallback(
    async (personId: string): Promise<boolean> => {
      try {
        const response = await fetch(`/api/persons/${personId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dismissed: false }),
        });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to restore person");
        }

        // Move from dismissedPersons → persons (sorted by faceCount desc)
        setDismissedPersons((prev) => {
          const person = prev.find((p) => p.id === personId);
          if (!person) return prev;
          setPersons((active) => {
            const insertAt = active.findIndex((p) => p.faceCount < person.faceCount);
            if (insertAt === -1) return [...active, person];
            const next = [...active];
            next.splice(insertAt, 0, person);
            return next;
          });
          return prev.filter((p) => p.id !== personId);
        });

        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to restore");
        return false;
      }
    },
    []
  );

  return {
    persons,
    dismissedPersons,
    loading,
    error,
    fetchPersons,
    fetchDismissedPersons,
    renamePerson,
    mergePersons,
    dismissPerson,
    restorePerson,
    clearError: () => setError(null),
  };
}
