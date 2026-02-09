import type { GeoPoint } from "@/presentation/hooks/use-geo-media";
import gsap from "gsap";

export interface ClusterMarkerData {
  type: "marker";
  lat: number;
  lng: number;
  points: GeoPoint[];
  thumbnailUrls: (string | null | undefined)[];
  label?: string;
}

export type GlobeElementData = ClusterMarkerData;

const THUMB_SIZE = 44; // WCAG recommended touch target size
const STACK_OFFSET = 4;
const MAX_VISIBLE_STACKED = 3;
const MAX_FAN_OUT = 8;
const FAN_RADIUS = 50;

function createThumbnailCircle(
  url: string | null | undefined,
  size: number,
  label?: string,
): HTMLElement {
  const circle = document.createElement("button");
  if (label) circle.setAttribute("aria-label", label);
  circle.style.cssText = `
    width: ${size}px;
    height: ${size}px;
    border-radius: 50%;
    overflow: hidden;
    border: 1px solid #e2e2e2;
    box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    position: absolute;
    left: 0;
    top: 0;
    cursor: pointer;
    background: #000;
    padding: 0;
    transition: outline 0.2s ease;
  `;
  circle.style.outline = "none";
  circle.addEventListener("focus", () => {
    if (circle.matches(":focus-visible")) {
      circle.style.outline = "2px solid rgba(255,255,255,0.5)";
      circle.style.outlineOffset = "2px";
    }
  });
  circle.addEventListener("blur", () => {
    circle.style.outline = "none";
  });

  if (url) {
    const img = document.createElement("img");
    img.src = url;
    img.alt = "";
    img.style.cssText = `
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    `;
    img.draggable = false;
    circle.appendChild(img);
  } else {
    // Fallback placeholder
    const placeholder = document.createElement("div");
    placeholder.style.cssText = `
      width: 100%;
      height: 100%;
      background: #333;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    // Simple svg icon or dot
    placeholder.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" class="text-gray-500" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`;
    circle.appendChild(placeholder);
  }
  return circle;
}

