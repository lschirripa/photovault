import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/infrastructure/supabase/server";
import { getStorageService } from "@/infrastructure/cloudflare/r2-storage-service";
import type { Tables } from "@/types/supabase";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  try {
    const { assetId } = await params;
    const supabase = await createServerComponentClient();

    // Verify authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get the asset to verify ownership/permissions and get storage keys
    const { data: asset, error: assetError } = (await supabase
      .from("media_assets")
      .select("*")
      .eq("id", assetId)
      .single()) as unknown as {
      data: Tables<"media_assets"> | null;
      error: Error | null;
    };

    if (assetError || !asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    // Check if user is the uploader OR is admin/owner of the group
    const isUploader = asset.uploaded_by === user.id;

    let canDelete = isUploader;

    if (!isUploader) {
      // Check if user is admin/owner of the group
      const { data: membership } = (await supabase
        .from("group_members")
        .select("role")
        .eq("group_id", asset.group_id)
        .eq("user_id", user.id)
        .single()) as unknown as {
        data: { role: string } | null;
        error: Error | null;
      };

      canDelete = membership?.role === "owner" || membership?.role === "admin";
    }

    if (!canDelete) {
      return NextResponse.json(
        { error: "Permission denied" },
        { status: 403 }
      );
    }

    // Delete from R2 storage first
    const storageService = getStorageService();
    const keysToDelete = [asset.original_key];
    if (asset.thumbnail_key) {
      keysToDelete.push(asset.thumbnail_key);
    }

    await storageService.deleteObjects(keysToDelete);

    // Delete from database
    const { error: deleteError } = await supabase
      .from("media_assets")
      .delete()
      .eq("id", assetId);

    if (deleteError) {
      console.error("Failed to delete from database:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete media" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete media error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
