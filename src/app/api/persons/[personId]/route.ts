import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/infrastructure/supabase/server";

// PATCH /api/persons/[personId] — Rename a person
export async function PATCH(
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

    const body = await request.json();
    const { name } = body;

    if (typeof name !== "string") {
      return NextResponse.json({ error: "Missing name" }, { status: 400 });
    }

    // RLS ensures user can only update persons in their groups
    const { data: updated, error: updateError } = await supabase
      .from("persons")
      .update({ name: name.trim() || null })
      .eq("id", personId)
      .select("id, name")
      .single() as unknown as {
      data: { id: string; name: string | null } | null;
      error: Error | null;
    };

    if (updateError || !updated) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update person error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/persons/[personId] — Soft-dismiss a person cluster
// The row is kept so the worker can still match future faces against the centroid
// and suppress them from the UI. The centroid acts as a "never show again" memory.
export async function DELETE(
  _request: NextRequest,
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

    // Soft dismiss: mark as dismissed rather than deleting.
    // RLS ensures the user can only update persons in their own groups.
    const { error: updateError } = await supabase
      .from("persons")
      .update({ dismissed: true })
      .eq("id", personId) as unknown as { error: Error | null };

    if (updateError) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Dismiss person error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
