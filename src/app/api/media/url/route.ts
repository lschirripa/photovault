import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/infrastructure/supabase/server";
import { getStorageService } from "@/infrastructure/cloudflare/r2-storage-service";
import { getStandardLimiter } from "@/infrastructure/redis/rate-limit";
import { checkRateLimit } from "@/infrastructure/redis/with-rate-limit";
import type { Tables } from "@/types/supabase";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerComponentClient();

    // Verify authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit
    const rateLimited = await checkRateLimit(getStandardLimiter(), user.id);
    if (rateLimited) return rateLimited;

    const assetId = request.nextUrl.searchParams.get("assetId");
    const type = request.nextUrl.searchParams.get("type") || "thumbnail"; // "thumbnail" or "original"

    if (!assetId) {
      return NextResponse.json({ error: "Missing assetId" }, { status: 400 });
    }

    // Get the asset and verify user has access (via group membership)
    const { data: asset, error: assetError } = (await supabase
      .from("media_assets")
      .select("*, groups!media_assets_group_id_fkey!inner(id)")
      .eq("id", assetId)
      .single()) as unknown as { data: (Tables<"media_assets"> & { groups: { id: string } }) | null; error: Error | null };

    if (assetError || !asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    const storageService = getStorageService();
    let key: string;
    if (type === "original") {
      // For HEIC/HEIF, serve the web-compatible JPEG version instead
      const isHeic = asset.mime_type === "image/heic" || asset.mime_type === "image/heif";
      if (isHeic) {
        // New key scheme: media/{groupId}/{YYYY}/{MM}/{assetId}-{filename}
        // Old key scheme: media/{groupId}/{userId}/{timestamp}-{filename}
        // Distinguish by checking whether parts[2] is a 4-digit year.
        const parts = asset.original_key.split("/");
        if (/^\d{4}$/.test(parts[2])) {
          key = `web/${parts[1]}/${parts[2]}/${parts[3]}/${asset.id}.jpg`;
        } else {
          key = asset.original_key.replace(/\/([^/]+)\.[^.]+$/, "/web_$1.jpg");
        }
      } else {
        key = asset.original_key;
      }
    } else {
      key = asset.thumbnail_key || asset.original_key;
    }

    const url = await storageService.generateDownloadUrl(key);

    return NextResponse.json(
      { url },
      {
        headers: {
          "Cache-Control": "private, max-age=2700", // 45 minutes
        },
      }
    );
  } catch (error) {
    console.error("Get media URL error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
