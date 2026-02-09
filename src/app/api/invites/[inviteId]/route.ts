import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/infrastructure/supabase/server";
import type { Tables } from "@/types/supabase";

// DELETE /api/invites/[inviteId] - Revoke an invite
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ inviteId: string }> }
) {
  try {
    const { inviteId } = await params;
    const supabase = await createServerComponentClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get the invite to check permissions
    const { data: invite } = (await supabase
      .from("group_invites")
      .select("*")
      .eq("id", inviteId)
      .single()) as unknown as { data: Tables<"group_invites"> | null; error: Error | null };

    if (!invite) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }

    // Verify user is admin/owner of the group
    const { data: membership } = await supabase
      .from("group_members")
      .select("role")
      .eq("group_id", invite.group_id)
      .eq("user_id", user.id)
      .single();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    // Revoke the invite (soft delete by setting revoked_at)
    const { error: updateError } = await supabase
      .from("group_invites")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", inviteId);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Revoke invite error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
