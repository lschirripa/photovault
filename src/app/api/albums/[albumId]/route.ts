import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/infrastructure/supabase/server";
import type { Tables } from "@/types/supabase";
import type { UpdateAlbumRequestDTO, AlbumResponseDTO } from "@/application/dto/album-dto";

// GET /api/albums/[albumId] - Get album details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ albumId: string }> }
) {
  try {
    const { albumId } = await params;
    const supabase = await createServerComponentClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get the album
    const { data: album, error: albumError } = (await supabase
      .from("albums")
      .select("*")
      .eq("id", albumId)
      .single()) as unknown as { data: Tables<"albums"> | null; error: Error | null };

    if (albumError || !album) {
      return NextResponse.json({ error: "Album not found" }, { status: 404 });
    }

    // Verify user is a member of the group
    const { data: membership } = await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", album.group_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Get media count
    const { count } = await supabase
      .from("album_media")
      .select("*", { count: "exact", head: true })
      .eq("album_id", albumId);

    const response: AlbumResponseDTO = {
      id: album.id,
      groupId: album.group_id,
      name: album.name,
      description: album.description,
      coverAssetId: album.cover_asset_id,
      coverUrl: null,
      createdBy: album.created_by,
      createdAt: album.created_at,
      updatedAt: album.updated_at,
      mediaCount: count || 0,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Get album error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/albums/[albumId] - Update album
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ albumId: string }> }
) {
  try {
    const { albumId } = await params;
    const supabase = await createServerComponentClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: UpdateAlbumRequestDTO = await request.json();

    // Get the album to check permissions
    const { data: album } = (await supabase
      .from("albums")
      .select("*")
      .eq("id", albumId)
      .single()) as unknown as { data: Tables<"albums"> | null; error: Error | null };

    if (!album) {
      return NextResponse.json({ error: "Album not found" }, { status: 404 });
    }

    // Check if user is creator or admin
    const isCreator = album.created_by === user.id;
    let canUpdate = isCreator;

    if (!isCreator) {
      const { data: membership } = await supabase
        .from("group_members")
        .select("role")
        .eq("group_id", album.group_id)
        .eq("user_id", user.id)
        .single();

      canUpdate = membership?.role === "owner" || membership?.role === "admin";
    }

    if (!canUpdate) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    // Build update object
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.description !== undefined) updates.description = body.description;
    if (body.coverAssetId !== undefined) updates.cover_asset_id = body.coverAssetId;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { data: updated, error: updateError } = (await supabase
      .from("albums")
      .update(updates)
      .eq("id", albumId)
      .select()
      .single()) as unknown as { data: Tables<"albums"> | null; error: Error | null };

    if (updateError || !updated) {
      throw updateError || new Error("Failed to update album");
    }

    const response: AlbumResponseDTO = {
      id: updated.id,
      groupId: updated.group_id,
      name: updated.name,
      description: updated.description,
      coverAssetId: updated.cover_asset_id,
      coverUrl: null,
      createdBy: updated.created_by,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Update album error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/albums/[albumId] - Delete album
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ albumId: string }> }
) {
  try {
    const { albumId } = await params;
    const supabase = await createServerComponentClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get the album to check permissions
    const { data: album } = (await supabase
      .from("albums")
      .select("*")
      .eq("id", albumId)
      .single()) as unknown as { data: Tables<"albums"> | null; error: Error | null };

    if (!album) {
      return NextResponse.json({ error: "Album not found" }, { status: 404 });
    }

    // Check if user is creator or admin
    const isCreator = album.created_by === user.id;
    let canDelete = isCreator;

    if (!isCreator) {
      const { data: membership } = await supabase
        .from("group_members")
        .select("role")
        .eq("group_id", album.group_id)
        .eq("user_id", user.id)
        .single();

      canDelete = membership?.role === "owner" || membership?.role === "admin";
    }

    if (!canDelete) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    // Delete the album (album_media will cascade)
    const { error: deleteError } = await supabase
      .from("albums")
      .delete()
      .eq("id", albumId);

    if (deleteError) {
      throw deleteError;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete album error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
