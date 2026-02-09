import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/infrastructure/supabase/server";
import type { Tables } from "@/types/supabase";
import type { CreateInviteRequestDTO, InviteResponseDTO } from "@/application/dto/invite-dto";

// Generate a secure random token
function generateToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  const randomValues = new Uint8Array(12);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < 12; i++) {
    token += chars[randomValues[i] % chars.length];
  }
  return token;
}

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

// POST /api/invites - Create a new invite
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

    const body: CreateInviteRequestDTO = await request.json();
    const { groupId, expiresInHours, maxUses } = body;

    if (!groupId) {
      return NextResponse.json({ error: "Missing groupId" }, { status: 400 });
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

    // Calculate expiration
    const expiresAt = expiresInHours
      ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString()
      : null;

    // Generate unique token
    const token = generateToken();

    // Create the invite
    const { data: invite, error: createError } = (await supabase
      .from("group_invites")
      .insert({
        group_id: groupId,
        token,
        created_by: user.id,
        expires_at: expiresAt,
        max_uses: maxUses || null,
      })
      .select()
      .single()) as unknown as { data: Tables<"group_invites"> | null; error: Error | null };

    if (createError || !invite) {
      throw createError || new Error("Failed to create invite");
    }

    const baseUrl = request.nextUrl.origin;
    return NextResponse.json(mapInviteToDTO(invite, baseUrl), { status: 201 });
  } catch (error) {
    console.error("Create invite error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
