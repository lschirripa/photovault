export interface CreateInviteRequestDTO {
  groupId: string;
  expiresInHours?: number; // null for never expires
  maxUses?: number; // null for unlimited
}

export interface InviteResponseDTO {
  id: string;
  groupId: string;
  token: string;
  inviteUrl: string;
  createdBy: string;
  expiresAt: string | null;
  maxUses: number | null;
  useCount: number;
  revokedAt: string | null;
  createdAt: string;
  isExpired: boolean;
  isExhausted: boolean;
  isRevoked: boolean;
  isValid: boolean;
}

export interface InviteListResponseDTO {
  invites: InviteResponseDTO[];
  total: number;
}

export interface ValidateInviteResponseDTO {
  valid: boolean;
  groupId?: string;
  groupName?: string;
  error?: string;
}

export interface JoinGroupRequestDTO {
  token: string;
}

export interface JoinGroupResponseDTO {
  success: boolean;
  groupId?: string;
  error?: string;
}
