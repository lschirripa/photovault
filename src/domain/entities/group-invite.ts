export interface GroupInvite {
  id: string;
  groupId: string;
  token: string;
  createdBy: string;
  expiresAt: Date | null;
  maxUses: number | null;
  useCount: number;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface CreateGroupInviteInput {
  groupId: string;
  createdBy: string;
  expiresAt?: Date | null;
  maxUses?: number | null;
}
