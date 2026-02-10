"use client";

import { useCallback, useState } from "react";

export function useGroupUpdate(groupId: string) {
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patchGroup = useCallback(
    async (body: Record<string, unknown>) => {
      setUpdating(true);
      setError(null);
      try {
        const res = await fetch(`/api/groups/${groupId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Update failed");
        }
        return await res.json();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Update failed";
        setError(message);
        return null;
      } finally {
        setUpdating(false);
      }
    },
    [groupId]
  );

  const setCover = useCallback(
    (mediaAssetId: string) => patchGroup({ cover_media_id: mediaAssetId }),
    [patchGroup]
  );

  const rename = useCallback(
    (name: string) => patchGroup({ name }),
    [patchGroup]
  );

  return { setCover, rename, updating, error };
}
