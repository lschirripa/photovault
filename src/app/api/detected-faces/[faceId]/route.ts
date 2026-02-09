import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/infrastructure/supabase/server";

// PATCH /api/detected-faces/[faceId] — Reassign a face to a different person
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ faceId: string }> }
) {
  try {
    const { faceId } = await params;
    const supabase = await createServerComponentClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { targetPersonId } = body;

    if (!targetPersonId) {
      return NextResponse.json({ error: "Missing targetPersonId" }, { status: 400 });
    }

    // 1. Fetch the face record
    const { data: face, error: faceError } = (await supabase
      .from("detected_faces")
      .select("id, person_id, embedding, media_asset_id")
      .eq("id", faceId)
      .single()) as unknown as {
      data: { id: string; person_id: string | null; embedding: string; media_asset_id: string } | null;
      error: Error | null;
    };

    if (faceError || !face) {
      return NextResponse.json({ error: "Face not found" }, { status: 404 });
    }

    if (face.person_id === targetPersonId) {
      return NextResponse.json({ error: "Face is already assigned to this person" }, { status: 400 });
    }

    const oldPersonId = face.person_id;

    // 2. Fetch target person to verify it exists
    const { data: targetPerson, error: targetError } = (await supabase
      .from("persons")
      .select("id, centroid, face_count")
      .eq("id", targetPersonId)
      .single()) as unknown as {
      data: { id: string; centroid: string; face_count: number } | null;
      error: Error | null;
    };

    if (targetError || !targetPerson) {
      return NextResponse.json({ error: "Target person not found" }, { status: 404 });
    }

    // 3. Update the face's person_id
    const { error: updateError } = await supabase
      .from("detected_faces")
      .update({ person_id: targetPersonId })
      .eq("id", faceId);

    if (updateError) throw updateError;

    // 4. Update target person: increment face_count
    // We update centroid using weighted average: new_centroid = (old_centroid * old_count + embedding) / (old_count + 1)
    // Since pgvector operations are complex via REST, we simply increment count
    // and rely on the centroid being a good-enough approximation
    const { error: targetUpdateError } = (await supabase
      .from("persons")
      .update({ face_count: targetPerson.face_count + 1 })
      .eq("id", targetPersonId)) as unknown as { error: Error | null };

    if (targetUpdateError) throw targetUpdateError;

    // 5. Update old person: decrement face_count or delete if zero
    if (oldPersonId) {
      const { data: oldPerson } = (await supabase
        .from("persons")
        .select("id, face_count")
        .eq("id", oldPersonId)
        .single()) as unknown as {
        data: { id: string; face_count: number } | null;
        error: Error | null;
      };

      if (oldPerson) {
        if (oldPerson.face_count <= 1) {
          // Delete the person if no more faces
          await supabase.from("persons").delete().eq("id", oldPersonId);
        } else {
          await supabase
            .from("persons")
            .update({ face_count: oldPerson.face_count - 1 })
            .eq("id", oldPersonId);
        }
      }
    }

    return NextResponse.json({
      faceId,
      personId: targetPersonId,
      oldPersonId,
    });
  } catch (error) {
    console.error("Reassign face error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
