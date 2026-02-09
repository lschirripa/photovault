import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/infrastructure/supabase/server";
import type { Tables } from "@/types/supabase";
import type { InviteResponseDTO, InviteListResponseDTO } from "@/application/dto/invite-dto";

function mapInviteToDTO(invite: Tables<"group_invites">, baseUrl: string): InviteResponseDTO {
  const now = new Date();
  const expiresAt = invite.expires_at ? new Date(invite.expires_at) : null;
  const isExpired = expiresAt ? expiresAt < now : false;
  const isExhausted = invite.max_uses !== null && invite.use_count >= invite.max_uses;
  const isRevoked = invite.revoked_at !== null;
  const isValid = !isExpired && !isExhausted && !isRevoked;

  return {
    id: invite.id,
    groupId: invite.group_id,
    token: invite.token,
    inviteUrl: `${baseUrl}/join/${invite.token}`,
    createdBy: invite.created_by,
    expiresAt: invite.expires_at,
    maxUses: invite.max_uses,
    useCount: invite.use_count,
    revokedAt: invite.revoked_at,
    createdAt: invite.created_at,
    isExpired,
    isExhausted,
    isRevoked,
    isValid,
  };
}

// GET /api/groups/[groupId]/invites - List invites for a group
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId } = await params;
    const supabase = await createServerComponentClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user is admin/owner of the group
    const { data: membership } = await supabase
      .from("group_members")
      .select("role")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .single();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    // Get all invites for the group (including revoked for history)
    const { data: invites, error: invitesError } = (await supabase
      .from("group_invites")
      .select("*")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false })) as unknown as {
      data: Tables<"group_invites">[] | null;
      error: Error | null;
    };

    if (invitesError) {
      throw invitesError;
    }

    const baseUrl = request.nextUrl.origin;
    const response: InviteListResponseDTO = {
      invites: (invites ?? []).map((i) => mapInviteToDTO(i, baseUrl)),
      total: invites?.length ?? 0,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("List invites error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
