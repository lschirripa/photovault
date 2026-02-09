"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/presentation/providers/auth-provider";

export default function SettingsPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<{ cleaned: number } | null>(null);
  const [cleanupRunning, setCleanupRunning] = useState(false);
  const [cleanupError, setCleanupError] = useState<string | null>(null);
  const router = useRouter();

  const handleCleanup = async () => {
    setCleanupRunning(true);
    setCleanupResult(null);
    setCleanupError(null);
    try {
      const res = await fetch("/api/admin/cleanup", { method: "POST" });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Cleanup failed");
      }
      const data = await res.json();
      setCleanupResult(data);
    } catch (error) {
      setCleanupError(error instanceof Error ? error.message : "Cleanup failed");
    } finally {
      setCleanupRunning(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      router.push("/");
    } catch (error) {
      console.error("Sign out error:", error);
      setSigningOut(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="mb-4">Please sign in</p>
          <Link href="/signin" className="text-blue-600 hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      </header>

      <div className="max-w-2xl space-y-8">
        <section className="border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4">Account</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-500 mb-1">Email</label>
              <p>{user.email}</p>
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">User ID</label>
              <p className="font-mono text-sm">{user.id}</p>
            </div>
          </div>
        </section>

        <section className="border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4">Session</h2>
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="px-4 py-2 border border-red-300 dark:border-red-800 text-red-600 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
          >
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </section>

        <section className="border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4">Maintenance</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Remove orphaned uploads stuck in &quot;uploading&quot; or &quot;processing&quot; state for over 1 hour.
            This runs automatically every hour, but you can trigger it manually.
          </p>
          <button
            onClick={handleCleanup}
            disabled={cleanupRunning}
            className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            {cleanupRunning ? "Cleaning up..." : "Clean up orphaned uploads"}
          </button>
          {cleanupResult !== null && (
            <p className="mt-3 text-sm text-green-600 dark:text-green-400">
              {cleanupResult.cleaned === 0
                ? "No orphaned uploads found."
                : `Cleaned up ${cleanupResult.cleaned} orphaned upload${cleanupResult.cleaned === 1 ? "" : "s"}.`}
            </p>
          )}
          {cleanupError && (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400">
              {cleanupError}
            </p>
          )}
        </section>

        <section className="border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4">About</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            PhotoVault - Private group-based photo and video sharing
          </p>
          <p className="text-sm text-gray-500 mt-2">Version 0.1.0</p>
        </section>
      </div>
    </div>
  );
}
