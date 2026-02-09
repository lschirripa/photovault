import { MemberRole } from "../enums/member-role";

export interface Group {
  id: string;
  name: string;
  description: string | null;
  coverImageUrl: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateGroupInput {
  name: string;
  description?: string | null;
  coverImageUrl?: string | null;
  createdBy: string;
}

export interface UpdateGroupInput {
  name?: string;
  description?: string | null;
  coverImageUrl?: string | null;
}

export interface GroupWithStats extends Group {
  memberCount: number;
  mediaCount: number;
  userRole: MemberRole;
  lastActivityAt: Date | null;
  recentMediaIds: string[]; // up to 4, for mosaic thumbnails
}
