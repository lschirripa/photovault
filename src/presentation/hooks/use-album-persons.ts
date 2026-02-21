"use client";

import { useState, useCallback } from "react";
import type { PersonDTO } from "@/presentation/hooks/use-persons";

interface UseAlbumPersonsOptions {
  albumId: string;
}

export function useAlbumPersons({ albumId }: UseAlbumPersonsOptions) {
  const [persons, setPersons] = useState<PersonDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPersons = useCallback(async () => {
    if (!albumId) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/albums/${albumId}/persons`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to fetch album persons");
      }
      const data = await response.json();
      setPersons(data.persons);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch album persons");
    } finally {
      setLoading(false);
    }
  }, [albumId]);

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

  return {
    persons,
    loading,
    error,
    fetchPersons,
    renamePerson,
  };
}
