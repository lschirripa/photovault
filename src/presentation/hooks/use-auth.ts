"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/infrastructure/supabase/browser";
import { useAuth } from "@/presentation/providers/auth-provider";

interface SignUpInput {
  email: string;
  password: string;
  displayName: string;
}

interface SignInInput {
  email: string;
  password: string;
}

export function useAuthActions() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { refreshUser } = useAuth();
  const supabase = createClient();

  const signUp = useCallback(
    async ({ email, password, displayName }: SignUpInput) => {
      setLoading(true);
      setError(null);

      try {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: displayName,
            },
          },
        });

        if (signUpError) throw signUpError;

        if (data.user) {
          await refreshUser();
        }

        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Sign up failed";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [supabase.auth, refreshUser]
  );

  const signIn = useCallback(
    async ({ email, password }: SignInInput) => {
      setLoading(true);
      setError(null);

      try {
        const { data, error: signInError } =
          await supabase.auth.signInWithPassword({
            email,
            password,
          });

        if (signInError) throw signInError;

        await refreshUser();
        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Sign in failed";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [supabase.auth, refreshUser]
  );

  const signInWithOAuth = useCallback(
    async (provider: "google" | "apple" | "github") => {
      setLoading(true);
      setError(null);

      try {
        const { data, error: oauthError } = await supabase.auth.signInWithOAuth(
          {
            provider,
            options: {
              redirectTo: `${window.location.origin}/callback`,
            },
          }
        );

        if (oauthError) throw oauthError;
        return data;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "OAuth sign in failed";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [supabase.auth]
  );

  const signInWithMagicLink = useCallback(
    async (email: string) => {
      setLoading(true);
      setError(null);

      try {
        const { error: magicLinkError } = await supabase.auth.signInWithOtp({
          email,
          options: {
            // emailRedirectTo: `${window.location.origin}/callback`,
            emailRedirectTo: `${window.location.origin}/callback`,
          },
        });

        if (magicLinkError) throw magicLinkError;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Magic link failed";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [supabase.auth]
  );

  const resetError = useCallback(() => setError(null), []);

  return {
    signUp,
    signIn,
    signInWithOAuth,
    signInWithMagicLink,
    loading,
    error,
    resetError,
  };
}
