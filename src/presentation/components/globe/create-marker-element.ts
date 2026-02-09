import type { GeoPoint } from "@/presentation/hooks/use-geo-media";

export interface ClusterMarkerData {
  lat: number;
  lng: number;
  points: GeoPoint[];
  thumbnailUrls: string[];
}

const THUMB_SIZE = 40;
const STACK_OFFSET = 8;
const MAX_VISIBLE = 3;

function createThumbnailCircle(
  url: string,
  size: number,
  offsetX: number,
  zIndex: number
): HTMLElement {
  const circle = document.createElement("div");
  circle.style.cssText = `
    width: ${size}px;
    height: ${size}px;
    border-radius: 50%;
    overflow: hidden;
    border: 2px solid white;
    box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    position: absolute;
    left: ${offsetX}px;
    top: 0;
    z-index: ${zIndex};
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
  const visibleCount = Math.min(count, MAX_VISIBLE);
  const totalWidth = THUMB_SIZE + (visibleCount - 1) * STACK_OFFSET;

  const wrapper = document.createElement("div");
  wrapper.style.cssText = `
    position: relative;
    width: ${totalWidth}px;
    height: ${THUMB_SIZE}px;
    cursor: pointer;
    pointer-events: auto;
  `;
  wrapper.dataset.clusterSize = String(count);

  // Render stacked thumbnails (last on top)
  for (let i = 0; i < visibleCount; i++) {
    const url = data.thumbnailUrls[i];
    if (!url) continue;
    const offsetX = i * STACK_OFFSET;
    const circle = createThumbnailCircle(url, THUMB_SIZE, offsetX, i + 1);
    wrapper.appendChild(circle);
  }

  // Count badge for clusters with more than MAX_VISIBLE photos
  if (count > MAX_VISIBLE) {
    const badge = document.createElement("div");
    badge.textContent = `+${count - MAX_VISIBLE}`;
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
      z-index: ${visibleCount + 1};
      line-height: 14px;
      white-space: nowrap;
    `;
    wrapper.appendChild(badge);
  }

  // Click handler: navigate to group
  wrapper.addEventListener("click", (e) => {
    e.stopPropagation();
    // If all points share the same group, navigate directly
    const groupIds = new Set(data.points.map((p) => p.groupId));
    if (groupIds.size === 1) {
      window.location.href = `/groups/${data.points[0]!.groupId}`;
    }
    // Mixed groups: handled in US-009/US-010 (fan-out first)
  });

  return wrapper;
}
