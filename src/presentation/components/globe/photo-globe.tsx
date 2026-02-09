"use client";

import { useRef, useCallback, useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Globe from "react-globe.gl";
import type { GlobeMethods } from "react-globe.gl";
import { useGeoMedia } from "@/presentation/hooks/use-geo-media";
import { useUrlCache } from "@/presentation/hooks/use-url-cache";
import {
  createMarkerElement,
  type ClusterMarkerData,
} from "./create-marker-element";
import { clusterPoints, haversineDistance } from "./geo-utils";

const GLOBE_IMAGE_URL =
  "//cdn.jsdelivr.net/npm/three-globe/example/img/earth-night.jpg";
const BUMP_IMAGE_URL =
  "//cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png";

const NAV_HEIGHT = 56;

export default function PhotoGlobe() {
  const globeEl = useRef<GlobeMethods | undefined>(undefined);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const router = useRouter();
  const { points, loading } = useGeoMedia();
  const { fetchUrls } = useUrlCache();
  const [clusterData, setClusterData] = useState<ClusterMarkerData[]>([]);
  const [globeReady, setGlobeReady] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

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

  // Build deduplicated labels from cluster location data
  const labelsData = useMemo(() => {
    if (clusters.length === 0) return [];

    const rawLabels: Array<{ lat: number; lng: number; text: string }> = [];
    for (const cluster of clusters) {
      const firstWithCity = cluster.points.find((p) => p.locationCity);
      const firstWithCountry = cluster.points.find((p) => p.locationCountry);
      const text =
        firstWithCity?.locationCity ?? firstWithCountry?.locationCountry ?? "";
      if (!text) continue;
      rawLabels.push({
        lat: cluster.center.lat,
        lng: cluster.center.lng,
        text,
      });
    }

    const deduped: typeof rawLabels = [];
    for (const label of rawLabels) {
      const duplicate = deduped.some(
        (existing) =>
          existing.text === label.text &&
          haversineDistance(existing.lat, existing.lng, label.lat, label.lng) <
            100,
      );
      if (!duplicate) {
        deduped.push(label);
      }
    }

    return deduped;
  }, [clusters]);

  // Measure container dimensions
  useEffect(() => {
    const updateDimensions = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight - NAV_HEIGHT,
      });
    };
    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  // Fetch thumbnail URLs for all geo points, then build cluster marker data
  useEffect(() => {
    if (points.length === 0 || clusters.length === 0) return;
    let cancelled = false;

    const assetIds = points.map((p) => p.id);
    fetchUrls(assetIds, "thumbnail")
      .then((urls) => {
        if (cancelled) return;
        const data: ClusterMarkerData[] = clusters.map((cluster) => ({
          lat: cluster.center.lat,
          lng: cluster.center.lng,
          points: cluster.points,
          thumbnailUrls: cluster.points.map((p) => urls[p.id] ?? null),
        }));
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
          createMarkerElement(d as ClusterMarkerData, handleNavigate)
        }
        htmlTransitionDuration={500}
        labelsData={labelsData}
        labelLat="lat"
        labelLng="lng"
        labelText="text"
        labelColor={() => "rgba(255,255,255,0.6)"}
        labelSize={0.4}
        labelAltitude={0.015}
        labelDotRadius={0}
        labelsTransitionDuration={500}
      />
    </div>
  );
}
