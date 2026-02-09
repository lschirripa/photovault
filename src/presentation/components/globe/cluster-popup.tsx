"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import gsap from "gsap";
import Image from "next/image";

interface GroupData {
  groupId: string;
  groupName: string;
  locationCity?: string;
  locationCountry?: string;
  thumbnailUrl?: string | null;
  pointCount: number;
}

interface ClusterPopupProps {
  groups: GroupData[];
  onNavigate: (path: string) => void;
  onClose: () => void;
}

function GroupCard({
  group,
  onNavigate,
  onClick,
}: {
  group: GroupData;
  onNavigate: (path: string) => void;
  onClick: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className="group-card flex-shrink-0 w-[300px] bg-[#0a0a0a]/95 border border-white/10 rounded-2xl shadow-2xl p-6 text-white overflow-hidden select-none cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="flex flex-col items-center pointer-events-none">
        {/* Avatar */}
        <div className="w-16 h-16 rounded-full overflow-hidden mb-3 border-2 border-white/10 shadow-lg relative">
          {group.thumbnailUrl ? (
            <Image
              width={64}
              height={64}
              sizes="64px"
              src={group.thumbnailUrl}
              alt={group.groupName}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-tr from-rose-500 to-blue-500" />
          )}
        </div>

        {/* Name */}
        <h3 className="text-lg font-medium mb-1">{group.groupName}</h3>

        {/* Location */}
        <div className="flex items-center gap-1.5 text-sm text-white/60 mb-4">
          {group.locationCountry === "US" && (
            <span className="text-base">🇺🇸</span>
          )}
          <span>
            {[group.locationCity, group.locationCountry]
              .filter(Boolean)
              .join(", ")}
          </span>
        </div>

        {/* View Profile Button */}
        <button
          aria-label={`View profile for ${group.groupName}`}
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(`/groups/${group.groupId}`);
          }}
          className="px-4 py-2.5 min-h-[44px] rounded-full bg-[#1A1A1A] border border-white/10 text-sm text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 transition-colors pointer-events-auto"
        >
          View profile
        </button>

        {/* Photo count */}
        <p className="mt-4 text-xs text-white/50">
          {group.pointCount} {group.pointCount === 1 ? "photo" : "photos"}
        </p>
      </div>
    </div>
  );
}

const CARD_WIDTH = 300;
const CARD_GAP = 16;
const CARD_STEP = CARD_WIDTH + CARD_GAP;
const HALF_SLOTS = 3;
const TOTAL_SLOTS = HALF_SLOTS * 2 + 1; // 7

/** Modular wrap: always returns a value within [0, length) */
function wrapIndex(index: number, length: number): number {
  return ((index % length) + length) % length;
}

