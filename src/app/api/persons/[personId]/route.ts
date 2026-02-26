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
    const { name, dismissed } = body;

    if (name === undefined && dismissed === undefined) {
      return NextResponse.json({ error: "Must provide name or dismissed" }, { status: 400 });
    }
    if (name !== undefined && typeof name !== "string") {
      return NextResponse.json({ error: "name must be a string" }, { status: 400 });
    }
    if (dismissed !== undefined && typeof dismissed !== "boolean") {
      return NextResponse.json({ error: "dismissed must be a boolean" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (typeof name === "string") updates.name = name.trim() || null;
    if (typeof dismissed === "boolean") updates.dismissed = dismissed;

    // RLS ensures user can only update persons in their groups
    const { data: updated, error: updateError } = await (supabase
      .from("persons")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(updates as any)
      .eq("id", personId)
      .select("id, name, dismissed")
      .single()) as unknown as {
      data: { id: string; name: string | null; dismissed: boolean } | null;
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
    const { error: updateError } = await (supabase
      .from("persons")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ dismissed: true } as any)
      .eq("id", personId)) as unknown as { error: Error | null };

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
