"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/presentation/providers/auth-provider";
import { useGroups } from "@/presentation/hooks/use-groups";
import { usePinnedGroup } from "@/presentation/hooks/use-pinned-group";
import { useUrlCache } from "@/presentation/hooks/use-url-cache";
import { MemberRole } from "@/domain/enums/member-role";
import { Button } from "@/presentation/components/ui/button";
import { GroupCard } from "@/presentation/components/groups/group-card";
import { GroupHero } from "@/presentation/components/groups/group-hero";

export default function GroupsPage() {
  const { user, loading: authLoading } = useAuth();
  const { groups, loading, error, fetchGroups, createGroup, deleteGroup } = useGroups();
  const { pinnedGroupId, pinnedMediaIds, fetchPinnedGroup, pinGroup, unpinGroup } = usePinnedGroup();
  const { fetchUrls } = useUrlCache();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDescription, setNewGroupDescription] = useState("");
  const [deleteConfirmGroupId, setDeleteConfirmGroupId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [coverUrls, setCoverUrls] = useState<Record<string, string>>({});
  const [heroThumbnailUrls, setHeroThumbnailUrls] = useState<Record<string, string>>({});

  // Find the pinned group object
  const pinnedGroup = useMemo(
    () => (pinnedGroupId ? groups.find((g) => g.id === pinnedGroupId) ?? null : null),
    [groups, pinnedGroupId]
  );

  // Fetch groups + pinned group on mount
  useEffect(() => {
    if (user) {
      fetchGroups();
      fetchPinnedGroup();
    }
  }, [user, fetchGroups, fetchPinnedGroup]);

  // Fetch cover URLs for groups that have a cover_media_id
  useEffect(() => {
    const coverMediaIds = groups
      .map((g) => g.coverMediaId)
      .filter((id): id is string => id !== null && id !== undefined);
    if (coverMediaIds.length === 0) return;

    fetchUrls(coverMediaIds, "thumbnail").then(setCoverUrls);
  }, [groups, fetchUrls]);

  // Fetch hero thumbnail URLs for the pinned group's recent media
  useEffect(() => {
    if (pinnedMediaIds.length === 0) return;

    fetchUrls(pinnedMediaIds, "thumbnail").then(setHeroThumbnailUrls);
  }, [pinnedMediaIds, fetchUrls]);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createGroup({
        name: newGroupName,
        description: newGroupDescription || undefined,
      });
      setShowCreateModal(false);
      setNewGroupName("");
      setNewGroupDescription("");
    } catch {
      // Error is handled by the hook
    }
  };

  const handleDeleteGroup = useCallback(async () => {
    if (!deleteConfirmGroupId) return;
    setIsDeleting(true);
    try {
      await deleteGroup(deleteConfirmGroupId);
      setDeleteConfirmGroupId(null);
    } catch {
      // Error is handled by the hook
    } finally {
      setIsDeleting(false);
    }
  }, [deleteConfirmGroupId, deleteGroup]);

  const handlePinToggle = useCallback(
    async (groupId: string) => {
      if (pinnedGroupId === groupId) {
        await unpinGroup();
      } else {
        await pinGroup(groupId);
      }
    },
    [pinnedGroupId, pinGroup, unpinGroup]
  );

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="mb-4">Please sign in to view your groups</p>
          <Link href="/signin" className="text-blue-600 hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Hero Banner — only when a group is pinned */}
        {pinnedGroup && (
          <GroupHero
            group={pinnedGroup}
            thumbnailUrls={heroThumbnailUrls}
            recentMediaIds={pinnedMediaIds}
            onUnpin={unpinGroup}
          />
        )}

        {/* Header */}
        <header className="flex justify-between items-center">
          <h1 className="text-2xl font-bold tracking-tight">My Groups</h1>
          <Button onClick={() => setShowCreateModal(true)}>
            Create Group
          </Button>
        </header>

        {/* Error */}
        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Groups grid */}
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[4/3] rounded-xl bg-gray-200 dark:bg-gray-800 animate-pulse"
              />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              You don&apos;t have any groups yet
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="text-blue-600 hover:underline"
            >
              Create your first group
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                coverUrl={group.coverMediaId ? coverUrls[group.coverMediaId] ?? null : null}
                isOwner={group.userRole === MemberRole.OWNER}
                isPinned={pinnedGroupId === group.id}
                onDelete={() => setDeleteConfirmGroupId(group.id)}
                onPin={() => handlePinToggle(group.id)}
              />
            ))}
          </div>
        )}

      </div>

      {/* Create Group Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-background border border-gray-200 dark:border-gray-800 rounded-xl shadow-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold mb-4">Create New Group</h2>
            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div>
                <label htmlFor="groupName" className="block text-sm font-medium mb-1">
                  Group Name
                </label>
                <input
                  id="groupName"
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="groupDescription" className="block text-sm font-medium mb-1">
                  Description (optional)
                </label>
                <textarea
                  id="groupDescription"
                  value={newGroupDescription}
                  onChange={(e) => setNewGroupDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={loading || !newGroupName}
                  loading={loading}
                  className="flex-1"
                >
                  Create
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirmGroupId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-background border border-gray-200 dark:border-gray-800 rounded-xl shadow-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold mb-4 text-red-600">Delete Group</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Are you sure you want to delete this group? This action cannot be undone
              and will permanently delete all photos and videos in this group.
            </p>
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeleteConfirmGroupId(null)}
                disabled={isDeleting}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={handleDeleteGroup}
                disabled={isDeleting}
                loading={isDeleting}
                className="flex-1"
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
