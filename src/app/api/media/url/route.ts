import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/infrastructure/supabase/server";
import { getStorageService } from "@/infrastructure/cloudflare/r2-storage-service";
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
        key = asset.original_key.replace(
          /\/([^/]+)\.[^.]+$/,
          "/web_$1.jpg"
        );
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
