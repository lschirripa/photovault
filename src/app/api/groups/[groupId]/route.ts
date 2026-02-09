import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/infrastructure/supabase/server";
import { getStorageService } from "@/infrastructure/cloudflare/r2-storage-service";
import type { Tables } from "@/types/supabase";

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { groupId } = await params;
    const supabase = await createServerComponentClient();

    // Verify authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user is the group owner
    const { data: membership, error: membershipError } = await supabase
      .from("group_members")
      .select("role")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .single();

    if (membershipError || !membership) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    if (membership.role !== "owner") {
      return NextResponse.json(
        { error: "Only group owners can delete groups" },
        { status: 403 }
      );
    }

    // Get all media assets for this group
    const { data: assets, error: assetsError } = (await supabase
      .from("media_assets")
      .select("original_key, thumbnail_key")
      .eq("group_id", groupId)) as unknown as {
      data: Pick<Tables<"media_assets">, "original_key" | "thumbnail_key">[] | null;
      error: Error | null;
    };

    if (assetsError) {
      console.error("Failed to fetch group assets:", assetsError);
      return NextResponse.json(
        { error: "Failed to fetch group assets" },
        { status: 500 }
      );
    }

    // Collect all R2 keys to delete
    const keysToDelete: string[] = [];
    if (assets) {
      for (const asset of assets) {
        keysToDelete.push(asset.original_key);
        if (asset.thumbnail_key) {
          keysToDelete.push(asset.thumbnail_key);
        }
      }
    }

    // Delete files from R2 storage
    if (keysToDelete.length > 0) {
      const storageService = getStorageService();
      try {
        await storageService.deleteObjects(keysToDelete);
      } catch (storageError) {
        console.error("Failed to delete R2 objects:", storageError);
        // Continue with database deletion even if R2 cleanup fails
        // The orphaned files can be cleaned up later
      }
    }

    // Delete the group from the database
    // This will cascade delete: group_members, media_assets, albums, album_media, group_invites
    const { error: deleteError } = await supabase
      .from("groups")
      .delete()
      .eq("id", groupId);

    if (deleteError) {
      console.error("Failed to delete group:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete group" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete group error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
