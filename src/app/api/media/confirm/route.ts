import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/infrastructure/supabase/server";
import { ConfirmUploadRequestDTO } from "@/application/dto/media-dto";
import { getUploadLimiter } from "@/infrastructure/redis/rate-limit";
import { checkRateLimit } from "@/infrastructure/redis/with-rate-limit";
import type { Tables } from "@/types/supabase";

export async function POST(request: NextRequest) {
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
    const rateLimited = await checkRateLimit(getUploadLimiter(), user.id);
    if (rateLimited) return rateLimited;

    const body: ConfirmUploadRequestDTO = await request.json();
    const { assetId, width, height, durationSeconds, thumbnailKey } = body;

    // Verify the asset exists and belongs to the user
    const { data: asset, error: assetError } = (await supabase
      .from("media_assets")
      .select("*")
      .eq("id", assetId)
      .eq("uploaded_by", user.id)
      .single()) as unknown as { data: Tables<"media_assets"> | null; error: Error | null };

    if (assetError || !asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    if (asset.status !== "uploading") {
      return NextResponse.json(
        { error: "Asset already processed" },
        { status: 400 }
      );
    }

    // Update asset status to processing with client-supplied dimensions
    const updatePayload: Record<string, unknown> = {
      status: "processing",
      width: width ?? null,
      height: height ?? null,
      duration_seconds: durationSeconds ?? null,
    };
    if (thumbnailKey) {
      updatePayload.thumbnail_key = thumbnailKey;
    }
    const { error: updateError } = await supabase
      .from("media_assets")
      .update(updatePayload)
      .eq("id", assetId);

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to update asset" },
        { status: 500 }
      );
    }

    // Trigger thumbnail generation webhook (fire and forget)
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL || ""}/api/webhooks/thumbnail`;
    fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId }),
    }).catch(console.error);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Confirm upload error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
