import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient, createServiceClient } from "@/infrastructure/supabase/server";
import { getStorageService } from "@/infrastructure/cloudflare/r2-storage-service";
import type { Tables } from "@/types/supabase";

export async function POST(request: NextRequest) {
  try {
    // Allow either cron secret or authenticated user session
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

    if (!isCron) {
      const userClient = await createServerComponentClient();
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const supabase = createServiceClient();

    // Cron uses 1-hour threshold to avoid deleting in-progress uploads;
    // manual trigger cleans up all stuck uploads regardless of age.
    let query = supabase
      .from("media_assets")
      .select("id, original_key, thumbnail_key")
      .in("status", ["uploading", "processing"]);

    if (isCron) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      query = query.lt("created_at", oneHourAgo);
    }

    const { data: staleAssets, error: queryError } = (await query) as unknown as {
      data: Pick<Tables<"media_assets">, "id" | "original_key" | "thumbnail_key">[] | null;
      error: Error | null;
    };

    if (queryError) {
      console.error("Cleanup query error:", queryError);
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }

    if (!staleAssets || staleAssets.length === 0) {
      return NextResponse.json({ cleaned: 0 });
    }

    // Collect R2 keys to delete
    const keysToDelete: string[] = [];
    for (const asset of staleAssets) {
      if (asset.original_key) keysToDelete.push(asset.original_key);
      if (asset.thumbnail_key) keysToDelete.push(asset.thumbnail_key);
    }

    // Delete R2 objects
    if (keysToDelete.length > 0) {
      const storageService = getStorageService();
      await storageService.deleteObjects(keysToDelete);
    }

    // Delete DB records
    const staleIds = staleAssets.map((a) => a.id);
    const { error: deleteError } = await supabase
      .from("media_assets")
      .delete()
      .in("id", staleIds);

    if (deleteError) {
      console.error("Cleanup delete error:", deleteError);
      return NextResponse.json({ error: "Delete failed" }, { status: 500 });
    }

    console.log(`Cleaned up ${staleAssets.length} orphaned uploads`);
    return NextResponse.json({ cleaned: staleAssets.length });
  } catch (error) {
    console.error("Cleanup error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
