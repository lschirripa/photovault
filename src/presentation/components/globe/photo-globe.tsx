"use client";

import { useRef, useCallback, useState, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import R3fGlobe from "r3f-globe";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useGeoMedia } from "@/presentation/hooks/use-geo-media";
import { useUrlCache } from "@/presentation/hooks/use-url-cache";
import { createMarkerElement, type MarkerData } from "./create-marker-element";

const GLOBE_IMAGE_URL =
  "//cdn.jsdelivr.net/npm/three-globe/example/img/earth-night.jpg";
const BUMP_IMAGE_URL =
  "//cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png";

export default function PhotoGlobe() {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const { points, loading } = useGeoMedia();
  const { fetchUrls } = useUrlCache();
  const [markerData, setMarkerData] = useState<MarkerData[]>([]);

  // Fetch thumbnail URLs for all geo points
  useEffect(() => {
    if (points.length === 0) return;

    const assetIds = points.map((p) => p.id);
    fetchUrls(assetIds, "thumbnail").then((urls) => {
      const data: MarkerData[] = points
        .filter((p) => urls[p.id])
        .map((p) => ({
          lat: p.lat,
          lng: p.lng,
          thumbnailUrl: urls[p.id]!,
          groupId: p.groupId,
          assetId: p.id,
        }));
      setMarkerData(data);
    });
  }, [points, fetchUrls]);

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
          htmlElementsData={markerData}
          htmlLat="lat"
          htmlLng="lng"
          htmlAltitude={0.01}
          htmlElement={(d: object) =>
            createMarkerElement(d as MarkerData)
          }
          htmlTransitionDuration={500}
        />
      </Canvas>
    </div>
  );
}
