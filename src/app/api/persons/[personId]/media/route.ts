import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/infrastructure/supabase/server";

// GET /api/persons/[personId]/media?cursor=...&limit=20
// Returns paginated media assets that contain this person's face.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ personId: string }> }
) {
  try {
    const supabase = await createServerComponentClient();
    const { personId } = await params;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cursor = request.nextUrl.searchParams.get("cursor");
    const limit = Math.min(
      parseInt(request.nextUrl.searchParams.get("limit") || "20", 10),
      100
    );

    // Verify the person exists and user has access (RLS handles this)
    const { data: person, error: personError } = await supabase
      .from("persons")
      .select("id, group_id")
      .eq("id", personId)
      .single() as unknown as {
      data: { id: string; group_id: string } | null;
      error: Error | null;
    };

    if (personError || !person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    // Get media asset IDs via detected_faces join, with cursor pagination
    let query = supabase
      .from("detected_faces")
      .select("media_asset_id, created_at")
      .eq("person_id", personId)
      .order("created_at", { ascending: false })
      .limit(limit + 1);

    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    const { data: faceRows, error: facesError } = await query as unknown as {
      data: Array<{ media_asset_id: string; created_at: string }> | null;
      error: Error | null;
    };

    if (facesError) {
      throw facesError;
    }

    const rows = faceRows ?? [];
    const hasMore = rows.length > limit;
    const pageRows = rows.slice(0, limit);

    // Deduplicate media IDs (a photo could have multiple faces of the same person — unlikely but possible)
    const uniqueAssetIds = [...new Set(pageRows.map((r) => r.media_asset_id))];

    if (uniqueAssetIds.length === 0) {
      return NextResponse.json({
        assets: [],
        hasMore: false,
        nextCursor: null,
      });
    }

    // Fetch actual media assets
    const { data: assets, error: assetsError } = await supabase
      .from("media_assets")
      .select("*")
      .in("id", uniqueAssetIds)
      .eq("status", "ready") as unknown as {
      data: Array<Record<string, unknown>> | null;
      error: Error | null;
    };

    if (assetsError) {
      throw assetsError;
    }

    // Maintain the order from detected_faces query
    const assetMap = new Map((assets ?? []).map((a) => [a.id as string, a]));
    const orderedAssets = uniqueAssetIds
      .map((id) => assetMap.get(id))
      .filter((a): a is Record<string, unknown> => a !== undefined)
      .map((a) => ({
        id: a.id,
        groupId: a.group_id,
        filename: a.filename,
        mediaType: a.media_type,
        mimeType: a.mime_type,
        sizeBytes: a.size_bytes,
        width: a.width,
        height: a.height,
        status: a.status,
        createdAt: a.created_at,
      }));

    const nextCursor = hasMore ? pageRows[pageRows.length - 1].created_at : null;

    return NextResponse.json({
      assets: orderedAssets,
      hasMore,
      nextCursor,
    });
  } catch (error) {
    console.error("Person media error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
