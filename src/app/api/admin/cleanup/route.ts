import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient, createServiceClient } from "@/infrastructure/supabase/server";
import { getStorageService } from "@/infrastructure/cloudflare/r2-storage-service";
import type { Tables } from "@/types/supabase";

export async function POST(request: NextRequest) {
  try {
    // Allow either cron secret or authenticated user session
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret && process.env.NODE_ENV === "production") {
      console.error("CRON_SECRET must be set in production");
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

    if (!isCron) {
      const userClient = await createServerComponentClient();
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const supabase = createServiceClient();
    const storageService = getStorageService();

    // --- Part 1: Clean up stale uploads ---
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

    let cleanedStale = 0;

    if (staleAssets && staleAssets.length > 0) {
      // Collect R2 keys to delete
      const keysToDelete: string[] = [];
      for (const asset of staleAssets) {
        if (asset.original_key) keysToDelete.push(asset.original_key);
        if (asset.thumbnail_key) keysToDelete.push(asset.thumbnail_key);
      }

      // Delete R2 objects
      if (keysToDelete.length > 0) {
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

      cleanedStale = staleAssets.length;
    }

    // --- Part 2: Clean up R2 orphans from incomplete group deletions ---
    // Find media_assets whose group_id no longer exists in the groups table.
    let cleanedOrphans = 0;

    const { data: orphanedAssets, error: orphanError } = (await supabase
      .from("media_assets")
      .select("id, original_key, thumbnail_key, group_id")
      .is("groups!media_assets_group_id_fkey", null)
      .limit(500)) as unknown as {
      data: Pick<Tables<"media_assets">, "id" | "original_key" | "thumbnail_key" | "group_id">[] | null;
      error: Error | null;
    };

    if (!orphanError && orphanedAssets && orphanedAssets.length > 0) {
      const orphanKeys: string[] = [];
      for (const asset of orphanedAssets) {
        if (asset.original_key) orphanKeys.push(asset.original_key);
        if (asset.thumbnail_key) orphanKeys.push(asset.thumbnail_key);
      }

      if (orphanKeys.length > 0) {
        try {
          await storageService.deleteObjects(orphanKeys);
        } catch (e) {
          console.error("Failed to delete orphan R2 keys:", e);
        }
      }

      const orphanIds = orphanedAssets.map((a) => a.id);
      await supabase.from("media_assets").delete().in("id", orphanIds);
      cleanedOrphans = orphanedAssets.length;
    }

    const total = cleanedStale + cleanedOrphans;
    if (total > 0) {
      console.log(
        `Cleanup: ${cleanedStale} stale uploads, ${cleanedOrphans} orphaned assets`
      );
    }

    return NextResponse.json({
      cleaned: total,
      stale: cleanedStale,
      orphans: cleanedOrphans,
    });
  } catch (error) {
    console.error("Cleanup error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
