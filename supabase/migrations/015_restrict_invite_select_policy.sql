-- Drop the overly permissive "Anyone can validate invite by token" policy.
-- It allowed ALL authenticated users to SELECT every row in group_invites,
-- leaking invite metadata (tokens, group IDs, expiry dates) across groups.
--
-- This is safe to remove because:
--   1. Admin listing/revocation is covered by "Group admins can view invites" policy
--   2. Join validation (GET/POST /api/join) uses the service client which bypasses RLS

DROP POLICY IF EXISTS "Anyone can validate invite by token" ON public.group_invites;
