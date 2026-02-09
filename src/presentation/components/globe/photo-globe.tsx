"use client";

import { useRef, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import R3fGlobe from "r3f-globe";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

const GLOBE_IMAGE_URL =
  "//cdn.jsdelivr.net/npm/three-globe/example/img/earth-night.jpg";
const BUMP_IMAGE_URL =
  "//cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png";

export default function PhotoGlobe() {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

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
        />
      </Canvas>
    </div>
  );
}
