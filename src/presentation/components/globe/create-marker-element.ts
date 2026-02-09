import type { GeoPoint } from "@/presentation/hooks/use-geo-media";

export interface ClusterMarkerData {
  lat: number;
  lng: number;
  points: GeoPoint[];
  thumbnailUrls: string[];
}

const THUMB_SIZE = 40;
const STACK_OFFSET = 8;
const MAX_VISIBLE_STACKED = 3;
const MAX_FAN_OUT = 8;
const FAN_RADIUS = 50;

function createThumbnailCircle(url: string, size: number): HTMLElement {
  const circle = document.createElement("div");
  circle.style.cssText = `
    width: ${size}px;
    height: ${size}px;
    border-radius: 50%;
    overflow: hidden;
    border: 2px solid white;
    box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    position: absolute;
    transition: left 200ms ease-out, top 200ms ease-out, opacity 200ms ease-out;
    cursor: pointer;
  `;

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
  return circle;
}

/** Creates a marker element for a single point or a cluster of points. */
export function createMarkerElement(data: ClusterMarkerData): HTMLElement {
  const count = data.points.length;
  const visibleStacked = Math.min(count, MAX_VISIBLE_STACKED);
  const stackedWidth = THUMB_SIZE + (visibleStacked - 1) * STACK_OFFSET;

  // Wrapper needs to be large enough for fan-out
  const wrapperSize = (FAN_RADIUS + THUMB_SIZE) * 2;

  const wrapper = document.createElement("div");
  wrapper.style.cssText = `
    position: relative;
    width: ${wrapperSize}px;
    height: ${wrapperSize}px;
    pointer-events: none;
  `;
  wrapper.dataset.clusterSize = String(count);

  // Inner container for the actual thumbnails — centered in wrapper
  const inner = document.createElement("div");
  inner.style.cssText = `
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: ${stackedWidth}px;
    height: ${THUMB_SIZE}px;
    pointer-events: auto;
    cursor: pointer;
  `;

  const thumbnails: HTMLElement[] = [];

  if (count === 1) {
    // Single marker
    const url = data.thumbnailUrls[0];
    if (url) {
      const circle = createThumbnailCircle(url, THUMB_SIZE);
      circle.style.left = "0";
      circle.style.top = "0";
      circle.style.zIndex = "1";
      inner.appendChild(circle);
      thumbnails.push(circle);
    }
  } else {
    // Multi-point cluster
    const fanCount = Math.min(count, MAX_FAN_OUT);

    for (let i = 0; i < fanCount; i++) {
      const url = data.thumbnailUrls[i];
      if (!url) continue;

      const circle = createThumbnailCircle(url, THUMB_SIZE);

      // Stacked position: only first MAX_VISIBLE_STACKED are visible
      if (i < MAX_VISIBLE_STACKED) {
        const offsetX = i * STACK_OFFSET;
        circle.style.left = `${offsetX}px`;
        circle.style.top = "0";
        circle.style.zIndex = String(i + 1);
        circle.style.opacity = "1";
      } else {
        // Hidden in stack
        circle.style.left = `${(MAX_VISIBLE_STACKED - 1) * STACK_OFFSET}px`;
        circle.style.top = "0";
        circle.style.zIndex = String(i + 1);
        circle.style.opacity = "0";
      }

      // Store fan-out position as data attributes
      const angle = (2 * Math.PI * i) / fanCount - Math.PI / 2;
      const fanX = Math.cos(angle) * FAN_RADIUS;
      const fanY = Math.sin(angle) * FAN_RADIUS;
      circle.dataset.fanX = String(fanX);
      circle.dataset.fanY = String(fanY);
      circle.dataset.stackLeft =
        i < MAX_VISIBLE_STACKED
          ? `${i * STACK_OFFSET}px`
          : `${(MAX_VISIBLE_STACKED - 1) * STACK_OFFSET}px`;
      circle.dataset.stackOpacity = i < MAX_VISIBLE_STACKED ? "1" : "0";
      circle.dataset.pointIndex = String(i);

      inner.appendChild(circle);
      thumbnails.push(circle);
    }

    // '+N more' indicator for clusters with more than MAX_FAN_OUT
    let moreIndicator: HTMLElement | null = null;
    if (count > MAX_FAN_OUT) {
      moreIndicator = document.createElement("div");
      moreIndicator.textContent = `+${count - MAX_FAN_OUT + 1} more`;
      moreIndicator.style.cssText = `
        position: absolute;
        font-size: 10px;
        color: white;
        background: rgba(0,0,0,0.6);
        padding: 2px 6px;
        border-radius: 9999px;
        white-space: nowrap;
        opacity: 0;
        transition: opacity 200ms ease-out;
        pointer-events: none;
        left: 50%;
        bottom: -20px;
        transform: translateX(-50%);
        z-index: 100;
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
        transition: opacity 200ms ease-out;
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

      for (const thumb of thumbnails) {
        const fanX = parseFloat(thumb.dataset.fanX ?? "0");
        const fanY = parseFloat(thumb.dataset.fanY ?? "0");
        thumb.style.left = `${centerX + fanX}px`;
        thumb.style.top = `${centerY + fanY}px`;
        thumb.style.opacity = "1";
        thumb.style.zIndex = "10";
      }

      if (badge) badge.style.opacity = "0";
      if (moreIndicator) moreIndicator.style.opacity = "1";
    };

    const stackUp = () => {
      isFanned = false;

      inner.style.width = `${stackedWidth}px`;
      inner.style.height = `${THUMB_SIZE}px`;

      for (const thumb of thumbnails) {
        thumb.style.left = thumb.dataset.stackLeft ?? "0";
        thumb.style.top = "0";
        thumb.style.opacity = thumb.dataset.stackOpacity ?? "1";
        const idx = parseInt(thumb.dataset.pointIndex ?? "0", 10);
        thumb.style.zIndex = String(idx + 1);
      }

      if (badge) badge.style.opacity = "1";
      if (moreIndicator) moreIndicator.style.opacity = "0";
    };

    inner.addEventListener("mouseenter", fanOut);
    inner.addEventListener("mouseleave", stackUp);

    // Attach click handlers per thumbnail for fanned-out state
    for (const thumb of thumbnails) {
      thumb.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = parseInt(thumb.dataset.pointIndex ?? "0", 10);
        const point = data.points[idx];
        if (point) {
          window.location.href = `/groups/${point.groupId}`;
        }
      });
    }

    // Click on stacked cluster
    inner.addEventListener("click", (e) => {
      if (isFanned) return; // Individual thumb clicks handle this
      e.stopPropagation();
      const groupIds = new Set(data.points.map((p) => p.groupId));
      if (groupIds.size === 1) {
        window.location.href = `/groups/${data.points[0]!.groupId}`;
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
      window.location.href = `/groups/${data.points[0]!.groupId}`;
    });
  }

  wrapper.appendChild(inner);
  return wrapper;
}
