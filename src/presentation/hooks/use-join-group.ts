"use client";

import { useState, useCallback } from "react";
import type { ValidateInviteResponseDTO, JoinGroupResponseDTO } from "@/application/dto/invite-dto";

export function useJoinGroup() {
  const [validating, setValidating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateInvite = useCallback(
    async (token: string): Promise<ValidateInviteResponseDTO> => {
      setValidating(true);
      setError(null);

      try {
        const response = await fetch(`/api/join?token=${encodeURIComponent(token)}`);
        const data: ValidateInviteResponseDTO = await response.json();

        if (!data.valid) {
          setError(data.error || "Invalid invite");
        }

        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to validate invite";
        setError(message);
        return { valid: false, error: message };
      } finally {
        setValidating(false);
      }
    },
    []
  );

  const joinGroup = useCallback(
    async (token: string): Promise<JoinGroupResponseDTO> => {
      setJoining(true);
      setError(null);

      try {
        const response = await fetch("/api/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const data: JoinGroupResponseDTO = await response.json();

        if (!data.success) {
          setError(data.error || "Failed to join group");
        }

        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to join group";
        setError(message);
        return { success: false, error: message };
      } finally {
        setJoining(false);
      }
    },
    []
  );

  return {
    validateInvite,
    joinGroup,
    validating,
    joining,
    error,
    clearError: () => setError(null),
  };
}
