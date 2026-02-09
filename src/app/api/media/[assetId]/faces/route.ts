import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/infrastructure/supabase/server";
import { getStorageService } from "@/infrastructure/cloudflare/r2-storage-service";

// GET /api/media/[assetId]/faces — List detected faces for a media asset
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  try {
    const { assetId } = await params;
    const supabase = await createServerComponentClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify asset exists and user has access (RLS on detected_faces handles it via media_assets join)
    const { data: asset, error: assetError } = (await supabase
      .from("media_assets")
      .select("id, group_id")
      .eq("id", assetId)
      .single()) as unknown as {
      data: { id: string; group_id: string } | null;
      error: Error | null;
    };

    if (assetError || !asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    // Fetch detected faces for this asset
    const { data: faces, error: facesError } = (await supabase
      .from("detected_faces")
      .select("id, person_id, confidence, bbox_x, bbox_y, bbox_w, bbox_h, face_crop_key")
      .eq("media_asset_id", assetId)
      .order("confidence", { ascending: false })) as unknown as {
      data: Array<{
        id: string;
        person_id: string | null;
        confidence: number;
        bbox_x: number;
        bbox_y: number;
        bbox_w: number;
        bbox_h: number;
        face_crop_key: string | null;
      }> | null;
      error: Error | null;
    };

    if (facesError) throw facesError;

    if (!faces || faces.length === 0) {
      return NextResponse.json({ faces: [] });
    }

    // Fetch person names for all faces that have a person_id
    const personIds = [...new Set(faces.map((f) => f.person_id).filter((id): id is string => id !== null))];
    const personNameMap = new Map<string, string | null>();

    if (personIds.length > 0) {
      const { data: persons } = (await supabase
        .from("persons")
        .select("id, name")
        .in("id", personIds)) as unknown as {
        data: Array<{ id: string; name: string | null }> | null;
      };

      for (const person of persons ?? []) {
        personNameMap.set(person.id, person.name);
      }
    }

    // Generate signed URLs for face crops
    const storageService = getStorageService();
    const response = await Promise.all(
      faces.map(async (face) => {
        let faceCropUrl: string | null = null;
        if (face.face_crop_key) {
          faceCropUrl = await storageService.generateDownloadUrl(face.face_crop_key);
        }

        return {
          id: face.id,
          personId: face.person_id,
          personName: face.person_id ? (personNameMap.get(face.person_id) ?? null) : null,
          faceCropUrl,
          confidence: face.confidence,
          bbox: {
            x: face.bbox_x,
            y: face.bbox_y,
            w: face.bbox_w,
            h: face.bbox_h,
          },
        };
      })
    );

    return NextResponse.json({ faces: response });
  } catch (error) {
    console.error("Get faces error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
