"use client";

import { useRef, useCallback, useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Globe from "react-globe.gl";
import type { GlobeMethods } from "react-globe.gl";
import { useGeoMedia } from "@/presentation/hooks/use-geo-media";
import { useUrlCache } from "@/presentation/hooks/use-url-cache";
import {
  createMarkerElement,
  GlobeElementData,
  type ClusterMarkerData,
} from "./create-marker-element";
import { clusterPoints } from "./geo-utils";
import { ClusterPopup } from "./cluster-popup";

interface GroupData {
  groupId: string;
  groupName: string;
  locationCity?: string;
  locationCountry?: string;
  thumbnailUrl?: string | null;
  pointCount: number;
}

const GLOBE_IMAGE_URL =
  "https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-night.jpg";
const BUMP_IMAGE_URL =
  "https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png";

export default function PhotoGlobe() {
  const globeEl = useRef<GlobeMethods | undefined>(undefined);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const router = useRouter();
  const { points, loading } = useGeoMedia();
  const { fetchUrls } = useUrlCache();
  const [clusterData, setClusterData] = useState<ClusterMarkerData[]>([]);
  const [globeReady, setGlobeReady] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [selectedCluster, setSelectedCluster] = useState<{
    lat: number;
    lng: number;
    groups: GroupData[];
  } | null>(null);

  useEffect(() => {
    const updateDimensions = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight - 56, // NAV_HEIGHT
      });
    };
    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  const handleNavigate = useCallback(
    (path: string) => {
      router.push(path);
    },
    [router],
  );

  const clusters = useMemo(
    () => (points.length > 0 ? clusterPoints(points, 50) : []),
    [points],
  );

  // Fetch thumbnail URLs for all geo points, then build cluster marker data
  useEffect(() => {
    if (points.length === 0 || clusters.length === 0) return;
    let cancelled = false;

    const assetIds = points.map((p) => p.id);
    fetchUrls(assetIds, "thumbnail")
      .then((urls) => {
        if (cancelled) return;
        const data: ClusterMarkerData[] = clusters.map((cluster) => {
          const firstWithCity = cluster.points.find((p) => p.locationCity);
          const firstWithCountry = cluster.points.find(
            (p) => p.locationCountry,
          );
          const label =
            firstWithCity?.locationCity ??
            firstWithCountry?.locationCountry ??
            undefined;

          return {
            type: "marker",
            lat: cluster.center.lat,
            lng: cluster.center.lng,
            points: cluster.points,
            thumbnailUrls: cluster.points
              .map((p) => urls[p.id] ?? "")
              .filter(Boolean),
            label,
          };
        });
        setClusterData(data);
      })
      .catch(() => {
        // fetchUrls handles errors internally
      });

    return () => {
      cancelled = true;
    };
  }, [points, clusters, fetchUrls]);

  // Configure globe controls after mount
  useEffect(() => {
    if (!globeEl.current) return;
    const controls = globeEl.current.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.5;
    controls.enablePan = false;
    controls.minDistance = 120;
    controls.maxDistance = 800;

    // Set initial point of view
    globeEl.current.pointOfView({ altitude: 2.5 });

    // Auto-rotation pause on interaction
    const handleStart = () => {
      controls.autoRotate = false;
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
    };

    const handleEnd = () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
      idleTimerRef.current = setTimeout(() => {
        controls.autoRotate = true;
      }, 3000);
    };

    controls.addEventListener("start", handleStart);
    controls.addEventListener("end", handleEnd);

    return () => {
      controls.removeEventListener("start", handleStart);
      controls.removeEventListener("end", handleEnd);
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
    };
  }, [globeReady]);

  // Handle auto-rotation based on popup state
  useEffect(() => {
    if (!globeEl.current) return;
    const controls = globeEl.current.controls();

    if (selectedCluster) {
      controls.autoRotate = false;
      // Also clear idle timer to prevent it from restarting
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    } else {
      // Resume rotation if no popup
      controls.autoRotate = true;
    }
  }, [selectedCluster]);

  const handleGlobeReady = useCallback(() => {
    setGlobeReady(true);
  }, []);

  if (!loading && points.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-gray-400">
        No photos with location data yet
      </div>
    );
  }

  return (
    <div
      className="w-full h-full"
      style={{
        opacity: globeReady ? 1 : 0,
        transition: "opacity 500ms ease-in",
      }}
    >
      {dimensions.width === 0 || dimensions.height === 0 ? null : (
        <Globe
          ref={globeEl}
          width={dimensions.width}
          height={dimensions.height}
          globeImageUrl={GLOBE_IMAGE_URL}
          bumpImageUrl={BUMP_IMAGE_URL}
          showAtmosphere={true}
          atmosphereColor="lightskyblue"
          atmosphereAltitude={0.2}
          backgroundColor="#0a0a0a"
          onGlobeReady={handleGlobeReady}
          htmlElementsData={clusterData}
          htmlLat="lat"
          htmlLng="lng"
          htmlAltitude={0.01}
          htmlElement={(d: object) =>
            createMarkerElement(
              d as GlobeElementData,
              handleNavigate,
              (markerData: ClusterMarkerData) => {
                const groupsMap = new Map<
                  string,
                  {
                    groupId: string;
                    groupName: string;
                    locationCity?: string;
                    locationCountry?: string;
                    thumbnailUrl?: string | null;
                    pointCount: number;
                  }
                >();

                markerData.points.forEach((p, idx) => {
                  const existing = groupsMap.get(p.groupId);
                  if (existing) {
                    existing.pointCount++;
                  } else {
                    groupsMap.set(p.groupId, {
                      groupId: p.groupId,
                      groupName: p.groupName,
                      locationCity: p.locationCity,
                      locationCountry: p.locationCountry,
                      thumbnailUrl: markerData.thumbnailUrls[idx],
                      pointCount: 1,
                    });
                  }
                });

                const groups = Array.from(groupsMap.values());

                setSelectedCluster({
                  lat: markerData.lat,
                  lng: markerData.lng,
                  groups,
                });
              },
            )
          }
          htmlTransitionDuration={500}
        />
      )}
      {selectedCluster && (
        <div
          className="absolute inset-0 z-[50] flex items-center justify-center"
          onClick={() => setSelectedCluster(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Cluster details"
        >
          {/* Fade Masks */}

          <div className="w-full" onClick={(e) => e.stopPropagation()}>
            {/* Fade Masks */}
            <div className="absolute left-0 inset-y-0 w-56 bg-gradient-to-r from-[#000]/100 to-transparent z-100! pointer-events-none" />
            <div className="absolute right-0 inset-y-0 w-56 bg-gradient-to-l from-[#000]/100 to-transparent z-100! pointer-events-none" />
            <ClusterPopup
              groups={selectedCluster.groups}
              onNavigate={handleNavigate}
              onClose={() => setSelectedCluster(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
