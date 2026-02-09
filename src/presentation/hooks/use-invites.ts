"use client";

import { useState, useCallback } from "react";
import type { InviteResponseDTO } from "@/application/dto/invite-dto";

interface UseInvitesOptions {
  groupId: string;
}

export function useInvites({ groupId }: UseInvitesOptions) {
  const [invites, setInvites] = useState<InviteResponseDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInvites = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/groups/${groupId}/invites`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to fetch invites");
      }

      const data = await response.json();
      setInvites(data.invites);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch invites");
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  const createInvite = useCallback(
    async (options: { expiresInHours?: number; maxUses?: number }): Promise<InviteResponseDTO | null> => {
      try {
        const response = await fetch("/api/invites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ groupId, ...options }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to create invite");
        }

        const invite = await response.json();
        setInvites((prev) => [invite, ...prev]);
        return invite;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create invite");
        return null;
      }
    },
    [groupId]
  );

  const revokeInvite = useCallback(async (inviteId: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/invites/${inviteId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to revoke invite");
      }

      // Update local state to mark as revoked
      setInvites((prev) =>
        prev.map((i) =>
          i.id === inviteId
            ? { ...i, revokedAt: new Date().toISOString(), isRevoked: true, isValid: false }
            : i
        )
      );
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke invite");
      return false;
    }
  }, []);

  return {
    invites,
    loading,
    error,
    fetchInvites,
    createInvite,
    revokeInvite,
    clearError: () => setError(null),
  };
}
