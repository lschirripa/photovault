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

    // Step 1: Reassign all detected faces from source to target
    const { error: reassignError } = (await supabase
      .from("detected_faces")
      .update({ person_id: targetId })
      .eq("person_id", sourceId)) as unknown as { error: Error | null };

    if (reassignError) {
      console.error("Merge: face reassignment failed:", reassignError);
      return NextResponse.json(
        { error: "Failed to reassign faces" },
        { status: 500 }
      );
    }

    // Step 2: Recalculate target centroid as weighted average
    const sourceCentroid = parsePgVector(source.centroid);
    const targetCentroid = parsePgVector(target.centroid);

    if (!sourceCentroid || !targetCentroid) {
      // Rollback: reassign faces back to source
      await supabase
        .from("detected_faces")
        .update({ person_id: sourceId })
        .eq("person_id", targetId);

      return NextResponse.json(
        { error: "Invalid centroid data" },
        { status: 500 }
      );
    }

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

    // Step 3: Update target with merged centroid and combined face count
    const { error: updateError } = (await supabase
      .from("persons")
      .update({
        centroid: `[${normalizedCentroid.join(",")}]`,
        face_count: totalCount,
      })
      .eq("id", targetId)) as unknown as { error: Error | null };

    if (updateError) {
      // Rollback: reassign faces back to source
      await supabase
        .from("detected_faces")
        .update({ person_id: sourceId })
        .eq("person_id", targetId);

      console.error("Merge: centroid update failed:", updateError);
      return NextResponse.json(
        { error: "Failed to update merged person" },
        { status: 500 }
      );
    }

    // Step 4: Delete source person
    const { error: deleteError } = await supabase
      .from("persons")
      .delete()
      .eq("id", sourceId);

    if (deleteError) {
      // Non-fatal: source person is now empty (0 faces) and will be cleaned
      // up by the face_count trigger or next cleanup cycle.
      console.error("Merge: source deletion failed (non-fatal):", deleteError);
    }

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

function parsePgVector(vecStr: string): number[] | null {
  try {
    const cleaned = vecStr.replace(/^\[|\]$/g, "");
    const nums = cleaned.split(",").map(Number);
    if (nums.some(isNaN) || nums.length === 0) return null;
    return nums;
  } catch {
    return null;
  }
}
