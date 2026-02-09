-- PhotoVault Initial Schema
-- Run this migration in your Supabase SQL editor

-- Users (extends Supabase auth.users)
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Groups
CREATE TABLE public.groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    cover_image_url TEXT,
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Group Members (junction table with roles)
CREATE TABLE public.group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')) DEFAULT 'member',
    joined_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(group_id, user_id)
);

-- Media Assets
CREATE TABLE public.media_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    uploaded_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    original_key TEXT NOT NULL,
    thumbnail_key TEXT,
    media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
    mime_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    width INTEGER,
    height INTEGER,
    duration_seconds NUMERIC,
    status TEXT NOT NULL CHECK (status IN ('uploading', 'processing', 'ready', 'failed')) DEFAULT 'uploading',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for performance
CREATE INDEX idx_group_members_user ON public.group_members(user_id);
CREATE INDEX idx_group_members_group ON public.group_members(group_id);
CREATE INDEX idx_media_assets_group ON public.media_assets(group_id);
CREATE INDEX idx_media_assets_uploaded_by ON public.media_assets(uploaded_by);
CREATE INDEX idx_media_assets_status ON public.media_assets(status);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Public profiles are viewable by authenticated users"
    ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert own profile"
    ON public.profiles FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE TO authenticated
    USING (auth.uid() = id);

-- Groups Policies
CREATE POLICY "Group members can view groups"
    ON public.groups FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.group_members
        WHERE group_id = id AND user_id = auth.uid()
    ));

CREATE POLICY "Authenticated users can create groups"
    ON public.groups FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Group owners and admins can update groups"
    ON public.groups FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.group_members
        WHERE group_id = id AND user_id = auth.uid() AND role IN ('owner', 'admin')
    ));

CREATE POLICY "Group owners can delete groups"
    ON public.groups FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.group_members
        WHERE group_id = id AND user_id = auth.uid() AND role = 'owner'
    ));

-- Group Members Policies
CREATE POLICY "Group members can view membership"
    ON public.group_members FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.group_members gm
        WHERE gm.group_id = group_members.group_id AND gm.user_id = auth.uid()
    ));

CREATE POLICY "Group owners and admins can add members"
    ON public.group_members FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.group_members gm
        WHERE gm.group_id = group_members.group_id AND gm.user_id = auth.uid() AND gm.role IN ('owner', 'admin')
    ) OR (
        -- Allow users to add themselves as owner when creating a group
        auth.uid() = user_id AND role = 'owner'
    ));

CREATE POLICY "Group owners and admins can update member roles"
    ON public.group_members FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.group_members gm
        WHERE gm.group_id = group_members.group_id AND gm.user_id = auth.uid() AND gm.role IN ('owner', 'admin')
    ));

CREATE POLICY "Group owners and admins can remove members"
    ON public.group_members FOR DELETE TO authenticated
    USING (
        -- Owners/admins can remove others
        EXISTS (
            SELECT 1 FROM public.group_members gm
            WHERE gm.group_id = group_members.group_id AND gm.user_id = auth.uid() AND gm.role IN ('owner', 'admin')
        )
        OR
        -- Members can remove themselves
        auth.uid() = user_id
    );

-- Media Assets Policies
CREATE POLICY "Group members can view media"
    ON public.media_assets FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.group_members
        WHERE group_id = media_assets.group_id AND user_id = auth.uid()
    ));

CREATE POLICY "Group members can upload media"
    ON public.media_assets FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = uploaded_by AND
        EXISTS (
            SELECT 1 FROM public.group_members
            WHERE group_id = media_assets.group_id AND user_id = auth.uid()
        )
    );

CREATE POLICY "Uploaders can update their own media"
    ON public.media_assets FOR UPDATE TO authenticated
    USING (auth.uid() = uploaded_by);

CREATE POLICY "Uploaders and group admins can delete media"
    ON public.media_assets FOR DELETE TO authenticated
    USING (
        auth.uid() = uploaded_by
        OR EXISTS (
            SELECT 1 FROM public.group_members
            WHERE group_id = media_assets.group_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
        )
    );

-- Function to automatically create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, display_name, avatar_url)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email),
        NEW.raw_user_meta_data->>'avatar_url'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_groups_updated_at
    BEFORE UPDATE ON public.groups
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
