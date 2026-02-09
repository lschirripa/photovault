"use client";

import { useRef, useCallback, useState, useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import R3fGlobe from "r3f-globe";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
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

export default function PhotoGlobe() {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const { points, loading } = useGeoMedia();
  const { fetchUrls } = useUrlCache();
  const [clusterData, setClusterData] = useState<ClusterMarkerData[]>([]);

  const clusters = useMemo(
    () => (points.length > 0 ? clusterPoints(points, 50) : []),
    [points]
  );

  // Build deduplicated labels from cluster location data
  const labelsData = useMemo(() => {
    if (clusters.length === 0) return [];

    const rawLabels: Array<{ lat: number; lng: number; text: string }> = [];
    for (const cluster of clusters) {
      // Pick the best label: prefer city, fallback to country
      const firstWithCity = cluster.points.find((p) => p.locationCity);
      const firstWithCountry = cluster.points.find((p) => p.locationCountry);
      const text =
        firstWithCity?.locationCity ??
        firstWithCountry?.locationCountry ??
        "";
      if (!text) continue;
      rawLabels.push({
        lat: cluster.center.lat,
        lng: cluster.center.lng,
        text,
      });
    }

    // Deduplicate labels: skip if same text and within 100km of an existing label
    const deduped: typeof rawLabels = [];
    for (const label of rawLabels) {
      const duplicate = deduped.some(
        (existing) =>
          existing.text === label.text &&
          haversineDistance(
            existing.lat,
            existing.lng,
            label.lat,
            label.lng
          ) < 100
      );
      if (!duplicate) {
        deduped.push(label);
      }
    }

    return deduped;
  }, [clusters]);

  // Fetch thumbnail URLs for all geo points, then build cluster marker data
  useEffect(() => {
    if (points.length === 0 || clusters.length === 0) return;

    const assetIds = points.map((p) => p.id);
    fetchUrls(assetIds, "thumbnail").then((urls) => {
      const data: ClusterMarkerData[] = clusters.map((cluster) => ({
        lat: cluster.center.lat,
        lng: cluster.center.lng,
        points: cluster.points,
        thumbnailUrls: cluster.points
          .map((p) => urls[p.id] ?? "")
          .filter(Boolean),
      }));
      setClusterData(data);
    });
  }, [points, clusters, fetchUrls]);

  const handleInteractionStart = useCallback(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = false;
    }
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
  }, []);

  const handleInteractionEnd = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
    idleTimerRef.current = setTimeout(() => {
      if (controlsRef.current) {
        controlsRef.current.autoRotate = true;
      }
    }, 3000);
  }, []);

  if (!loading && points.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-gray-400">
        No photos with location data yet
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <Canvas
        flat
        camera={{ fov: 50, position: [0, 0, 350] }}
        style={{ background: "#0a0a0a" }}
      >
        <ambientLight color={0xcccccc} intensity={Math.PI} />
        <directionalLight intensity={0.6 * Math.PI} />
        <OrbitControls
          ref={controlsRef}
          autoRotate
          autoRotateSpeed={0.5}
          enablePan={false}
          minDistance={120}
          maxDistance={800}
          dampingFactor={0.1}
          zoomSpeed={0.3}
          rotateSpeed={0.3}
          onStart={handleInteractionStart}
          onEnd={handleInteractionEnd}
        />
        <R3fGlobe
          globeImageUrl={GLOBE_IMAGE_URL}
          bumpImageUrl={BUMP_IMAGE_URL}
          showAtmosphere
          atmosphereColor="lightskyblue"
          atmosphereAltitude={0.2}
          htmlElementsData={clusterData}
          htmlLat="lat"
          htmlLng="lng"
          htmlAltitude={0.01}
          htmlElement={(d: object) =>
            createMarkerElement(d as ClusterMarkerData)
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
          labelIncludeDot={false}
          labelsTransitionDuration={500}
        />
      </Canvas>
    </div>
  );
}