export function createMarkerElement(
  data: GlobeElementData,
  onNavigate: (path: string) => void,
  onMarkerClick?: (data: ClusterMarkerData) => void,
): HTMLElement {
  // Handle standard marker
  const count = data.points.length;
  const visibleStacked = Math.min(count, MAX_VISIBLE_STACKED);
  const stackedSize = THUMB_SIZE + (visibleStacked - 1) * STACK_OFFSET;

  // Wrapper needs to be large enough for fan-out
  const wrapperSize = (FAN_RADIUS + THUMB_SIZE) * 2;

  const wrapper = document.createElement("div");
  wrapper.style.cssText = `
    position: absolute;
    width: ${wrapperSize}px;
    height: ${wrapperSize}px;
    pointer-events: none;
  `;
  wrapper.dataset.clusterSize = String(count);

  // Inner container for the actual thumbnails — centered in wrapper
  const inner = document.createElement("button");
  inner.setAttribute(
    "aria-label",
    data.label
      ? `Cluster in ${data.label}, ${count} items`
      : `Cluster with ${count} items`,
  );
  inner.style.cssText = `
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: ${stackedSize}px;
    height: ${stackedSize}px;
    pointer-events: auto;
    cursor: pointer;
    background: none;
    border: none;
    padding: 0;
    transition: outline 0.2s ease;
  `;
  inner.style.outline = "none";
  inner.addEventListener("focus", () => {
    if (inner.matches(":focus-visible")) {
      inner.style.outline = "2px solid rgba(255,255,255,0.5)";
      inner.style.outlineOffset = "4px";
    }
  });
  inner.addEventListener("blur", () => {
    inner.style.outline = "none";
  });

  const thumbnails: HTMLElement[] = [];

  if (count === 1) {
    // Single marker
    const url = data.thumbnailUrls[0];
    const circle = createThumbnailCircle(
      url,
      THUMB_SIZE,
      data.label || "Photo",
    );
    circle.style.transform = "translate(0px, 0px)";
    circle.style.zIndex = "1";
    inner.appendChild(circle);
    thumbnails.push(circle);
  } else {
    // Multi-point cluster
    const fanCount = Math.min(count, MAX_FAN_OUT);

    for (let i = 0; i < fanCount; i++) {
      const url = data.thumbnailUrls[i];
      const point = data.points[i];
      const label = point?.groupName || `Item ${i + 1}`;

      const circle = createThumbnailCircle(url, THUMB_SIZE, label);

      // Stacked position: pile on top of each other with slight diagonal offset
      if (i < MAX_VISIBLE_STACKED) {
        const offsetX = i * STACK_OFFSET;
        const offsetY = i * STACK_OFFSET;
        circle.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
        circle.style.zIndex = String(i + 1);
        circle.style.opacity = "1";
      } else {
        // Hidden in stack — same position as topmost visible
        const offsetX = (MAX_VISIBLE_STACKED - 1) * STACK_OFFSET;
        const offsetY = (MAX_VISIBLE_STACKED - 1) * STACK_OFFSET;
        circle.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
        circle.style.zIndex = String(i + 1);
        circle.style.opacity = "0";
      }

      // Store fan-out position as data attributes
      const angle = (2 * Math.PI * i) / fanCount - Math.PI / 2;
      const fanX = Math.cos(angle) * FAN_RADIUS;
      const fanY = Math.sin(angle) * FAN_RADIUS;
      circle.dataset.fanX = String(fanX);
      circle.dataset.fanY = String(fanY);

      // Store stacked transform values
      if (i < MAX_VISIBLE_STACKED) {
        circle.dataset.stackTransform = `translate(${i * STACK_OFFSET}px, ${i * STACK_OFFSET}px)`;
      } else {
        circle.dataset.stackTransform = `translate(${(MAX_VISIBLE_STACKED - 1) * STACK_OFFSET}px, ${(MAX_VISIBLE_STACKED - 1) * STACK_OFFSET}px)`;
      }
      circle.dataset.stackOpacity = i < MAX_VISIBLE_STACKED ? "1" : "0";
      circle.dataset.pointIndex = String(i);

      inner.appendChild(circle);
      thumbnails.push(circle);
    }

    // '+N more' indicator for clusters with more than MAX_FAN_OUT
    let moreIndicator: HTMLElement | null = null;
    if (count > MAX_FAN_OUT) {
      moreIndicator = document.createElement("div");
      moreIndicator.textContent = `+${count - MAX_FAN_OUT} more`;
      moreIndicator.style.cssText = `
        position: absolute;
        font-size: 10px;
        color: white;
        background: rgba(0,0,0,1);
        padding: 2px 6px;
        border-radius: 9999px;
        z-index: 100;
        white-space: nowrap;
        opacity: 0;
        pointer-events: none;
        left: 50%;
        bottom: -20px;
        transform: translateX(-50%);
      `;
      inner.appendChild(moreIndicator);
    }

    // Count badge (visible in stacked state)
    let badge: HTMLElement | null = null;
    if (count > MAX_VISIBLE_STACKED) {
      badge = document.createElement("div");
      badge.textContent = `+${count - MAX_VISIBLE_STACKED}`;
      badge.style.cssText = `
        position: absolute;
        top: -4px;
        right: -4px;
        background: #3b82f6;
        color: white;
        font-size: 10px;
        font-weight: 600;
        padding: 1px 5px;
        border-radius: 9999px;
        z-index: ${fanCount + 1};
        line-height: 14px;
        white-space: nowrap;
      `;
      inner.appendChild(badge);
    }

    let isFanned = false;

    const fanOut = () => {
      if (count <= 1) return;
      isFanned = true;

      // Expand inner container to hold fan
      inner.style.width = `${wrapperSize}px`;
      inner.style.height = `${wrapperSize}px`;

      const centerX = wrapperSize / 2 - THUMB_SIZE / 2;
      const centerY = wrapperSize / 2 - THUMB_SIZE / 2;

      // Animate thumbnails
      for (let i = 0; i < thumbnails.length; i++) {
        const thumb = thumbnails[i];
        const fanX = parseFloat(thumb.dataset.fanX ?? "0");
        const fanY = parseFloat(thumb.dataset.fanY ?? "0");

        // If we are currently stacked, we need to correct the starting position
        // because the container size (and thus coordinate system) just changed.
        // The thumbnail's current transform is relative to the OLD (small) container.
        // We want it visually in the same place, but relative to the NEW (large) container.
        if (!gsap.isTweening(thumb)) {
          // Calculate where the stack position is in the new coordinate system
          // Stack position relative to old inner (0,0) was (i*STACK_OFFSET, i*STACK_OFFSET)
          // New inner (0,0) is shifted by -(wrapperSize - stackedSize)/2 relative to old center.
          // Actually simplest way: layout is centered.
          // Center of inner matches center of wrapper.
          // Thumb at (0,0) of small inner is at ( -stackedSize/2, -stackedSize/2 ) from center.
          // Thumb at (0,0) of large inner is at ( -wrapperSize/2, -wrapperSize/2 ) from center.
          // So to be at same visual spot, we need to add diff.

          // Wait, easiest is to use the `centerX` we calculated:
          // centerX is top-left of the "thumb at center" in the large wrapper.
          // The stacked thumbnails are at (i*offset, i*offset) relative to the small wrapper's top-left.
          // In the large wrapper, that same visual position is (centerX + i*offset, centerY + i*offset).
          // BUT only if we haven't already moved them.
          // If we are interrupting a stackUp animation, we might be anywhere.
          // For now, let's assume we start from stacked state or let GSAP handle it if we are consistent.

          // To ensure smooth start from "stacked" visual position when container resizes:
          const currentStackX =
            i < MAX_VISIBLE_STACKED
              ? i * STACK_OFFSET
              : (MAX_VISIBLE_STACKED - 1) * STACK_OFFSET;
          const currentStackY =
            i < MAX_VISIBLE_STACKED
              ? i * STACK_OFFSET
              : (MAX_VISIBLE_STACKED - 1) * STACK_OFFSET;

          // Immediate set to starting position in new coordinates
          gsap.set(thumb, {
            x: centerX + currentStackX,
            y: centerY + currentStackY,
            overwrite: "auto",
          });
        }

        gsap.to(thumb, {
          x: centerX + fanX,
          y: centerY + fanY,
          opacity: 1,
          zIndex: 10,
          duration: 0.4,
          ease: "power2.out",
          overwrite: true,
        });
      }

      if (badge) {
        gsap.to(badge, { opacity: 0, duration: 0.2, overwrite: true });
      }
      if (moreIndicator) {
        gsap.to(moreIndicator, { opacity: 1, duration: 0.2, overwrite: true });
      }
    };

    const stackUp = () => {
      isFanned = false;

      const centerX = wrapperSize / 2 - THUMB_SIZE / 2;
      const centerY = wrapperSize / 2 - THUMB_SIZE / 2;

      // Animate back to stack positions (using large coordinates first)
      for (let i = 0; i < thumbnails.length; i++) {
        const thumb = thumbnails[i];
        const stackX =
          i < MAX_VISIBLE_STACKED
            ? i * STACK_OFFSET
            : (MAX_VISIBLE_STACKED - 1) * STACK_OFFSET;
        const stackY =
          i < MAX_VISIBLE_STACKED
            ? i * STACK_OFFSET
            : (MAX_VISIBLE_STACKED - 1) * STACK_OFFSET;
        const stackOpacity = thumb.dataset.stackOpacity ?? "1";
        const idx = parseInt(thumb.dataset.pointIndex ?? "0", 10);

        gsap.to(thumb, {
          x: centerX + stackX,
          y: centerY + stackY,
          opacity: stackOpacity,
          zIndex: idx + 1, // Restore z-index
          duration: 0.3,
          ease: "power2.in",
          overwrite: true,
          onComplete: () => {
            // Only reset container if all animations are done?
            // Actually, checking if this is the last one or using a promise is better.
            // But simpler: if we are still not fanned at the end of animation, reset.
            if (!isFanned && i === thumbnails.length - 1) {
              // Restore small container size
              inner.style.width = `${stackedSize}px`;
              inner.style.height = `${stackedSize}px`;

              // Reset thumbs to small coordinates
              thumbnails.forEach((t, j) => {
                const sx =
                  j < MAX_VISIBLE_STACKED
                    ? j * STACK_OFFSET
                    : (MAX_VISIBLE_STACKED - 1) * STACK_OFFSET;
                const sy =
                  j < MAX_VISIBLE_STACKED
                    ? j * STACK_OFFSET
                    : (MAX_VISIBLE_STACKED - 1) * STACK_OFFSET;
                gsap.set(t, { x: sx, y: sy });
              });
            }
          },
        });
      }

      if (badge) {
        gsap.to(badge, { opacity: 1, duration: 0.2, overwrite: true });
      }
      if (moreIndicator) {
        gsap.to(moreIndicator, { opacity: 0, duration: 0.2, overwrite: true });
      }
    };

    inner.addEventListener("mouseenter", fanOut);
    inner.addEventListener("mouseleave", stackUp);
    inner.addEventListener("focus", fanOut);
    inner.addEventListener("blur", stackUp);

    // Attach click handlers per thumbnail for fanned-out state
    for (const thumb of thumbnails) {
      thumb.addEventListener("click", (e) => {
        e.stopPropagation();
        // If we have a specific handler for popup/selection, use it.
        // Otherwise fallback to existing behavior (direct nav)
        if (onMarkerClick && data.type === "marker") {
          onMarkerClick(data);
        } else {
          const idx = parseInt(thumb.dataset.pointIndex ?? "0", 10);
          const point = data.points[idx];
          if (point) {
            onNavigate(`/groups/${point.groupId}`);
          }
        }
      });
    }

    // Click on stacked cluster
    inner.addEventListener("click", (e) => {
      e.stopPropagation();
      if (isFanned) return;

      if (onMarkerClick && data.type === "marker") {
        onMarkerClick(data);
        return;
      }

      const groupIds = new Set(data.points.map((p) => p.groupId));
      if (groupIds.size === 1) {
        onNavigate(`/groups/${data.points[0]!.groupId}`);
      } else {
        // Mixed groups — fan out to let user pick
        fanOut();
      }
    });
  }

  // Single marker click handler
  if (count === 1) {
    inner.addEventListener("click", (e) => {
      e.stopPropagation();
      if (onMarkerClick && data.type === "marker") {
        onMarkerClick(data);
      } else {
        onNavigate(`/groups/${data.points[0]!.groupId}`);
      }
    });
  }

  // Label
  if (data.label) {
    const labelEl = document.createElement("div");
    labelEl.textContent = data.label;
    labelEl.style.cssText = `
      position: absolute;
      top: 60%;
      left: 50%;
      transform: translateX(-50%);
      margin-top: 8px;
      font-family: var(--font-geist-mono); 
      color: rgba(255, 255, 255, 1);
      font-size: 10px;
      font-weight: 500;
      text-shadow: 0 1px 3px rgba(0,0,0,0.8);
      white-space: nowrap;
      pointer-events: none;
      z-index: 100;
    `;
    wrapper.appendChild(labelEl);
  }

  wrapper.appendChild(inner);
  return wrapper;
}
