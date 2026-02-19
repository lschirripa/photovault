import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/infrastructure/supabase/server";
import { getStorageService } from "@/infrastructure/cloudflare/r2-storage-service";

// GET /api/persons?groupId=X — List all person clusters for a group
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

    // Verify group membership (RLS handles it, but explicit check for 403)
    const { data: membership } = await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Not a member of this group" }, { status: 403 });
    }

    const showDismissed = request.nextUrl.searchParams.get("dismissed") === "true";

    // Fetch persons sorted by face count (most photos first).
    // Exclude dismissed clusters and singletons (face_count < 2 = background noise).
    let query = supabase
      .from("persons")
      .select("id, name, face_count, representative_face_id, created_at")
      .eq("group_id", groupId)
      .order("face_count", { ascending: false });

    if (showDismissed) {
      query = query.eq("dismissed", true);
    } else {
      query = query.eq("dismissed", false).gte("face_count", 2);
    }

    const { data: persons, error: personsError } = await query as unknown as {
      data: Array<{
        id: string;
        name: string | null;
        face_count: number;
        representative_face_id: string | null;
        created_at: string;
      }> | null;
      error: Error | null;
    };

    if (personsError) {
      throw personsError;
    }

    // Get face crop keys for representative faces
    const repFaceIds = (persons ?? [])
      .map((p) => p.representative_face_id)
      .filter((id): id is string => id !== null);

    const cropKeyMap = new Map<string, string>();
    if (repFaceIds.length > 0) {
      const { data: faces } = await supabase
        .from("detected_faces")
        .select("id, face_crop_key")
        .in("id", repFaceIds) as unknown as {
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
    console.error("List persons error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
