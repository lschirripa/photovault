"use client";

import { useCallback, useRef, useState } from "react";
import { createClient } from "@/infrastructure/supabase/browser";
import type { Tables } from "@/types/supabase";

export interface ActivityEvent {
  id: string;
  type: "upload" | "member_join" | "cover_changed" | "group_renamed";
  groupId: string;
  groupName: string;
  userId: string;
  displayName: string;
  timestamp: Date;
  filename?: string;
  metadata?: Record<string, unknown>;
}

type GroupMemberRow = Tables<"group_members">;

export function useGroupActivity() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();
  const fetched = useRef(false);

  const fetchActivity = useCallback(async () => {
    if (fetched.current) return;
    setLoading(true);

    try {
      // 1. Get the user's groups (IDs + names)
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: memberRows } = (await supabase
        .from("group_members")
        .select("group_id, groups!inner(id, name)")
        .eq("user_id", user.id)) as unknown as {
        data: (Pick<GroupMemberRow, "group_id"> & { groups: { id: string; name: string } })[] | null;
      };

      if (!memberRows || memberRows.length === 0) return;

      const groupIds = memberRows.map((r) => r.groups.id);
      const groupNameMap = new Map<string, string>();
      for (const r of memberRows) groupNameMap.set(r.groups.id, r.groups.name);

      // 2. Recent uploads
      const { data: uploads } = (await supabase
        .from("media_assets")
        .select("id, group_id, uploaded_by, filename, created_at")
        .in("group_id", groupIds)
        .eq("status", "ready")
        .order("created_at", { ascending: false })
        .limit(15)) as unknown as {
        data: {
          id: string;
          group_id: string;
          uploaded_by: string;
          filename: string;
          created_at: string;
        }[] | null;
      };

      // 3. Recent member joins
      const { data: joins } = (await supabase
        .from("group_members")
        .select("id, group_id, user_id, joined_at")
        .in("group_id", groupIds)
        .order("joined_at", { ascending: false })
        .limit(10)) as unknown as {
        data: {
          id: string;
          group_id: string;
          user_id: string;
          joined_at: string;
        }[] | null;
      };

      // 3b. Recent group activities (cover_changed, group_renamed)
      const { data: activities } = (await supabase
        .from("group_activities")
        .select("id, group_id, user_id, activity_type, metadata, created_at")
        .in("group_id", groupIds)
        .order("created_at", { ascending: false })
        .limit(10)) as unknown as {
        data: {
          id: string;
          group_id: string;
          user_id: string;
          activity_type: string;
          metadata: Record<string, unknown>;
          created_at: string;
        }[] | null;
      };

      // 4. Collect unique user IDs and fetch profiles
      const userIds = new Set<string>();
      for (const u of uploads ?? []) userIds.add(u.uploaded_by);
      for (const j of joins ?? []) userIds.add(j.user_id);
      for (const a of activities ?? []) userIds.add(a.user_id);

      const profileMap = new Map<string, string>();
      if (userIds.size > 0) {
        const { data: profiles } = (await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", Array.from(userIds))) as unknown as {
          data: { id: string; display_name: string }[] | null;
        };
        for (const p of profiles ?? []) {
          profileMap.set(p.id, p.display_name);
        }
      }

      // 5. Merge into ActivityEvent[]
      const allEvents: ActivityEvent[] = [];

      for (const u of uploads ?? []) {
        allEvents.push({
          id: `upload-${u.id}`,
          type: "upload",
          groupId: u.group_id,
          groupName: groupNameMap.get(u.group_id) ?? "Unknown",
          userId: u.uploaded_by,
          displayName: profileMap.get(u.uploaded_by) ?? "Someone",
          timestamp: new Date(u.created_at),
          filename: u.filename,
        });
      }

      for (const j of joins ?? []) {
        allEvents.push({
          id: `join-${j.id}`,
          type: "member_join",
          groupId: j.group_id,
          groupName: groupNameMap.get(j.group_id) ?? "Unknown",
          userId: j.user_id,
          displayName: profileMap.get(j.user_id) ?? "Someone",
          timestamp: new Date(j.joined_at),
        });
      }

      for (const a of activities ?? []) {
        allEvents.push({
          id: `activity-${a.id}`,
          type: a.activity_type as "cover_changed" | "group_renamed",
          groupId: a.group_id,
          groupName: groupNameMap.get(a.group_id) ?? "Unknown",
          userId: a.user_id,
          displayName: profileMap.get(a.user_id) ?? "Someone",
          timestamp: new Date(a.created_at),
          metadata: a.metadata,
        });
      }

      allEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      setEvents(allEvents.slice(0, 10));
      fetched.current = true;
    } catch {
      // Silently fail — activity feed is non-critical
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  return { events, loading, fetchActivity };
}
