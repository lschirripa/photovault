import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/infrastructure/supabase/server";
import { getStorageService } from "@/infrastructure/cloudflare/r2-storage-service";
import { getStandardLimiter } from "@/infrastructure/redis/rate-limit";
import { checkRateLimit } from "@/infrastructure/redis/with-rate-limit";
import { sanitizeMimeType } from "@/infrastructure/utils/mime";
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

    if (!assetId) {
      return NextResponse.json({ error: "Missing assetId" }, { status: 400 });
    }

    // Get the asset and verify user has access (via group membership)
    const { data: asset, error: assetError } = (await supabase
      .from("media_assets")
      .select("*, groups!media_assets_group_id_fkey!inner(id)")
      .eq("id", assetId)
      .single()) as unknown as {
      data: (Tables<"media_assets"> & { groups: { id: string } }) | null;
      error: Error | null;
    };

    if (assetError || !asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    const storageService = getStorageService();

    // Fetch the file from R2 and stream it with Content-Disposition header
    const downloadUrl = await storageService.generateDownloadUrl(
      asset.original_key,
      3600 // 1 hour expiration
    );

    const fileResponse = await fetch(downloadUrl);

    if (!fileResponse.ok || !fileResponse.body) {
      return NextResponse.json({ error: "Failed to fetch file" }, { status: 500 });
    }

    return new NextResponse(fileResponse.body, {
      headers: {
        "Content-Type": sanitizeMimeType(asset.mime_type),
        "Content-Disposition": `attachment; filename="${encodeURIComponent(asset.filename)}"`,
        "Content-Length": String(asset.size_bytes),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Download media error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
