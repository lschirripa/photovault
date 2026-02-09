import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/infrastructure/supabase/server";
import type { AddMediaToAlbumRequestDTO, RemoveMediaFromAlbumRequestDTO } from "@/application/dto/album-dto";

// GET /api/albums/[albumId]/media - Get media in album
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

    // Get the album to verify access
    const { data: album } = (await supabase
      .from("albums")
      .select("group_id")
      .eq("id", albumId)
      .single()) as unknown as { data: { group_id: string } | null; error: Error | null };

    if (!album) {
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

    // Get album media with media asset details
    const { data: albumMedia, error: mediaError } = await supabase
      .from("album_media")
      .select(`
        id,
        album_id,
        media_id,
        added_at,
        added_by,
        media_assets (*)
      `)
      .eq("album_id", albumId)
      .order("added_at", { ascending: false });

    if (mediaError) {
      throw mediaError;
    }

    // Transform to include just media IDs for now
    const mediaIds = (albumMedia ?? []).map((am) => am.media_id);

    return NextResponse.json({ mediaIds, total: mediaIds.length });
  } catch (error) {
    console.error("Get album media error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/albums/[albumId]/media - Add media to album
export async function POST(
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

    const body: AddMediaToAlbumRequestDTO = await request.json();
    const { mediaIds } = body;

    if (!mediaIds || !Array.isArray(mediaIds) || mediaIds.length === 0) {
      return NextResponse.json({ error: "Missing mediaIds" }, { status: 400 });
    }

    // Get the album to verify access
    const { data: album } = (await supabase
      .from("albums")
      .select("group_id")
      .eq("id", albumId)
      .single()) as unknown as { data: { group_id: string } | null; error: Error | null };

    if (!album) {
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

    // Verify all media belongs to the same group
    const { data: mediaAssets } = (await supabase
      .from("media_assets")
      .select("id")
      .eq("group_id", album.group_id)
      .in("id", mediaIds)) as unknown as { data: { id: string }[] | null; error: Error | null };

    const validMediaIds = (mediaAssets ?? []).map((m) => m.id);

    if (validMediaIds.length === 0) {
      return NextResponse.json({ error: "No valid media found" }, { status: 400 });
    }

    // Insert album_media records (ignore duplicates)
    const insertData = validMediaIds.map((mediaId) => ({
      album_id: albumId,
      media_id: mediaId,
      added_by: user.id,
    }));

    const { error: insertError } = await supabase
      .from("album_media")
      .upsert(insertData, { onConflict: "album_id,media_id", ignoreDuplicates: true });

    if (insertError) {
      throw insertError;
    }

    return NextResponse.json({ success: true, added: validMediaIds.length });
  } catch (error) {
    console.error("Add media to album error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/albums/[albumId]/media - Remove media from album
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

    const body: RemoveMediaFromAlbumRequestDTO = await request.json();
    const { mediaIds } = body;

    if (!mediaIds || !Array.isArray(mediaIds) || mediaIds.length === 0) {
      return NextResponse.json({ error: "Missing mediaIds" }, { status: 400 });
    }

    // Get the album to verify access
    const { data: album } = (await supabase
      .from("albums")
      .select("group_id, created_by")
      .eq("id", albumId)
      .single()) as unknown as { data: { group_id: string; created_by: string } | null; error: Error | null };

    if (!album) {
      return NextResponse.json({ error: "Album not found" }, { status: 404 });
    }

    // Check if user can remove media (is creator, admin, or added the media)
    const isCreator = album.created_by === user.id;
    let isAdmin = false;

    if (!isCreator) {
      const { data: membership } = await supabase
        .from("group_members")
        .select("role")
        .eq("group_id", album.group_id)
        .eq("user_id", user.id)
        .single();

      isAdmin = membership?.role === "owner" || membership?.role === "admin";
    }

    // If user is creator or admin, they can remove any media
    // Otherwise, they can only remove media they added
    if (isCreator || isAdmin) {
      const { error: deleteError } = await supabase
        .from("album_media")
        .delete()
        .eq("album_id", albumId)
        .in("media_id", mediaIds);

      if (deleteError) {
        throw deleteError;
      }
    } else {
      // Only delete media the user added
      const { error: deleteError } = await supabase
        .from("album_media")
        .delete()
        .eq("album_id", albumId)
        .eq("added_by", user.id)
        .in("media_id", mediaIds);

      if (deleteError) {
        throw deleteError;
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Remove media from album error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
