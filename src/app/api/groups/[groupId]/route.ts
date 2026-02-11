import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/infrastructure/supabase/server";
import { getStorageService } from "@/infrastructure/cloudflare/r2-storage-service";
import { GROUP_DELETE_BATCH_SIZE, GROUP_DELETE_TIME_BUDGET_MS } from "@/infrastructure/config/limits";
import { cacheDelete } from "@/infrastructure/redis/cache";
import type { Tables } from "@/types/supabase";

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { groupId } = await params;
    const supabase = await createServerComponentClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify membership
    const { data: membership, error: membershipError } = await supabase
      .from("group_members")
      .select("role")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .single();

    if (membershipError || !membership) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const body = await request.json();
    const { name, description, cover_media_id } = body as {
      name?: string;
      description?: string | null;
      cover_media_id?: string | null;
    };

    // Only admin/owner can rename
    if (name !== undefined && membership.role !== "owner" && membership.role !== "admin") {
      return NextResponse.json(
        { error: "Only admins can rename groups" },
        { status: 403 }
      );
    }

    // Build update payload
    const update: Record<string, unknown> = {};
    if (name !== undefined) update.name = name;
    if (description !== undefined) update.description = description;
    if (cover_media_id !== undefined) update.cover_media_id = cover_media_id;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    // If renaming, fetch old name for activity log
    let oldName: string | null = null;
    if (name !== undefined) {
      const { data: currentGroup } = (await supabase
        .from("groups")
        .select("name")
        .eq("id", groupId)
        .single()) as unknown as { data: { name: string } | null; error: Error | null };
      oldName = currentGroup?.name ?? null;
    }

    // Apply the update
    const { data: updated, error: updateError } = (await supabase
      .from("groups")
      .update(update)
      .eq("id", groupId)
      .select()
      .single()) as unknown as { data: Tables<"groups"> | null; error: Error | null };

    if (updateError) {
      console.error("Failed to update group:", updateError);
      return NextResponse.json({ error: "Failed to update group" }, { status: 500 });
    }

    // Log activities
    if (name !== undefined && oldName !== null && oldName !== name) {
      await supabase.from("group_activities").insert({
        group_id: groupId,
        user_id: user.id,
        activity_type: "group_renamed",
        metadata: { old_name: oldName, new_name: name },
      });
    }

    if (cover_media_id !== undefined) {
      await supabase.from("group_activities").insert({
        group_id: groupId,
        user_id: user.id,
        activity_type: "cover_changed",
        metadata: { media_asset_id: cover_media_id },
      });
    }

    // Invalidate cached group metadata
    await cacheDelete(`group:${groupId}`);

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update group error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
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

    // Paginated R2 cleanup with time budget — delete as many objects as possible
    // within the budget, then cascade-delete the group from DB. Any remaining
    // R2 orphans are cleaned up by the hourly cron.
    const storageService = getStorageService();
    const deadline = Date.now() + GROUP_DELETE_TIME_BUDGET_MS;
    let offset = 0;
    let deletedKeys = 0;

    try {
      while (Date.now() < deadline) {
        const { data: assets, error: assetsError } = (await supabase
          .from("media_assets")
          .select("original_key, thumbnail_key")
          .eq("group_id", groupId)
          .range(offset, offset + GROUP_DELETE_BATCH_SIZE - 1)) as unknown as {
          data: Pick<Tables<"media_assets">, "original_key" | "thumbnail_key">[] | null;
          error: Error | null;
        };

        if (assetsError) {
          console.error("Failed to fetch group assets page:", assetsError);
          break;
        }

        if (!assets || assets.length === 0) break;

        const keysToDelete: string[] = [];
        for (const asset of assets) {
          keysToDelete.push(asset.original_key);
          if (asset.thumbnail_key) {
            keysToDelete.push(asset.thumbnail_key);
          }
        }

        if (keysToDelete.length > 0) {
          await storageService.deleteObjects(keysToDelete);
          deletedKeys += keysToDelete.length;
        }

        // If we got fewer than a full page, we're done
        if (assets.length < GROUP_DELETE_BATCH_SIZE) break;
        offset += GROUP_DELETE_BATCH_SIZE;
      }
    } catch (storageError) {
      console.error("Failed to delete R2 objects:", storageError);
      // Continue with database deletion — cron will clean up orphans
    }

    if (deletedKeys > 0) {
      console.log(`Group ${groupId}: deleted ${deletedKeys} R2 keys before DB cascade`);
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

    // Invalidate cached group metadata
    await cacheDelete(`group:${groupId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete group error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
