export interface MarkerData {
  lat: number;
  lng: number;
  thumbnailUrl: string;
  groupId: string;
  assetId: string;
}

/** Creates a single circular thumbnail marker as a DOM element. */
export function createMarkerElement(data: MarkerData): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.style.cssText = `
    width: 40px;
    height: 40px;
    border-radius: 50%;
    overflow: hidden;
    border: 2px solid white;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    pointer-events: auto;
  `;

  const img = document.createElement("img");
  img.src = data.thumbnailUrl;
  img.alt = "";
  img.style.cssText = `
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  `;
  img.draggable = false;

  wrapper.appendChild(img);

  wrapper.addEventListener("click", (e) => {
    e.stopPropagation();
    window.location.href = `/groups/${data.groupId}`;
  });

  return wrapper;
}
