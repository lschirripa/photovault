"use client";

import { useEffect, useRef, useMemo } from "react";
import gsap from "gsap";
import Image from "next/image";

interface GroupData {
  groupId: string;
  groupName: string; // "Sarah Chen"
  locationCity?: string; // "New York"
  locationCountry?: string; // "US"
  thumbnailUrl?: string | null;
  pointCount: number;
}

interface ClusterPopupProps {
  groups: GroupData[];
  onNavigate: (path: string) => void;
  onClose: () => void;
}

// Sub-component for individual group card
function GroupCard({
  group,
  onNavigate,
  stats,
  onClick,
}: {
  group: GroupData;
  onNavigate: (path: string) => void;
  stats: { firstSeen: string; sessions: number; events: number };
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className="group-card flex-shrink-0 w-[300px] bg-[#0a0a0a]/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-6 text-white overflow-hidden snap-center mx-2 transition-transform duration-75 will-change-transform select-none cursor-grab active:cursor-grabbing"
      onClick={onClick}
      style={{ fontFamily: "var(--font-geist-mono)" }}
    >
      {/* Content */}
      <div className="flex flex-col items-center pointer-events-none">
        {/* Avatar */}
        <div className="w-16 h-16 rounded-full overflow-hidden mb-3 border-2 border-white/10 shadow-lg relative">
          {group.thumbnailUrl ? (
            <Image
              width={64}
              height={64}
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
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(`/groups/${group.groupId}`);
          }}
          className="px-4 py-1.5 rounded-full bg-[#1A1A1A] border border-white/10 text-sm text-white hover:bg-white/10 transition-colors mb-6 pointer-events-auto"
        >
          View profile
        </button>

        {/* Stats Grid */}
        <div className="w-full grid grid-cols-3 gap-2 px-2">
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-white/50 uppercase tracking-wider mb-1">
              First seen
            </span>
            <span className="text-xs text-white/90">{stats.firstSeen}</span>
          </div>
          <div className="flex flex-col items-center border-l border-white/5 border-r">
            <span className="text-[10px] text-white/50 uppercase tracking-wider mb-1">
              Sessions
            </span>
            <span className="text-xs text-white/90">{stats.sessions}</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-white/50 uppercase tracking-wider mb-1">
              Events
            </span>
            <span className="text-xs text-white/90">{stats.events}</span>
          </div>
        </div>

        {/* Browser Mock Input */}
        <div className="w-full mt-6 bg-[#1A1A1A] rounded-xl p-2 flex items-center gap-3 border border-white/5">
          <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center">
            <div className="w-2.5 h-2.5 rounded-full border border-white/50"></div>
          </div>
          <div className="flex-1 text-xs text-white/80 font-mono">/pricing</div>
          <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
        </div>

        {/* Footer Icons */}
        <div className="w-full mt-3 flex items-center gap-2 text-white/60 text-xs">
          <div className="w-4 h-4 rounded-full bg-white/90 flex items-center justify-center text-[8px] text-black font-bold">
            G
          </div>
          <span>Google</span>
          <div className="ml-auto flex gap-2">
            <div className="w-4 h-4 bg-yellow-500/20 rounded-md"></div>
            <div className="w-4 h-4 bg-white/10 rounded-md"></div>
          </div>
        </div>
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
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);
  const lastScrollX = useRef(0);

  // Extend groups for infinite feel
  const EXTEND_FACTOR = 20;
  const extendedGroups = useMemo(() => {
    return Array.from({ length: EXTEND_FACTOR }, () => groups).flat();
  }, [groups]);

  const updateCardScaling = () => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const cards = container.querySelectorAll(".group-card");
    const containerWidth = container.offsetWidth;
    const containerCenter = containerWidth / 2;

    cards.forEach((card) => {
      const htmlCard = card as HTMLElement;
      const rect = htmlCard.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      // Calculate center of card relative to container left
      const cardCenter = rect.left + rect.width / 2 - containerRect.left;
      const distanceFromCenter = Math.abs(containerCenter - cardCenter);

      // Max distance for full scale down
      const maxDistance = containerWidth / 2;
      const progress = Math.min(distanceFromCenter / maxDistance, 1);

      // Scale from 1.0 at center to 0.8 at the edges
      const scale = 1 - progress * 0.2;
      const opacity = 1 - progress * 0.1;

      gsap.set(htmlCard, {
        scale,
        opacity,
        transformOrigin: "center center",
        overwrite: "auto",
      });
    });
  };

  const checkLoop = () => {
    if (!containerRef.current || groups.length === 0) return;
    const container = containerRef.current;
    const cards = container.querySelectorAll(".group-card");
    if (cards.length < groups.length * 2) return;

    const setSize = groups.length;
    // Get the width of one complete set of groups by measuring distance between identical items
    const firstInSet = cards[0] as HTMLElement;
    const firstInNextSet = cards[setSize] as HTMLElement;

    if (firstInSet && firstInNextSet) {
      const setWidth = firstInNextSet.offsetLeft - firstInSet.offsetLeft;
      const scrollWidth = container.scrollWidth;

      // When we've scrolled too far left or right, jump 10 sets (half the EXTEND_FACTOR)
      const jumpAmount = setWidth * 10;
      const leftLimit = setWidth * 4;
      const rightLimit = scrollWidth - setWidth * 4 - container.offsetWidth;

      if (container.scrollLeft < leftLimit) {
        container.scrollLeft += jumpAmount;
      } else if (container.scrollLeft > rightLimit) {
        container.scrollLeft -= jumpAmount;
      }
    }
  };

  const handleScroll = () => {
    updateCardScaling();
    checkLoop();
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    isDragging.current = true;
    startX.current = e.pageX - containerRef.current.offsetLeft;
    scrollLeft.current = containerRef.current.scrollLeft;
    lastScrollX.current = containerRef.current.scrollLeft;
    containerRef.current.style.scrollBehavior = "auto";
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !containerRef.current) return;
    e.preventDefault();
    const x = e.pageX - containerRef.current.offsetLeft;
    const walk = (x - startX.current) * 1.5; // Drag speed
    containerRef.current.scrollLeft = scrollLeft.current - walk;
    // Scaling and looping are naturally handled by the onScroll listener
    // but we can call it manually for smoother updates if needed
    // updateCardScaling();
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    if (containerRef.current) {
      containerRef.current.style.scrollBehavior = "smooth";
    }
  };

  const handleCardClick = (index: number) => {
    if (!containerRef.current) return;

    // Distinguish between drag and click
    const currentScroll = containerRef.current.scrollLeft;
    if (Math.abs(lastScrollX.current - currentScroll) > 10) {
      return;
    }

    const container = containerRef.current;
    const cards = container.querySelectorAll(".group-card");
    const targetCard = cards[index] as HTMLElement;

    if (targetCard) {
      const containerWidth = container.offsetWidth;
      const cardRect = targetCard.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      const cardCenter =
        cardRect.left + cardRect.width / 2 - containerRect.left;
      const targetScroll =
        container.scrollLeft + (cardCenter - containerWidth / 2);

      gsap.to(container, {
        scrollLeft: targetScroll,
        duration: 0.5,
        ease: "power2.out",
        onUpdate: handleScroll,
      });
    }
  };

  useEffect(() => {
    if (!containerRef.current) return;

    // Animate container in
    gsap.fromTo(
      containerRef.current,
      { opacity: 0, scale: 0.9, y: 10 },
      { opacity: 1, scale: 1, y: 0, duration: 0.3, ease: "back.out(1.7)" },
    );

    // Initial positioning to perfectly center the first card of the middle set
    const container = containerRef.current;

    // Small delay to ensure layout is calculated
    const timeoutId = setTimeout(() => {
      const cards = container.querySelectorAll(".group-card");
      const middleIndex = Math.floor(extendedGroups.length / 2);
      const targetCard = cards[middleIndex] as HTMLElement;

      if (targetCard) {
        const containerWidth = container.offsetWidth;
        const cardRect = targetCard.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        const cardCenter =
          cardRect.left + cardRect.width / 2 - containerRect.left;
        container.scrollLeft =
          container.scrollLeft + (cardCenter - containerWidth / 2);

        updateCardScaling();
      }
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [extendedGroups]);

  return (
    <div className="relative flex items-center justify-center w-full max-w-7xl mx-auto px-4">
      {/* Close Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute -top-16 right-4 text-white/60 hover:text-white transition-colors bg-black/50 p-2 rounded-full z-20"
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
            stats={{
              firstSeen: "Dec 12, 2024",
              sessions: 14,
              events: group.pointCount,
            }}
          />
        ))}
      </div>
    </div>
  );
}
