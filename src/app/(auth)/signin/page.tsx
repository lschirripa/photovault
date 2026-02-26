"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthActions } from "@/presentation/hooks/use-auth";
import { useAuth } from "@/presentation/providers/auth-provider";

export default function SignInPage() {
  return (
    <Suspense>
      <SignInPageContent />
    </Suspense>
  );
}

function SignInPageContent() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const { signIn, signInWithOAuth, signInWithMagicLink, loading, error, resetError } =
    useAuthActions();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawRedirect = searchParams.get("redirect");
  // Only allow relative paths to prevent open redirects
  const safeRedirect = rawRedirect?.startsWith("/") ? rawRedirect : null;
  const destination = safeRedirect ?? "/groups";

  useEffect(() => {
    if (!authLoading && user) {
      router.replace(destination);
    }
  }, [user, authLoading, router, destination]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signIn({ email, password });
      router.push(destination);
    } catch {
      // Error is handled by the hook
    }
  };

  const handleMagicLink = async () => {
    if (!email) return;
    try {
      await signInWithMagicLink(email, safeRedirect ?? undefined);
      setMagicLinkSent(true);
    } catch {
      // Error is handled by the hook
    }
  };

  const handleOAuth = async (provider: "google" | "apple" | "github") => {
    try {
      await signInWithOAuth(provider, safeRedirect ?? undefined);
    } catch {
      // Error is handled by the hook
    }
  };

  if (magicLinkSent) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <h1 className="text-2xl font-bold mb-4">Check your email</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            We sent a magic link to <strong>{email}</strong>
          </p>
          <button
            onClick={() => setMagicLinkSent(false)}
            className="text-sm text-blue-600 hover:underline"
          >
            Use a different method
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8 rounded-2xl border border-gray-200/60 dark:border-gray-800/60 shadow-lg p-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Sign in to your PhotoVault account
          </p>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            <button
              onClick={resetError}
              className="text-xs text-red-500 hover:underline mt-1"
            >
              Dismiss
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors hover:border-gray-400 dark:hover:border-gray-500"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors hover:border-gray-400 dark:hover:border-gray-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-foreground text-background rounded-lg hover:brightness-90 disabled:opacity-50 transition-all duration-200"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300 dark:border-gray-700" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-background text-gray-500">Or continue with</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => handleOAuth("google")}
            disabled={loading}
            className="py-2 px-4 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 disabled:opacity-50 transition-all duration-200 hover:shadow-sm"
          >
            Google
          </button>
          <button
            onClick={() => handleOAuth("github")}
            disabled={loading}
            className="py-2 px-4 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 disabled:opacity-50 transition-all duration-200 hover:shadow-sm"
          >
            GitHub
          </button>
        </div>

        <button
          onClick={handleMagicLink}
          disabled={loading || !email}
          className="w-full py-2 px-4 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 disabled:opacity-50 transition-all duration-200 hover:shadow-sm text-sm"
        >
          Send magic link
        </button>

        <p className="text-center text-sm text-gray-600 dark:text-gray-400">
          Don&apos;t have an account?{" "}
          <Link
            href={safeRedirect ? `/register?redirect=${encodeURIComponent(safeRedirect)}` : "/register"}
            className="text-blue-600 hover:underline"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
