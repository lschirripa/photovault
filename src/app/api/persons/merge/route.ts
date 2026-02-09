import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/infrastructure/supabase/server";

// POST /api/persons/merge — Merge two person clusters
// Body: { sourceId: string, targetId: string }
// Moves all faces from source to target, recalculates centroid, deletes source.
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

    const { sourceId, targetId } = await request.json();

    if (!sourceId || !targetId) {
      return NextResponse.json(
        { error: "Missing sourceId or targetId" },
        { status: 400 }
      );
    }

    if (sourceId === targetId) {
      return NextResponse.json(
        { error: "Cannot merge a person with itself" },
        { status: 400 }
      );
    }

    // Fetch both persons (RLS ensures group membership)
    const { data: source } = await supabase
      .from("persons")
      .select("id, group_id, centroid, face_count")
      .eq("id", sourceId)
      .single() as unknown as {
      data: { id: string; group_id: string; centroid: string; face_count: number } | null;
    };

    const { data: target } = await supabase
      .from("persons")
      .select("id, group_id, centroid, face_count")
      .eq("id", targetId)
      .single() as unknown as {
      data: { id: string; group_id: string; centroid: string; face_count: number } | null;
    };

    if (!source || !target) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    if (source.group_id !== target.group_id) {
      return NextResponse.json(
        { error: "Persons must be in the same group" },
        { status: 400 }
      );
    }

    // Reassign all detected faces from source to target
    await supabase
      .from("detected_faces")
      .update({ person_id: targetId })
      .eq("person_id", sourceId);

    // Recalculate target centroid as weighted average
    const sourceCentroid = parsePgVector(source.centroid);
    const targetCentroid = parsePgVector(target.centroid);
    const sn = source.face_count;
    const tn = target.face_count;
    const totalCount = sn + tn;

    const mergedCentroid = targetCentroid.map(
      (tVal, i) => (tVal * tn + sourceCentroid[i] * sn) / totalCount
    );

    // Normalize
    const norm = Math.sqrt(mergedCentroid.reduce((sum, x) => sum + x * x, 0));
    const normalizedCentroid = norm > 0
      ? mergedCentroid.map((x) => x / norm)
      : mergedCentroid;

    // Update target with merged centroid and combined face count
    await supabase
      .from("persons")
      .update({
        centroid: `[${normalizedCentroid.join(",")}]`,
        face_count: totalCount,
      })
      .eq("id", targetId);

    // Delete source person
    await supabase.from("persons").delete().eq("id", sourceId);

    return NextResponse.json({
      success: true,
      mergedPersonId: targetId,
      totalFaceCount: totalCount,
    });
  } catch (error) {
    console.error("Merge persons error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

function parsePgVector(vecStr: string): number[] {
  const cleaned = vecStr.replace(/^\[|\]$/g, "");
  return cleaned.split(",").map(Number);
}
