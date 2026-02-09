import { MemberRole } from "../enums/member-role";

export interface GroupMember {
  id: string;
  groupId: string;
  userId: string;
  role: MemberRole;
  joinedAt: Date;
}

export interface CreateGroupMemberInput {
  groupId: string;
  userId: string;
  role?: MemberRole;
}

export interface UpdateGroupMemberInput {
  role: MemberRole;
}
