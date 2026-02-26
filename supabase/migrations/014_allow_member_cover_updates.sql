-- Allow any group member to update groups (cover photo).
-- Name/description restrictions are enforced at the API level.
DROP POLICY IF EXISTS "Group owners and admins can update groups" ON public.groups;
DROP POLICY IF EXISTS "Group members can update groups" ON public.groups;
CREATE POLICY "Group members can update groups"
    ON public.groups FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.group_members
        WHERE group_members.group_id = groups.id AND group_members.user_id = auth.uid()
    ));

-- Allow any group member to update albums (cover photo).
-- Name/description restrictions are enforced at the API level.
DROP POLICY IF EXISTS "Album creators and group admins can update albums" ON public.albums;
DROP POLICY IF EXISTS "Group members can update albums" ON public.albums;
CREATE POLICY "Group members can update albums"
    ON public.albums FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.group_members
        WHERE group_members.group_id = albums.group_id AND group_members.user_id = auth.uid()
    ));
