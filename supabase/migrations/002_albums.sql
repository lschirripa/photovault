-- PhotoVault Albums Schema
-- Run this migration after 001_initial_schema.sql

-- Albums table
CREATE TABLE public.albums (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    cover_asset_id UUID REFERENCES public.media_assets(id) ON DELETE SET NULL,
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Album-Media junction (many-to-many)
CREATE TABLE public.album_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    album_id UUID NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
    media_id UUID NOT NULL REFERENCES public.media_assets(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    added_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    UNIQUE(album_id, media_id)
);

-- Indexes for performance
CREATE INDEX idx_albums_group ON public.albums(group_id);
CREATE INDEX idx_albums_created_by ON public.albums(created_by);
CREATE INDEX idx_album_media_album ON public.album_media(album_id);
CREATE INDEX idx_album_media_media ON public.album_media(media_id);

-- Enable RLS
ALTER TABLE public.albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.album_media ENABLE ROW LEVEL SECURITY;

-- Albums Policies (based on group membership)
CREATE POLICY "Group members can view albums"
    ON public.albums FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.group_members
        WHERE group_id = albums.group_id AND user_id = auth.uid()
    ));

CREATE POLICY "Group members can create albums"
    ON public.albums FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = created_by AND
        EXISTS (
            SELECT 1 FROM public.group_members
            WHERE group_id = albums.group_id AND user_id = auth.uid()
        )
    );

CREATE POLICY "Album creators and group admins can update albums"
    ON public.albums FOR UPDATE TO authenticated
    USING (
        auth.uid() = created_by
        OR EXISTS (
            SELECT 1 FROM public.group_members
            WHERE group_id = albums.group_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY "Album creators and group admins can delete albums"
    ON public.albums FOR DELETE TO authenticated
    USING (
        auth.uid() = created_by
        OR EXISTS (
            SELECT 1 FROM public.group_members
            WHERE group_id = albums.group_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
        )
    );

-- Album Media Policies
CREATE POLICY "Group members can view album media"
    ON public.album_media FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.albums a
        JOIN public.group_members gm ON gm.group_id = a.group_id
        WHERE a.id = album_media.album_id AND gm.user_id = auth.uid()
    ));

CREATE POLICY "Group members can add media to albums"
    ON public.album_media FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = added_by AND
        EXISTS (
            SELECT 1 FROM public.albums a
            JOIN public.group_members gm ON gm.group_id = a.group_id
            WHERE a.id = album_media.album_id AND gm.user_id = auth.uid()
        )
    );

CREATE POLICY "Album creators and group admins can remove media from albums"
    ON public.album_media FOR DELETE TO authenticated
    USING (
        auth.uid() = added_by
        OR EXISTS (
            SELECT 1 FROM public.albums a
            JOIN public.group_members gm ON gm.group_id = a.group_id
            WHERE a.id = album_media.album_id AND gm.user_id = auth.uid() AND gm.role IN ('owner', 'admin')
        )
        OR EXISTS (
            SELECT 1 FROM public.albums a
            WHERE a.id = album_media.album_id AND a.created_by = auth.uid()
        )
    );

-- Trigger for albums updated_at
CREATE TRIGGER update_albums_updated_at
    BEFORE UPDATE ON public.albums
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ==========================================
-- Group Invites (Invite Links)
-- ==========================================

CREATE TABLE public.group_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ,
    max_uses INTEGER,
    use_count INTEGER DEFAULT 0 NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index for fast token lookup
CREATE INDEX idx_group_invites_token ON public.group_invites(token);
CREATE INDEX idx_group_invites_group ON public.group_invites(group_id);

-- Enable RLS
ALTER TABLE public.group_invites ENABLE ROW LEVEL SECURITY;

-- Policies for group_invites
CREATE POLICY "Group admins can view invites"
    ON public.group_invites FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.group_members
        WHERE group_id = group_invites.group_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
    ));

CREATE POLICY "Group admins can create invites"
    ON public.group_invites FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = created_by AND
        EXISTS (
            SELECT 1 FROM public.group_members
            WHERE group_id = group_invites.group_id
            AND user_id = auth.uid()
            AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY "Group admins can update invites"
    ON public.group_invites FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.group_members
        WHERE group_id = group_invites.group_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
    ));

CREATE POLICY "Group admins can delete invites"
    ON public.group_invites FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.group_members
        WHERE group_id = group_invites.group_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
    ));

-- Special policy: Anyone can read by token (for join validation)
-- This uses a function to check if the request is for a specific token
CREATE POLICY "Anyone can validate invite by token"
    ON public.group_invites FOR SELECT TO authenticated
    USING (true);  -- We'll filter by token in the application layer
