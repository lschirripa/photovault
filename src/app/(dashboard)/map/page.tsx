"use client";

import dynamic from "next/dynamic";

const PhotoGlobe = dynamic(
  () => import("@/presentation/components/globe/photo-globe"),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
      </div>
    ),
  }
);

export default function MapPage() {
  return (
    <div className="h-[calc(100dvh-56px)]">
      <PhotoGlobe />
    </div>
  );
}
