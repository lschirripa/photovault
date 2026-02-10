"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/infrastructure/supabase/browser";

export function usePinnedGroup() {
  const [pinnedGroupId, setPinnedGroupId] = useState<string | null>(null);
  const [pinnedMediaIds, setPinnedMediaIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const fetchPinnedGroup = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = (await supabase
        .from("profiles")
        .select("pinned_group_id")
        .eq("id", user.id)
        .single()) as unknown as {
        data: { pinned_group_id: string | null } | null;
        error: Error | null;
      };

      const gId = profile?.pinned_group_id ?? null;
      setPinnedGroupId(gId);

      if (gId) {
        const { data: mediaRows } = (await supabase
          .from("media_assets")
          .select("id")
          .eq("group_id", gId)
          .eq("status", "ready")
          .order("created_at", { ascending: false })
          .limit(4)) as unknown as {
          data: { id: string }[] | null;
          error: Error | null;
        };

        setPinnedMediaIds((mediaRows ?? []).map((r) => r.id));
      } else {
        setPinnedMediaIds([]);
      }
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  const pinGroup = useCallback(
    async (groupId: string) => {
      const res = await fetch("/api/profile/pinned-group", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId }),
      });
      if (res.ok) {
        setPinnedGroupId(groupId);
        // Fetch media IDs for the newly pinned group
        const { data: mediaRows } = (await supabase
          .from("media_assets")
          .select("id")
          .eq("group_id", groupId)
          .eq("status", "ready")
          .order("created_at", { ascending: false })
          .limit(4)) as unknown as {
          data: { id: string }[] | null;
          error: Error | null;
        };
        setPinnedMediaIds((mediaRows ?? []).map((r) => r.id));
      }
    },
    [supabase]
  );

  const unpinGroup = useCallback(async () => {
    const res = await fetch("/api/profile/pinned-group", {
      method: "DELETE",
    });
    if (res.ok) {
      setPinnedGroupId(null);
      setPinnedMediaIds([]);
    }
  }, []);

  return {
    pinnedGroupId,
    pinnedMediaIds,
    loading,
    fetchPinnedGroup,
    pinGroup,
    unpinGroup,
  };
}
