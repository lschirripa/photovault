import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient, createServiceClient } from "@/infrastructure/supabase/server";
import type { Tables } from "@/types/supabase";
import type { ValidateInviteResponseDTO, JoinGroupRequestDTO, JoinGroupResponseDTO } from "@/application/dto/invite-dto";

// GET /api/join?token=xxx - Validate invite token
export async function GET(request: NextRequest) {
  try {
    // Use service client to bypass RLS - invite validation must work for unauthenticated users
    const supabase = createServiceClient();
    const token = request.nextUrl.searchParams.get("token");

    if (!token) {
      return NextResponse.json({ valid: false, error: "Missing token" }, { status: 400 });
    }

    // Get the invite
    const { data: invite, error: inviteError } = (await supabase
      .from("group_invites")
      .select("*, groups(id, name)")
      .eq("token", token)
      .single()) as unknown as {
      data: (Tables<"group_invites"> & { groups: { id: string; name: string } }) | null;
      error: Error | null;
    };

    if (inviteError || !invite) {
      const response: ValidateInviteResponseDTO = {
        valid: false,
        error: "Invalid invite link",
      };
      return NextResponse.json(response);
    }

    // Check if invite is valid
    const now = new Date();
    const expiresAt = invite.expires_at ? new Date(invite.expires_at) : null;
    const isExpired = expiresAt ? expiresAt < now : false;
    const isExhausted = invite.max_uses !== null && invite.use_count >= invite.max_uses;
    const isRevoked = invite.revoked_at !== null;

    if (isRevoked) {
      return NextResponse.json({
        valid: false,
        error: "This invite has been revoked",
      } as ValidateInviteResponseDTO);
    }

    if (isExpired) {
      return NextResponse.json({
        valid: false,
        error: "This invite has expired",
      } as ValidateInviteResponseDTO);
    }

    if (isExhausted) {
      return NextResponse.json({
        valid: false,
        error: "This invite has reached its maximum uses",
      } as ValidateInviteResponseDTO);
    }

    const response: ValidateInviteResponseDTO = {
      valid: true,
      groupId: invite.group_id,
      groupName: invite.groups.name,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Validate invite error:", error);
    return NextResponse.json(
      { valid: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/join - Join a group via invite token
export async function POST(request: NextRequest) {
  try {
    const userClient = await createServerComponentClient();
    const serviceClient = createServiceClient();

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Please sign in to join the group" } as JoinGroupResponseDTO,
        { status: 401 }
      );
    }

    const body: JoinGroupRequestDTO = await request.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json(
        { success: false, error: "Missing token" } as JoinGroupResponseDTO,
        { status: 400 }
      );
    }

    // Get the invite (use service client to bypass RLS)
    const { data: invite, error: inviteError } = (await serviceClient
      .from("group_invites")
      .select("*")
      .eq("token", token)
      .single()) as unknown as { data: Tables<"group_invites"> | null; error: Error | null };

    if (inviteError || !invite) {
      return NextResponse.json({
        success: false,
        error: "Invalid invite link",
      } as JoinGroupResponseDTO);
    }

    // Check if invite is valid
    const now = new Date();
    const expiresAt = invite.expires_at ? new Date(invite.expires_at) : null;
    const isExpired = expiresAt ? expiresAt < now : false;
    const isExhausted = invite.max_uses !== null && invite.use_count >= invite.max_uses;
    const isRevoked = invite.revoked_at !== null;

    if (isRevoked) {
      return NextResponse.json({
        success: false,
        error: "This invite has been revoked",
      } as JoinGroupResponseDTO);
    }

    if (isExpired) {
      return NextResponse.json({
        success: false,
        error: "This invite has expired",
      } as JoinGroupResponseDTO);
    }

    if (isExhausted) {
      return NextResponse.json({
        success: false,
        error: "This invite has reached its maximum uses",
      } as JoinGroupResponseDTO);
    }

    // Check if user is already a member (use service client to bypass RLS)
    const { data: existingMember } = await serviceClient
      .from("group_members")
      .select("id")
      .eq("group_id", invite.group_id)
      .eq("user_id", user.id)
      .single();

    if (existingMember) {
      return NextResponse.json({
        success: true,
        groupId: invite.group_id,
      } as JoinGroupResponseDTO);
    }

    // Add user to the group (use service client to bypass RLS)
    const { error: joinError } = await serviceClient
      .from("group_members")
      .insert({
        group_id: invite.group_id,
        user_id: user.id,
        role: "member",
      });

    if (joinError) {
      throw joinError;
    }

    // Increment use count
    await serviceClient
      .from("group_invites")
      .update({ use_count: invite.use_count + 1 })
      .eq("id", invite.id);

    return NextResponse.json({
      success: true,
      groupId: invite.group_id,
    } as JoinGroupResponseDTO);
  } catch (error) {
    console.error("Join group error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" } as JoinGroupResponseDTO,
      { status: 500 }
    );
  }
}
