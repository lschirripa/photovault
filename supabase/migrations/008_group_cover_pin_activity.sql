-- 1A: Cover photo reference on groups
ALTER TABLE public.groups
  ADD COLUMN cover_media_id UUID REFERENCES public.media_assets(id) ON DELETE SET NULL;

-- 1B: Pinned group preference on profiles
ALTER TABLE public.profiles
  ADD COLUMN pinned_group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL;

-- 1C: Group activities table
CREATE TABLE public.group_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    activity_type TEXT NOT NULL CHECK (activity_type IN ('cover_changed', 'group_renamed')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX idx_group_activities_group_created ON public.group_activities(group_id, created_at DESC);
CREATE INDEX idx_group_activities_created ON public.group_activities(created_at DESC);

ALTER TABLE public.group_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can view activities" ON public.group_activities
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.group_members WHERE group_id = group_activities.group_id AND user_id = auth.uid()));

CREATE POLICY "Group members can insert activities" ON public.group_activities
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.group_members WHERE group_id = group_activities.group_id AND user_id = auth.uid()));
