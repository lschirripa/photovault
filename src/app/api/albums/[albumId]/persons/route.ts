import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/infrastructure/supabase/server";
import { getStorageService } from "@/infrastructure/cloudflare/r2-storage-service";
import type { Tables } from "@/types/supabase";

// GET /api/albums/[albumId]/persons — List persons appearing in this album
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

    // Get the album to verify group membership
    const { data: album, error: albumError } = (await supabase
      .from("albums")
      .select("id, group_id")
      .eq("id", albumId)
      .single()) as unknown as { data: { id: string; group_id: string } | null; error: Error | null };

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

    // Find distinct person IDs that appear in this album's media
    const { data: personRows, error: personError } = (await supabase
      .from("album_media")
      .select("media_id")
      .eq("album_id", albumId)) as unknown as {
      data: { media_id: string }[] | null;
      error: Error | null;
    };

    if (personError) throw personError;

    if (!personRows || personRows.length === 0) {
      return NextResponse.json({ persons: [] });
    }

    const mediaIds = personRows.map((r) => r.media_id);

    // Get distinct person_ids from detected_faces for these media
    const { data: faceRows, error: faceError } = (await supabase
      .from("detected_faces")
      .select("person_id")
      .in("media_asset_id", mediaIds)
      .not("person_id", "is", null)) as unknown as {
      data: { person_id: string }[] | null;
      error: Error | null;
    };

    if (faceError) throw faceError;

    const personIds = [...new Set((faceRows ?? []).map((f) => f.person_id))];

    if (personIds.length === 0) {
      return NextResponse.json({ persons: [] });
    }

    // Fetch person details (non-dismissed, face_count >= 2)
    const { data: persons, error: personsError } = (await supabase
      .from("persons")
      .select("id, name, face_count, representative_face_id, created_at")
      .in("id", personIds)
      .eq("dismissed", false)
      .gte("face_count", 2)
      .order("face_count", { ascending: false })) as unknown as {
      data: Array<{
        id: string;
        name: string | null;
        face_count: number;
        representative_face_id: string | null;
        created_at: string;
      }> | null;
      error: Error | null;
    };

    if (personsError) throw personsError;

    // Get face crop keys for representative faces
    const repFaceIds = (persons ?? [])
      .map((p) => p.representative_face_id)
      .filter((id): id is string => id !== null);

    const cropKeyMap = new Map<string, string>();
    if (repFaceIds.length > 0) {
      const { data: faces } = (await supabase
        .from("detected_faces")
        .select("id, face_crop_key")
        .in("id", repFaceIds)) as unknown as {
        data: Array<{ id: string; face_crop_key: string | null }> | null;
      };

      for (const face of faces ?? []) {
        if (face.face_crop_key) {
          cropKeyMap.set(face.id, face.face_crop_key);
        }
      }
    }

    // Generate signed URLs for face crops
    const storageService = getStorageService();
    const response = await Promise.all(
      (persons ?? []).map(async (person) => {
        let faceCropUrl: string | null = null;
        if (person.representative_face_id) {
          const cropKey = cropKeyMap.get(person.representative_face_id);
          if (cropKey) {
            faceCropUrl = await storageService.generateDownloadUrl(cropKey);
          }
        }

        return {
          id: person.id,
          name: person.name,
          faceCount: person.face_count,
          faceCropUrl,
          createdAt: person.created_at,
        };
      })
    );

    return NextResponse.json({ persons: response });
  } catch (error) {
    console.error("List album persons error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