export function ClusterPopup({
  groups,
  onNavigate,
  onClose,
}: ClusterPopupProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const currentIndex = useRef(0);
  const gsapCtx = useRef<gsap.Context | null>(null);

  // Drag state refs (no React state — per-frame updates)
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartIndex = useRef(0);
  const dragDistance = useRef(0);
  const activeTween = useRef<gsap.core.Tween | null>(null);
  const velocityTracker = useRef<{ x: number; t: number }[]>([]);

  // renderIndex drives which group data each slot shows (React state for re-renders).
  // It's only updated when currentIndex snaps to an integer (not per-frame).
  const [renderIndex, setRenderIndex] = useState(0);

  const groupCount = groups.length;

  /** Update card transforms, scale, opacity per-frame. No React re-renders. */
  const updatePositions = useCallback(() => {
    const container = containerRef.current;
    if (!container || groupCount === 0) return;

    const containerWidth = container.offsetWidth;
    const centerX = containerWidth / 2 - CARD_WIDTH / 2;
    const ci = currentIndex.current;
    const ri = renderIndex;
    const frac = ci - ri;

    for (let slot = 0; slot < TOTAL_SLOTS; slot++) {
      const card = cardRefs.current[slot];
      if (!card) continue;

      const slotOffset = slot - HALF_SLOTS;
      const x = centerX + (slotOffset - frac) * CARD_STEP;
      const distFromCenter = Math.abs(slotOffset - frac);
      const progress = Math.min(distFromCenter / HALF_SLOTS, 1);

      const scale = 1.05 - progress * 0.3;
      const opacity = 1 - progress * 0.3;
      const zIndex = TOTAL_SLOTS - Math.round(distFromCenter);

      card.style.transform = `translateX(${x}px) scale(${scale})`;
      card.style.opacity = String(opacity);
      card.style.zIndex = String(zIndex);
    }
  }, [groupCount, renderIndex]);

  /** Animate currentIndex to a target integer, updating positions per-frame */
  const snapToIndex = useCallback(
    (targetIndex: number, duration: number = 0.5) => {
      activeTween.current?.kill();
      const proxy = { val: currentIndex.current };
      activeTween.current = gsap.to(proxy, {
        val: targetIndex,
        duration,
        ease: "power2.out",
        onUpdate: () => {
          currentIndex.current = proxy.val;
          const snapped = Math.round(proxy.val);
          setRenderIndex((prev) => (prev !== snapped ? snapped : prev));
          updatePositions();
        },
        onComplete: () => {
          currentIndex.current = targetIndex;
          setRenderIndex(targetIndex);
          activeTween.current = null;
        },
      });
    },
    [updatePositions],
  );

  // --- Pointer drag handlers ---
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Only primary button
      if (e.button !== 0) return;
      activeTween.current?.kill();
      activeTween.current = null;

      isDragging.current = true;
      dragStartX.current = e.clientX;
      dragStartIndex.current = currentIndex.current;
      dragDistance.current = 0;
      velocityTracker.current = [{ x: e.clientX, t: Date.now() }];

      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return;

      const deltaX = e.clientX - dragStartX.current;
      dragDistance.current = Math.abs(deltaX);

      // Update currentIndex proportionally to drag distance
      currentIndex.current = dragStartIndex.current - deltaX / CARD_STEP;

      // Update renderIndex when crossing integer boundary
      const snapped = Math.round(currentIndex.current);
      setRenderIndex((prev) => (prev !== snapped ? snapped : prev));

      updatePositions();

      // Track velocity (keep last 5)
      const tracker = velocityTracker.current;
      tracker.push({ x: e.clientX, t: Date.now() });
      if (tracker.length > 5) tracker.shift();
    },
    [updatePositions],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return;
      isDragging.current = false;

      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);

      const tracker = velocityTracker.current;
      if (tracker.length < 2) {
        // No meaningful drag — snap to nearest
        snapToIndex(Math.round(currentIndex.current), 0.4);
        return;
      }

      const first = tracker[0];
      const last = tracker[tracker.length - 1];
      const dt = (last.t - first.t) / 1000; // seconds
      const dx = last.x - first.x; // pixels

      // Velocity in cards/second (negative dx = positive index movement)
      const velocity = dt > 0 ? -dx / CARD_STEP / dt : 0;

      const DAMPING = 0.4;
      const targetIndex = Math.round(
        currentIndex.current + velocity * DAMPING,
      );
      const duration = Math.min(
        0.8,
        Math.abs(velocity) * 0.15 + 0.3,
      );

      snapToIndex(targetIndex, duration);
    },
    [snapToIndex],
  );

  /** Handle card click: if drag occurred, ignore. If centered, navigate. Otherwise snap to card. */
  const handleCardClick = useCallback(
    (slot: number) => {
      // Suppress click if user was dragging (> 5px threshold)
      if (dragDistance.current > 5) return;

      const logicalIndex = renderIndex + (slot - HALF_SLOTS);
      const centeredIndex = Math.round(currentIndex.current);

      if (logicalIndex === centeredIndex) {
        // Already centered — navigate to group
        const group = groups[wrapIndex(logicalIndex, groupCount)];
        onNavigate(`/groups/${group.groupId}`);
      } else {
        // Not centered — snap to this card
        snapToIndex(logicalIndex, 0.5);
      }
    },
    [renderIndex, groupCount, groups, onNavigate, snapToIndex],
  );

  /** Get the group for a given slot based on renderIndex */
  const getSlotGroup = useCallback(
    (slot: number): GroupData => {
      const logicalIndex = renderIndex + (slot - HALF_SLOTS);
      return groups[wrapIndex(logicalIndex, groupCount)];
    },
    [renderIndex, groups, groupCount],
  );

  // Setup GSAP context and initial positioning
  useEffect(() => {
    if (groupCount === 0) return;

    gsapCtx.current = gsap.context(() => {}, containerRef);

    const startIndex = Math.floor(groupCount / 2);
    currentIndex.current = startIndex;
    setRenderIndex(startIndex);

    return () => {
      gsapCtx.current?.revert();
    };
  }, [groupCount]);

  // Update positions whenever renderIndex changes (initial mount + snaps)
  useEffect(() => {
    requestAnimationFrame(() => {
      updatePositions();
    });
  }, [updatePositions]);

  // Focus close button on mount
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  // Escape to close (document-level so it works regardless of focus)
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  /** Keyboard navigation on the carousel container */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const ci = Math.round(currentIndex.current);
      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          snapToIndex(ci - 1, 0.4);
          break;
        case "ArrowRight":
          e.preventDefault();
          snapToIndex(ci + 1, 0.4);
          break;
        case "Enter":
        case " ": {
          e.preventDefault();
          const group = groups[wrapIndex(ci, groupCount)];
          onNavigate(`/groups/${group.groupId}`);
          break;
        }
      }
    },
    [snapToIndex, groups, groupCount, onNavigate],
  );

  if (groupCount === 0) return null;

  return (
    <div className="relative flex items-center justify-center w-full max-w-7xl mx-auto px-4 z-10!">
      {/* Close Button */}
      <button
        ref={closeButtonRef}
        aria-label="Close popup"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute -top-16 right-4 text-white/60 hover:text-white transition-colors bg-black/50 p-2 rounded-full z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>

      {/* Carousel Container — overflow:hidden, no native scroll */}
      <div
        ref={containerRef}
        role="region"
        aria-roledescription="carousel"
        aria-label={`${groups.length} group cards`}
        tabIndex={0}
        className="relative overflow-hidden pb-12 pt-10 w-full h-[320px] cursor-grab active:cursor-grabbing touch-none"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {Array.from({ length: TOTAL_SLOTS }, (_, slot) => {
          const group = getSlotGroup(slot);
          return (
            <div
              key={`slot-${slot}`}
              ref={(el) => {
                cardRefs.current[slot] = el;
              }}
              className="absolute top-10"
              style={{ width: CARD_WIDTH }}
            >
              <GroupCard
                group={group}
                onNavigate={onNavigate}
                onClick={() => handleCardClick(slot)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
