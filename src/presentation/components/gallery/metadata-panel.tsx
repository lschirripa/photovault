"use client";

import { useEffect, useState } from "react";
import type { MediaAsset } from "@/domain/entities/media-asset";
import { createClient } from "@/infrastructure/supabase/browser";
import { formatBytes } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface MetadataPanelProps {
  asset: MediaAsset;
  isOpen: boolean;
  onClose: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-3 border-b border-white/10 last:border-0">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
        {title}
      </h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-400">{label}</span>
      <span className="text-white text-right ml-4 truncate max-w-[180px]">{value}</span>
    </div>
  );
}

function MetadataContent({ asset }: { asset: MediaAsset }) {
  const meta = asset.metadata;
  const [uploaderName, setUploaderName] = useState<string | null>(null);
  const [uploaderEmail, setUploaderEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("profiles")
      .select("display_name, email")
      .eq("id", asset.uploadedBy)
      .single()
      .then(({ data }) => {
        const profile = data as { display_name: string; email: string | null } | null;
        if (profile) {
          setUploaderName(profile.display_name);
          setUploaderEmail(profile.email);
        }
      });
  }, [asset.uploadedBy]);

  return (
    <>
      {/* File section */}
      <Section title="File">
        <Row label="Name" value={asset.filename} />
        <Row label="Type" value={asset.mimeType} />
        <Row label="Size" value={formatBytes(asset.sizeBytes)} />
        {asset.width && asset.height && (
          <Row label="Dimensions" value={`${asset.width} × ${asset.height}`} />
        )}
        <Row
          label="Uploaded"
          value={asset.createdAt.toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        />
        <Row label="Uploaded by" value={uploaderName} />
        <Row label="Email" value={uploaderEmail} />
      </Section>

      {/* Camera section */}
      {meta && (meta.cameraMake || meta.cameraModel || meta.lensModel) && (
        <Section title="Camera">
          {meta.cameraMake && meta.cameraModel && (
            <Row label="Camera" value={`${meta.cameraMake} ${meta.cameraModel}`} />
          )}
          <Row label="Lens" value={meta.lensModel} />
        </Section>
      )}

      {/* Exposure section */}
      {meta &&
        (meta.focalLength || meta.fNumber || meta.exposureTime || meta.iso) && (
          <Section title="Exposure">
            {meta.focalLength && <Row label="Focal length" value={`${meta.focalLength} mm`} />}
            {meta.fNumber && <Row label="Aperture" value={`f/${meta.fNumber}`} />}
            {meta.exposureTime && <Row label="Shutter" value={`${meta.exposureTime} s`} />}
            {meta.iso && <Row label="ISO" value={meta.iso} />}
          </Section>
        )}

      {/* Date section */}
      {meta?.dateTaken && (
        <Section title="Date taken">
          <Row
            label="Date"
            value={meta.dateTaken.toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          />
          <Row
            label="Time"
            value={meta.dateTaken.toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          />
        </Section>
      )}

      {/* Location section */}
      {meta && (meta.latitude != null || meta.locationCountry) && (
        <Section title="Location">
          {meta.locationCountry && (
            <Row
              label="Place"
              value={[meta.locationCity, meta.locationState, meta.locationCountry]
                .filter(Boolean)
                .join(", ")}
            />
          )}
          {meta.latitude != null && meta.longitude != null && (
            <>
              <Row label="Lat" value={meta.latitude.toFixed(6)} />
              <Row label="Lon" value={meta.longitude.toFixed(6)} />
              {meta.altitude != null && <Row label="Altitude" value={`${Math.round(meta.altitude)} m`} />}
              <div className="mt-2">
                <a
                  href={`https://www.google.com/maps?q=${meta.latitude},${meta.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-400 hover:text-blue-300 hover:underline"
                >
                  View on map &rarr;
                </a>
              </div>
            </>
          )}
        </Section>
      )}
    </>
  );
}

export function MetadataPanel({ asset, isOpen, onClose }: MetadataPanelProps) {
  return (
    <>
      {/* Desktop: side panel (md+) */}
      <div
        className={cn(
          "hidden md:block absolute top-0 right-0 h-full w-80 bg-black/80 backdrop-blur-sm border-l border-white/10 overflow-y-auto transition-transform duration-200 z-20",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">Info</h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <MetadataContent asset={asset} />
        </div>
      </div>

      {/* Mobile: bottom sheet (<md) */}
      <div
        className={cn(
          "md:hidden fixed inset-x-0 bottom-0 z-30 transition-transform duration-300 ease-out",
          isOpen ? "translate-y-0" : "translate-y-full"
        )}
      >
        {/* Backdrop */}
        {isOpen && (
          <div
            className="fixed inset-0 bg-black/40 -z-10"
            onClick={onClose}
          />
        )}
        <div className="bg-black/90 backdrop-blur-md rounded-t-2xl max-h-[60vh] overflow-y-auto">
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-white/30" />
          </div>
          <div className="px-4 pb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-white">Info</h2>
              <button
                onClick={onClose}
                className="p-1 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <MetadataContent asset={asset} />
          </div>
        </div>
      </div>
    </>
  );
}
