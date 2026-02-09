import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/infrastructure/supabase/server";
import { getStorageService } from "@/infrastructure/cloudflare/r2-storage-service";
import type { Tables } from "@/types/supabase";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerComponentClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { assetIds, type = "thumbnail" } = body as {
      assetIds: string[];
      type?: "thumbnail" | "original";
    };

    if (!assetIds || !Array.isArray(assetIds) || assetIds.length === 0) {
      return NextResponse.json(
        { error: "Missing or empty assetIds array" },
        { status: 400 }
      );
    }

    if (assetIds.length > 200) {
      return NextResponse.json(
        { error: "Maximum 200 asset IDs per request" },
        { status: 400 }
      );
    }

    // Fetch all assets in one query - RLS ensures user can only see assets in their groups
    const { data: assets, error: assetsError } = (await supabase
      .from("media_assets")
      .select("id, original_key, thumbnail_key, mime_type")
      .in("id", assetIds)) as unknown as {
      data: Pick<Tables<"media_assets">, "id" | "original_key" | "thumbnail_key" | "mime_type">[] | null;
      error: Error | null;
    };

    if (assetsError) {
      console.error("Batch URL fetch error:", assetsError);
      return NextResponse.json(
        { error: "Failed to fetch assets" },
        { status: 500 }
      );
    }

    if (!assets || assets.length === 0) {
      return NextResponse.json({ urls: {} });
    }

    const storageService = getStorageService();

    // Generate all presigned URLs in parallel
    const urlEntries = await Promise.all(
      assets.map(async (asset) => {
        let key: string;
        if (type === "original") {
          const isHeic =
            asset.mime_type === "image/heic" ||
            asset.mime_type === "image/heif";
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
        return [asset.id, url] as const;
      })
    );

    const urls: Record<string, string> = Object.fromEntries(urlEntries);

    return NextResponse.json(
      { urls },
      {
        headers: {
          "Cache-Control": "private, max-age=2700", // 45 minutes
        },
      }
    );
  } catch (error) {
    console.error("Batch URL error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
