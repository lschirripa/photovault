import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/infrastructure/supabase/server";

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createServerComponentClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { groupId } = (await request.json()) as { groupId: string };

    if (!groupId) {
      return NextResponse.json({ error: "groupId is required" }, { status: 400 });
    }

    // Verify membership
    const { data: membership, error: membershipError } = await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .single();

    if (membershipError || !membership) {
      return NextResponse.json({ error: "Not a member of this group" }, { status: 403 });
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ pinned_group_id: groupId })
      .eq("id", user.id);

    if (updateError) {
      console.error("Failed to pin group:", updateError);
      return NextResponse.json({ error: "Failed to pin group" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Pin group error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const supabase = await createServerComponentClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ pinned_group_id: null })
      .eq("id", user.id);

    if (updateError) {
      console.error("Failed to unpin group:", updateError);
      return NextResponse.json({ error: "Failed to unpin group" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unpin group error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
