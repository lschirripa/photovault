"use client";

import { useState, useEffect } from "react";
import { Button } from "@/presentation/components/ui/button";
import type { InviteResponseDTO } from "@/application/dto/invite-dto";

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  invites: InviteResponseDTO[];
  onCreateInvite: (options: { expiresInHours?: number; maxUses?: number }) => Promise<void>;
  onRevokeInvite: (inviteId: string) => Promise<void>;
  loading: boolean;
}

export function InviteModal({
  isOpen,
  onClose,
  groupId: _groupId,
  invites,
  onCreateInvite,
  onRevokeInvite,
  loading,
}: InviteModalProps) {
  const [expiresIn, setExpiresIn] = useState<string>("never");
  const [maxUses, setMaxUses] = useState<string>("unlimited");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setExpiresIn("never");
      setMaxUses("unlimited");
      setCopiedId(null);
    }
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !loading) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, loading]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !loading) {
      onClose();
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    const options: { expiresInHours?: number; maxUses?: number } = {};

    if (expiresIn !== "never") {
      options.expiresInHours = parseInt(expiresIn);
    }
    if (maxUses !== "unlimited") {
      options.maxUses = parseInt(maxUses);
    }

    await onCreateInvite(options);
    setCreating(false);
  };

  const handleRevoke = async (inviteId: string) => {
    setRevokingId(inviteId);
    await onRevokeInvite(inviteId);
    setRevokingId(null);
  };

  const handleCopy = async (url: string, inviteId: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        // Fallback for non-secure contexts (HTTP)
        const textArea = document.createElement("textarea");
        textArea.value = url;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCopiedId(inviteId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const activeInvites = invites.filter((i) => i.isValid);
  const expiredInvites = invites.filter((i) => !i.isValid);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Invite People
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Create invite links to share with friends
          </p>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {/* Create new invite section */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Create New Invite
            </h3>
            <div className="flex flex-col sm:flex-row gap-3 mb-3">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Expires</label>
                <select
                  value={expiresIn}
                  onChange={(e) => setExpiresIn(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
                  disabled={creating}
                >
                  <option value="never">Never</option>
                  <option value="1">1 hour</option>
                  <option value="24">24 hours</option>
                  <option value="168">7 days</option>
                  <option value="720">30 days</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Max Uses</label>
                <select
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
                  disabled={creating}
                >
                  <option value="unlimited">Unlimited</option>
                  <option value="1">1 use</option>
                  <option value="5">5 uses</option>
                  <option value="10">10 uses</option>
                  <option value="25">25 uses</option>
                </select>
              </div>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreate}
              loading={creating}
              className="w-full sm:w-auto"
            >
              Generate Link
            </Button>
          </div>

          {/* Active invites */}
          {activeInvites.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Active Invites
              </h3>
              <div className="space-y-2">
                {activeInvites.map((invite) => (
                  <div
                    key={invite.id}
                    className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-mono truncate text-gray-700 dark:text-gray-300">
                        {invite.inviteUrl}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {invite.maxUses
                          ? `${invite.useCount}/${invite.maxUses} uses`
                          : `${invite.useCount} uses`}
                        {invite.expiresAt && (
                          <> &middot; Expires {new Date(invite.expiresAt).toLocaleDateString()}</>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleCopy(invite.inviteUrl, invite.id)}
                      className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                      title="Copy link"
                    >
                      {copiedId === invite.id ? (
                        <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      )}
                    </button>
                    <button
                      onClick={() => handleRevoke(invite.id)}
                      disabled={revokingId === invite.id}
                      className="p-2 text-red-500 hover:text-red-700"
                      title="Revoke"
                    >
                      {revokingId === invite.id ? (
                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Expired/Revoked invites */}
          {expiredInvites.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-3">
                Expired / Revoked
              </h3>
              <div className="space-y-2">
                {expiredInvites.slice(0, 5).map((invite) => (
                  <div
                    key={invite.id}
                    className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg opacity-60"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-mono truncate text-gray-500">
                        {invite.token}
                      </div>
                      <div className="text-xs text-gray-400">
                        {invite.isRevoked
                          ? "Revoked"
                          : invite.isExpired
                          ? "Expired"
                          : "Max uses reached"}
                        {" "}&middot; {invite.useCount} uses
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeInvites.length === 0 && expiredInvites.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">
              No invite links yet. Create one above to share with friends.
            </p>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-800">
          <Button variant="outline" onClick={onClose} className="w-full">
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
