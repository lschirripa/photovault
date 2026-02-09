import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/infrastructure/supabase/server";
import type { Tables } from "@/types/supabase";
import type { CreateAlbumRequestDTO, AlbumResponseDTO } from "@/application/dto/album-dto";

// GET /api/albums - List albums for a group
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerComponentClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const groupId = request.nextUrl.searchParams.get("groupId");

    if (!groupId) {
      return NextResponse.json({ error: "Missing groupId" }, { status: 400 });
    }

    // Verify user is a member of the group
    const { data: membership } = await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Not a member of this group" }, { status: 403 });
    }

    // Get albums with media count
    const { data: albums, error: albumsError } = (await supabase
      .from("albums")
      .select("*")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false })) as unknown as {
      data: Tables<"albums">[] | null;
      error: Error | null;
    };

    if (albumsError) {
      throw albumsError;
    }

    // Get media counts for all albums
    const albumIds = (albums ?? []).map((a) => a.id);
    const { data: mediaCounts } = await supabase
      .from("album_media")
      .select("album_id")
      .in("album_id", albumIds);

    const countMap = new Map<string, number>();
    for (const item of mediaCounts ?? []) {
      const count = countMap.get(item.album_id) || 0;
      countMap.set(item.album_id, count + 1);
    }

    const response: AlbumResponseDTO[] = (albums ?? []).map((album) => ({
      id: album.id,
      groupId: album.group_id,
      name: album.name,
      description: album.description,
      coverAssetId: album.cover_asset_id,
      coverUrl: null, // Will be fetched by client if needed
      createdBy: album.created_by,
      createdAt: album.created_at,
      updatedAt: album.updated_at,
      mediaCount: countMap.get(album.id) || 0,
    }));

    return NextResponse.json({ albums: response, total: response.length });
  } catch (error) {
    console.error("List albums error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/albums - Create a new album
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

    const body: CreateAlbumRequestDTO = await request.json();
    const { groupId, name, description, coverAssetId } = body;

    if (!groupId || !name?.trim()) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Verify user is a member of the group
    const { data: membership } = await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Not a member of this group" }, { status: 403 });
    }

    // Create the album
    const { data: album, error: createError } = (await supabase
      .from("albums")
      .insert({
        group_id: groupId,
        name: name.trim(),
        description: description?.trim() || null,
        cover_asset_id: coverAssetId || null,
        created_by: user.id,
      })
      .select()
      .single()) as unknown as { data: Tables<"albums"> | null; error: Error | null };

    if (createError || !album) {
      throw createError || new Error("Failed to create album");
    }

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
      mediaCount: 0,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error("Create album error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
