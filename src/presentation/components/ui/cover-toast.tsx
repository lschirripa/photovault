"use client";

import { useEffect, useState } from "react";

interface CoverToastProps {
  message: string;
  visible: boolean;
  onHidden?: () => void;
}

export function CoverToast({ message, visible, onHidden }: CoverToastProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (visible) {
      setShow(true);
      const timer = setTimeout(() => {
        setShow(false);
        onHidden?.();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [visible, onHidden]);

  if (!show) return null;

  return (
    <div className="fixed bottom-6 left-6 z-50 flex items-center gap-2 min-w-48 bg-black/60 backdrop-blur-md text-white/90 rounded-xl shadow-lg px-4 py-3 animate-in slide-in-from-left-4 duration-200">
      <svg
        className="w-5 h-5 text-white/70 shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 13l4 4L19 7"
        />
      </svg>
      <span className="text-sm font-medium">{message}</span>
    </div>
  );
}
