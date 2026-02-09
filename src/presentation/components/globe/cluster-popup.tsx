"use client";

import { useEffect, useRef, useMemo } from "react";
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
      className="group-card flex-shrink-0 w-[300px] bg-[#0a0a0a]/95 border border-white/10 rounded-2xl shadow-2xl p-6 text-white overflow-hidden snap-center mx-2 transition-transform duration-75 select-none cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
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

export function ClusterPopup({
  groups,
  onNavigate,
  onClose,
}: ClusterPopupProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);
  const dragDistance = useRef(0);
  const rafRef = useRef<number>(0);

  // Extend groups for infinite feel (5x for smooth looping)
  const EXTEND_FACTOR = 5;
  const extendedGroups = useMemo(() => {
    return Array.from({ length: EXTEND_FACTOR }, () => groups).flat();
  }, [groups]);

  // Escape key to close
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  // Focus close button on mount
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  // Cleanup rAF on unmount
  useEffect(() => {
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const updateCardScaling = () => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const cards = container.querySelectorAll(".group-card");
    const containerWidth = container.offsetWidth;
    const containerCenter = containerWidth / 2;
    const currentScroll = container.scrollLeft;

    cards.forEach((card) => {
      const htmlCard = card as HTMLElement;
      // Use offsetLeft math instead of getBoundingClientRect to avoid reflows
      const cardCenter =
        htmlCard.offsetLeft + htmlCard.offsetWidth / 2 - currentScroll;
      const distanceFromCenter = Math.abs(containerCenter - cardCenter);

      const maxDistance = containerWidth / 2;
      const progress = Math.min(distanceFromCenter / maxDistance, 1);

      // Scale from 1.05 at center to 0.75 at edges
      const scale = 1.05 - progress * 0.3;
      const opacity = 1 - progress * 0.3;

      // Direct style writes instead of gsap.set for performance
      htmlCard.style.transform = `scale(${scale})`;
      htmlCard.style.opacity = String(opacity);
    });
  };

  const checkLoop = () => {
    if (!containerRef.current || groups.length === 0) return;
    const container = containerRef.current;
    const cards = container.querySelectorAll(".group-card");
    if (cards.length < groups.length * 2) return;

    const setSize = groups.length;
    const firstInSet = cards[0] as HTMLElement;
    const firstInNextSet = cards[setSize] as HTMLElement;

    if (firstInSet && firstInNextSet) {
      const setWidth = firstInNextSet.offsetLeft - firstInSet.offsetLeft;
      const scrollWidth = container.scrollWidth;

      const jumpAmount = setWidth * 2;
      const leftLimit = setWidth;
      const rightLimit = scrollWidth - setWidth - container.offsetWidth;

      if (container.scrollLeft < leftLimit) {
        container.scrollLeft += jumpAmount;
      } else if (container.scrollLeft > rightLimit) {
        container.scrollLeft -= jumpAmount;
      }
    }
  };

  const handleScroll = () => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      updateCardScaling();
      checkLoop();
    });
  };

  const snapToNearestCard = () => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const cards = container.querySelectorAll(".group-card");
    const containerWidth = container.offsetWidth;
    const containerCenter = containerWidth / 2;
    const currentScroll = container.scrollLeft;

    let nearestCard: HTMLElement | null = null;
    let nearestDistance = Infinity;

    cards.forEach((card) => {
      const htmlCard = card as HTMLElement;
      const cardCenter =
        htmlCard.offsetLeft + htmlCard.offsetWidth / 2 - currentScroll;
      const distance = Math.abs(containerCenter - cardCenter);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestCard = htmlCard;
      }
    });

    if (nearestCard) {
      const el = nearestCard as HTMLElement;
      const targetScroll =
        el.offsetLeft + el.offsetWidth / 2 - containerCenter;

      gsap.to(container, {
        scrollLeft: targetScroll,
        duration: 0.4,
        ease: "power2.out",
        onUpdate: () => {
          updateCardScaling();
          checkLoop();
        },
      });
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    isDragging.current = true;
    dragDistance.current = 0;
    startX.current = e.pageX - containerRef.current.offsetLeft;
    scrollLeft.current = containerRef.current.scrollLeft;
    containerRef.current.style.scrollBehavior = "auto";
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !containerRef.current) return;
    e.preventDefault();
    const x = e.pageX - containerRef.current.offsetLeft;
    const walk = (x - startX.current) * 1.5;
    dragDistance.current = Math.abs(walk);
    containerRef.current.scrollLeft = scrollLeft.current - walk;
  };

  const handleMouseUp = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    snapToNearestCard();
  };

  const handleCardClick = (index: number) => {
    if (!containerRef.current) return;
    if (dragDistance.current > 10) return;

    const container = containerRef.current;
    const cards = container.querySelectorAll(".group-card");
    const targetCard = cards[index] as HTMLElement;

    if (targetCard) {
      const containerWidth = container.offsetWidth;
      const targetScroll =
        targetCard.offsetLeft + targetCard.offsetWidth / 2 - containerWidth / 2;

      gsap.to(container, {
        scrollLeft: targetScroll,
        duration: 0.5,
        ease: "power2.out",
        onUpdate: () => {
          updateCardScaling();
          checkLoop();
        },
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const cards = container.querySelectorAll(".group-card");
    const containerWidth = container.offsetWidth;
    const containerCenter = containerWidth / 2;
    const currentScroll = container.scrollLeft;

    let nearestIndex = 0;
    let nearestDistance = Infinity;
    cards.forEach((card, i) => {
      const htmlCard = card as HTMLElement;
      const cardCenter =
        htmlCard.offsetLeft + htmlCard.offsetWidth / 2 - currentScroll;
      const dist = Math.abs(containerCenter - cardCenter);
      if (dist < nearestDistance) {
        nearestDistance = dist;
        nearestIndex = i;
      }
    });

    const nextIndex =
      e.key === "ArrowLeft"
        ? Math.max(0, nearestIndex - 1)
        : Math.min(cards.length - 1, nearestIndex + 1);

    const targetCard = cards[nextIndex] as HTMLElement;
    if (targetCard) {
      const targetScroll =
        targetCard.offsetLeft + targetCard.offsetWidth / 2 - containerCenter;

      gsap.to(container, {
        scrollLeft: targetScroll,
        duration: 0.4,
        ease: "power2.out",
        onUpdate: () => {
          updateCardScaling();
          checkLoop();
        },
      });
    }
  };

  useEffect(() => {
    if (!containerRef.current) return;

    // Animate container in with GSAP context for proper cleanup
    const ctx = gsap.context(() => {
      gsap.fromTo(
        containerRef.current,
        { opacity: 0, scale: 0.9, y: 10 },
        { opacity: 1, scale: 1, y: 0, duration: 0.3, ease: "back.out(1.7)" },
      );
    }, containerRef);

    const container = containerRef.current;

    // Small delay to ensure layout is calculated
    const timeoutId = setTimeout(() => {
      const cards = container.querySelectorAll(".group-card");
      const middleIndex = Math.floor(extendedGroups.length / 2);
      const targetCard = cards[middleIndex] as HTMLElement;

      if (targetCard) {
        const containerWidth = container.offsetWidth;
        container.scrollLeft =
          targetCard.offsetLeft +
          targetCard.offsetWidth / 2 -
          containerWidth / 2;

        updateCardScaling();
      }
    }, 50);

    return () => {
      ctx.revert();
      clearTimeout(timeoutId);
    };
  }, [extendedGroups]);

  return (
    <div className="relative flex items-center justify-center w-full max-w-7xl mx-auto px-4">
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

      {/* Fade Masks */}
      <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-[#000]/80 to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-[#000]/80 to-transparent z-10 pointer-events-none" />

      {/* Carousel Container */}
      <div
        ref={containerRef}
        role="region"
        aria-roledescription="carousel"
        aria-label={`${groups.length} group cards`}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onScroll={handleScroll}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="flex overflow-x-hidden pb-12 pt-10 px-[30%] hide-scrollbar w-full cursor-grab active:cursor-grabbing items-center"
        onClick={(e) => e.stopPropagation()}
      >
        {extendedGroups.map((group, idx) => (
          <GroupCard
            key={`${group.groupId}-${idx}`}
            group={group}
            onNavigate={onNavigate}
            onClick={() => handleCardClick(idx)}
          />
        ))}
      </div>
    </div>
  );
}
