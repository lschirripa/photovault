"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/infrastructure/supabase/browser";
import type { Group } from "@/domain/entities/group";
import type { Tables } from "@/types/supabase";

interface CreateGroupInput {
  name: string;
  description?: string;
}

export function useGroups() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = (await supabase
        .from("groups")
        .select(
          `
          *,
          group_members!inner(user_id)
        `
        )
        .order("created_at", { ascending: false })) as unknown as { data: Tables<"groups">[] | null; error: Error | null };

      if (fetchError) throw fetchError;

      const mappedGroups: Group[] = (data ?? []).map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        coverImageUrl: g.cover_image_url,
        createdBy: g.created_by,
        createdAt: new Date(g.created_at),
        updatedAt: new Date(g.updated_at),
      }));

      setGroups(mappedGroups);
      return mappedGroups;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch groups";
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  const createGroup = useCallback(
    async ({ name, description }: CreateGroupInput) => {
      setLoading(true);
      setError(null);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const { data, error: createError } = (await (supabase
          .from("groups") as ReturnType<typeof supabase.from>)
          .insert({
            name,
            description,
            created_by: user.id,
          })
          .select()
          .single()) as { data: Tables<"groups"> | null; error: Error | null };

        if (createError) throw createError;
        if (!data) throw new Error("Failed to create group");

        // Add creator as owner
        const { error: memberError } = await (supabase.from("group_members") as ReturnType<typeof supabase.from>).insert({
          group_id: data.id,
          user_id: user.id,
          role: "owner",
        });

        if (memberError) throw memberError;

        const newGroup: Group = {
          id: data.id,
          name: data.name,
          description: data.description,
          coverImageUrl: data.cover_image_url,
          createdBy: data.created_by,
          createdAt: new Date(data.created_at),
          updatedAt: new Date(data.updated_at),
        };

        setGroups((prev) => [newGroup, ...prev]);
        return newGroup;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create group";
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [supabase]
  );

  const deleteGroup = useCallback(
    async (groupId: string) => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/groups/${groupId}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to delete group");
        }

        setGroups((prev) => prev.filter((g) => g.id !== groupId));
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to delete group";
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const resetError = useCallback(() => setError(null), []);

  return {
    groups,
    loading,
    error,
    fetchGroups,
    createGroup,
    deleteGroup,
    resetError,
  };
}
