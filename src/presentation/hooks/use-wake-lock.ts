"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useWakeLock() {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const [isActive, setIsActive] = useState(false);
  const wantLockRef = useRef(false);

  const isSupported =
    typeof navigator !== "undefined" &&
    "wakeLock" in navigator;

  const acquire = useCallback(async () => {
    if (!isSupported) return;
    try {
      const sentinel = await navigator.wakeLock.request("screen");
      sentinelRef.current = sentinel;
      setIsActive(true);
      sentinel.addEventListener("release", () => {
        setIsActive(false);
        sentinelRef.current = null;
      });
    } catch {
      // Permission denied or other failure — silently degrade
    }
  }, [isSupported]);

  const request = useCallback(async () => {
    wantLockRef.current = true;
    await acquire();
  }, [acquire]);

  const release = useCallback(async () => {
    wantLockRef.current = false;
    if (sentinelRef.current) {
      try {
        await sentinelRef.current.release();
      } catch {
        // Already released
      }
      sentinelRef.current = null;
      setIsActive(false);
    }
  }, []);

  // Re-acquire when tab becomes visible again (wake lock auto-releases on background)
  useEffect(() => {
    if (!isSupported) return;

    const handleVisibility = () => {
      if (document.visibilityState === "visible" && wantLockRef.current && !sentinelRef.current) {
        acquire();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [isSupported, acquire]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sentinelRef.current) {
        sentinelRef.current.release().catch(() => {});
        sentinelRef.current = null;
      }
    };
  }, []);

  return { request, release, isActive, isSupported };
}
