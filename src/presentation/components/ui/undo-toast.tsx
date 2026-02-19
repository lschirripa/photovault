"use client";

import { useEffect, useRef, useCallback } from "react";

export interface ToastItem {
  id: string;
  message: string;
  onUndo: () => void;
  onCommit: () => void;
  duration: number;
}

interface SingleToastProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

function SingleToast({ toast, onDismiss }: SingleToastProps) {
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const committedRef = useRef(false);

  const commit = useCallback(() => {
    if (committedRef.current) return;
    committedRef.current = true;
    toast.onCommit();
    onDismiss(toast.id);
  }, [toast, onDismiss]);

  const handleUndo = useCallback(() => {
    if (committedRef.current) return;
    committedRef.current = true;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    toast.onUndo();
    onDismiss(toast.id);
  }, [toast, onDismiss]);

  useEffect(() => {
    const tick = (now: number) => {
      if (startRef.current === null) startRef.current = now;
      const elapsed = now - startRef.current;
      const pct = Math.min(elapsed / toast.duration, 1);

      if (barRef.current) {
        barRef.current.style.width = `${(1 - pct) * 100}%`;
      }

      if (pct >= 1) {
        commit();
      } else {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [toast.duration, commit]);

  return (
    <div className="relative flex items-center gap-3 min-w-64 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg shadow-lg px-4 py-3 overflow-hidden animate-in slide-in-from-left-4 duration-200">
      <span className="text-sm flex-1">{toast.message}</span>
      <button
        onClick={handleUndo}
        className="text-sm font-semibold text-blue-400 dark:text-blue-600 hover:text-blue-300 dark:hover:text-blue-500 shrink-0"
      >
        Undo
      </button>
      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 h-0.5 bg-blue-400 dark:bg-blue-600 transition-none" ref={barRef} style={{ width: "100%" }} />
    </div>
  );
}

interface UndoToastProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
  className?: string;
}

export function UndoToast({ toasts, onDismiss, className }: UndoToastProps) {
  if (toasts.length === 0) return null;

  return (
    <div className={`fixed z-50 flex flex-col gap-2 ${className ?? "bottom-6 left-6"}`}>
      {toasts.map((toast) => (
        <SingleToast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
