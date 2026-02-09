export enum MemberRole {
  OWNER = "owner",
  ADMIN = "admin",
  MEMBER = "member",
}

export const MEMBER_ROLE_HIERARCHY: Record<MemberRole, number> = {
  [MemberRole.OWNER]: 3,
  [MemberRole.ADMIN]: 2,
  [MemberRole.MEMBER]: 1,
};

export function hasPermission(
  userRole: MemberRole,
  requiredRole: MemberRole
): boolean {
  return MEMBER_ROLE_HIERARCHY[userRole] >= MEMBER_ROLE_HIERARCHY[requiredRole];
}
