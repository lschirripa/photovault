"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/infrastructure/supabase/browser";
import type { GroupWithStats } from "@/domain/entities/group";
import { MemberRole } from "@/domain/enums/member-role";
import type { Tables } from "@/types/supabase";

interface CreateGroupInput {
  name: string;
  description?: string;
}

type GroupMemberRow = Tables<"group_members">;
type MediaAssetRow = Pick<Tables<"media_assets">, "group_id" | "created_at">;

export function useGroups() {
  const [groups, setGroups] = useState<GroupWithStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) throw new Error("Not authenticated");

      // 1. Fetch groups the user belongs to, with their role
      const { data: memberRows, error: memberError } = (await supabase
        .from("group_members")
        .select(`
          role,
          groups!inner(*)
        `)
        .eq("user_id", authUser.id)) as unknown as {
        data: (GroupMemberRow & { groups: Tables<"groups"> })[] | null;
        error: Error | null;
      };

      if (memberError) throw memberError;
      if (!memberRows || memberRows.length === 0) {
        setGroups([]);
        return [];
      }

      const groupIds = memberRows.map((r) => r.groups.id);
      const roleByGroupId = new Map<string, MemberRole>();
      for (const r of memberRows) {
        roleByGroupId.set(r.groups.id, r.role as MemberRole);
      }

      // 2. Fetch all member counts for these groups
      const { data: allMembers, error: membersError } = (await supabase
        .from("group_members")
        .select("group_id")
        .in("group_id", groupIds)) as unknown as {
        data: { group_id: string }[] | null;
        error: Error | null;
      };

      if (membersError) throw membersError;

      const memberCountMap = new Map<string, number>();
      for (const m of allMembers ?? []) {
        memberCountMap.set(m.group_id, (memberCountMap.get(m.group_id) ?? 0) + 1);
      }

      // 3. Fetch media counts and last activity per group
      const { data: mediaRows, error: mediaError } = (await supabase
        .from("media_assets")
        .select("group_id, created_at")
        .in("group_id", groupIds)
        .eq("status", "ready")
        .order("created_at", { ascending: false })
        .limit(1000)) as unknown as {
        data: MediaAssetRow[] | null;
        error: Error | null;
      };

      if (mediaError) throw mediaError;

      const mediaCountMap = new Map<string, number>();
      const lastActivityMap = new Map<string, Date>();

      for (const m of mediaRows ?? []) {
        mediaCountMap.set(m.group_id, (mediaCountMap.get(m.group_id) ?? 0) + 1);

        const createdAt = new Date(m.created_at);
        if (!lastActivityMap.has(m.group_id) || createdAt > lastActivityMap.get(m.group_id)!) {
          lastActivityMap.set(m.group_id, createdAt);
        }
      }

      // Build GroupWithStats array
      const result: GroupWithStats[] = memberRows.map((r) => {
        const g = r.groups;
        return {
          id: g.id,
          name: g.name,
          description: g.description,
          coverImageUrl: g.cover_image_url,
          coverMediaId: g.cover_media_id,
          createdBy: g.created_by,
          createdAt: new Date(g.created_at),
          updatedAt: new Date(g.updated_at),
          memberCount: memberCountMap.get(g.id) ?? 0,
          mediaCount: mediaCountMap.get(g.id) ?? 0,
          userRole: roleByGroupId.get(g.id) ?? MemberRole.MEMBER,
          lastActivityAt: lastActivityMap.get(g.id) ?? null,
          recentMediaIds: [],
        };
      });

      // Sort by last activity (most active first), then created_at desc
      result.sort((a, b) => {
        const aTime = a.lastActivityAt?.getTime() ?? 0;
        const bTime = b.lastActivityAt?.getTime() ?? 0;
        if (aTime !== bTime) return bTime - aTime;
        return b.createdAt.getTime() - a.createdAt.getTime();
      });

      setGroups((prev) => {
        const prevIds = prev.map((g) => g.id).join(",");
        const nextIds = result.map((g) => g.id).join(",");
        if (prevIds === nextIds) {
          const changed = result.some(
            (g, i) =>
              g.updatedAt.getTime() !== prev[i]?.updatedAt.getTime() ||
              g.coverMediaId !== prev[i]?.coverMediaId
          );
          if (!changed) return prev;
        }
        return result;
      });
      return result;
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

        const newGroup: GroupWithStats = {
          id: data.id,
          name: data.name,
          description: data.description,
          coverImageUrl: data.cover_image_url,
          coverMediaId: data.cover_media_id,
          createdBy: data.created_by,
          createdAt: new Date(data.created_at),
          updatedAt: new Date(data.updated_at),
          memberCount: 1,
          mediaCount: 0,
          userRole: MemberRole.OWNER,
          lastActivityAt: null,
          recentMediaIds: [],
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
