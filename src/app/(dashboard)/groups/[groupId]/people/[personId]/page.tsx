"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/presentation/providers/auth-provider";
import { useUrlCache } from "@/presentation/hooks/use-url-cache";

interface PersonMediaAsset {
  id: string;
  groupId: string;
  filename: string;
  mediaType: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  status: string;
  createdAt: string;
}

export default function PersonDetailPage() {
  const { user, loading: authLoading } = useAuth();
  const params = useParams();
  const groupId = params.groupId as string;
  const personId = params.personId as string;

  const [personName, setPersonName] = useState<string | null>(null);
  const [assets, setAssets] = useState<PersonMediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
  const { fetchUrls } = useUrlCache();

  const fetchPerson = useCallback(async () => {
    const res = await fetch(`/api/persons?groupId=${groupId}`);
    if (res.ok) {
      const data = await res.json();
      const person = data.persons.find((p: { id: string }) => p.id === personId);
      if (person) setPersonName(person.name);
    }
  }, [groupId, personId]);

  const fetchMedia = useCallback(
    async (nextCursor?: string) => {
      setLoading(true);
      try {
        const url = new URL(`/api/persons/${personId}/media`, window.location.origin);
        url.searchParams.set("limit", "40");
        if (nextCursor) url.searchParams.set("cursor", nextCursor);

        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();

        const newAssets: PersonMediaAsset[] = data.assets;
        setAssets((prev) =>
          nextCursor ? [...prev, ...newAssets] : newAssets
        );
        setHasMore(data.hasMore);
        setCursor(data.nextCursor);

        // Fetch thumbnail URLs
        const assetIds = newAssets.map((a) => a.id);
        if (assetIds.length > 0) {
          const urls = await fetchUrls(assetIds, "thumbnail");
          setThumbnailUrls((prev) => ({ ...prev, ...urls }));
        }
      } catch (err) {
        console.error("Failed to fetch person media:", err);
      } finally {
        setLoading(false);
      }
    },
    [personId, fetchUrls]
  );

  useEffect(() => {
    if (user) {
      fetchPerson();
      fetchMedia();
    }
  }, [user, fetchPerson, fetchMedia]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-8">
      <header className="mb-8">
        <Link
          href={`/groups/${groupId}`}
          className="text-sm text-blue-600 hover:underline mb-2 inline-block"
        >
          &larr; Back to group
        </Link>
        <h1 className="text-2xl font-bold">
          {personName || "Unknown Person"}
        </h1>
        <p className="text-sm text-gray-500">
          {assets.length}{hasMore ? "+" : ""} photo{assets.length !== 1 ? "s" : ""}
        </p>
      </header>

      {assets.length === 0 ? (
        <p className="text-gray-500">No photos found for this person.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {assets.map((asset) => {
              const thumbUrl = thumbnailUrls[asset.id];
              return (
                <div
                  key={asset.id}
                  className="aspect-square relative bg-gray-200 dark:bg-gray-800 rounded overflow-hidden"
                >
                  {thumbUrl ? (
                    <Image
                      src={thumbUrl}
                      alt={asset.filename}
                      fill
                      unoptimized
                      className="object-cover"
                      sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 16vw"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="w-6 h-6 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
                    </div>
                  )}
                  {asset.mediaType === "video" && (
                    <div className="absolute bottom-1 right-1 bg-black/60 text-white text-xs px-1 rounded">
                      Video
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {hasMore && (
            <div className="text-center mt-6">
              <button
                onClick={() => cursor && fetchMedia(cursor)}
                disabled={loading}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                {loading ? "Loading..." : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
