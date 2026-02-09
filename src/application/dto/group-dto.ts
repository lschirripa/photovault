import { MemberRole } from "@/domain/enums/member-role";

export interface CreateGroupRequestDTO {
  name: string;
  description?: string;
}

export interface UpdateGroupRequestDTO {
  name?: string;
  description?: string;
  coverImageUrl?: string;
}

export interface GroupResponseDTO {
  id: string;
  name: string;
  description: string | null;
  coverImageUrl: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  memberCount?: number;
  mediaCount?: number;
}

export interface GroupMemberResponseDTO {
  id: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  role: MemberRole;
  joinedAt: string;
}

export interface AddMemberRequestDTO {
  userId: string;
  role?: MemberRole;
}

export interface UpdateMemberRoleRequestDTO {
  role: MemberRole;
}

export interface GroupListResponseDTO {
  groups: GroupResponseDTO[];
  total: number;
  hasMore: boolean;
}
