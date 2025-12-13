"use client";

import { useState, useEffect } from "react";
import { useNeynarContext } from "@neynar/react";
import { AvatarImage } from "./AvatarImage";
import { CuratorBadge } from "./CuratorBadge";

interface ProfileHeaderProps {
  fid: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
  bio?: string;
  followerCount?: number;
  followingCount?: number;
  verified?: boolean;
  viewerFid?: number;
  isFollowing?: boolean;
  onProfileUpdate?: () => void;
}

export function ProfileHeader({
  fid,
  username,
  displayName,
  pfpUrl,
  bio,
  followerCount,
  followingCount,
  verified,
  viewerFid,
  isFollowing: initialIsFollowing = false,
  onProfileUpdate,
}: ProfileHeaderProps) {
  const { user } = useNeynarContext();
  const [isWatching, setIsWatching] = useState(false);
  const [watchLoading, setWatchLoading] = useState(false);
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const [followLoading, setFollowLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState(displayName || "");
  const [editBio, setEditBio] = useState(bio || "");
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [isCurator, setIsCurator] = useState(false);

  const isOwnProfile = user?.fid === fid;

  // Update isFollowing when prop changes
  useEffect(() => {
    setIsFollowing(initialIsFollowing);
  }, [initialIsFollowing]);

  // Check watch status on mount
  useEffect(() => {
    if (!isOwnProfile && viewerFid) {
      checkWatchStatus();
    }
  }, [fid, viewerFid, isOwnProfile]);

  // Check curator status on mount
  useEffect(() => {
    const checkCuratorStatus = async () => {
      try {
        const response = await fetch(`/api/admin/check?fid=${fid}`);
        if (response.ok) {
          const data = await response.json();
          const roles = data.roles || [];
          setIsCurator(roles.includes("curator"));
        }
      } catch (error) {
        console.error("Failed to check curator status:", error);
      }
    };

    checkCuratorStatus();
  }, [fid]);

  // Update local state when props change
  useEffect(() => {
    setEditDisplayName(displayName || "");
    setEditBio(bio || "");
  }, [displayName, bio]);

  const checkWatchStatus = async () => {
    if (!viewerFid) return;
    try {
      const response = await fetch(`/api/user/${fid}/watch-status?watcherFid=${viewerFid}`);
      if (response.ok) {
        const data = await response.json();
        setIsWatching(data.isWatching);
      }
    } catch (error) {
      console.error("Failed to check watch status:", error);
    }
  };

  const handleWatch = async () => {
    if (!viewerFid) return;
    setWatchLoading(true);
    try {
      const response = await fetch("/api/webhooks/user-watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          watcherFid: viewerFid,
          watchedFid: fid,
        }),
      });

      if (response.ok) {
        setIsWatching(true);
      } else {
        const data = await response.json();
        console.error("Failed to watch user:", data.error);
      }
    } catch (error) {
      console.error("Failed to watch user:", error);
    } finally {
      setWatchLoading(false);
    }
  };

  const handleUnwatch = async () => {
    if (!viewerFid) return;
    setWatchLoading(true);
    try {
      const response = await fetch(
        `/api/webhooks/user-watch?watcherFid=${viewerFid}&watchedFid=${fid}`,
        {
          method: "DELETE",
        }
      );

      if (response.ok) {
        setIsWatching(false);
      } else {
        const data = await response.json();
        console.error("Failed to unwatch user:", data.error);
      }
    } catch (error) {
      console.error("Failed to unwatch user:", error);
    } finally {
      setWatchLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user?.signer_uuid) {
      setUpdateError("Please sign in to update your profile");
      return;
    }

    setUpdateLoading(true);
    setUpdateError(null);
    setUpdateSuccess(false);

    try {
      const response = await fetch(`/api/user/${fid}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: editDisplayName,
          bio: editBio,
          signerUuid: user.signer_uuid,
        }),
      });

      if (response.ok) {
        setUpdateSuccess(true);
        setIsEditing(false);
        if (onProfileUpdate) {
          onProfileUpdate();
        }
        // Clear success message after 3 seconds
        setTimeout(() => setUpdateSuccess(false), 3000);
      } else {
        const data = await response.json();
        setUpdateError(data.error || "Failed to update profile");
      }
    } catch (error: any) {
      setUpdateError(error.message || "Failed to update profile");
    } finally {
      setUpdateLoading(false);
    }
  };

  const handleCancel = () => {
    setEditDisplayName(displayName || "");
    setEditBio(bio || "");
    setIsEditing(false);
    setUpdateError(null);
    setUpdateSuccess(false);
  };

  const handleFollow = async () => {
    if (!user?.signer_uuid || !viewerFid) return;
    setFollowLoading(true);
    try {
      const response = await fetch(`/api/user/${fid}/follow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signerUuid: user.signer_uuid,
        }),
      });

      if (response.ok) {
        setIsFollowing(true);
        if (onProfileUpdate) {
          onProfileUpdate();
        }
      } else {
        const data = await response.json();
        console.error("Failed to follow user:", data.error);
      }
    } catch (error) {
      console.error("Failed to follow user:", error);
    } finally {
      setFollowLoading(false);
    }
  };

  const handleUnfollow = async () => {
    if (!user?.signer_uuid || !viewerFid) return;
    setFollowLoading(true);
    try {
      const response = await fetch(
        `/api/user/${fid}/follow?signerUuid=${user.signer_uuid}`,
        {
          method: "DELETE",
        }
      );

      if (response.ok) {
        setIsFollowing(false);
        if (onProfileUpdate) {
          onProfileUpdate();
        }
      } else {
        const data = await response.json();
        console.error("Failed to unfollow user:", data.error);
      }
    } catch (error) {
      console.error("Failed to unfollow user:", error);
    } finally {
      setFollowLoading(false);
    }
  };

  return (
    <div className="border-b border-gray-200 dark:border-gray-800 pb-6 mb-6">
      <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
        {/* Avatar */}
        <div className="flex-shrink-0">
          <AvatarImage
            src={pfpUrl}
            alt={displayName || username || `User ${fid}`}
            size={96}
            className="w-20 h-20 sm:w-24 sm:h-24 rounded-full border-2 border-gray-200 dark:border-gray-700 object-cover"
          />
        </div>

        {/* Profile Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4 mb-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 truncate">
                  {isEditing ? (
                    <input
                      type="text"
                      value={editDisplayName}
                      onChange={(e) => setEditDisplayName(e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      placeholder="Display name"
                      maxLength={50}
                    />
                  ) : (
                    displayName || username || `User ${fid}`
                  )}
                </h1>
                {verified && (
                  <span className="text-blue-500" title="Verified">
                    <svg
                      className="w-5 h-5 sm:w-6 sm:h-6"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </span>
                )}
                <CuratorBadge userFid={fid} viewerFid={viewerFid} isCurator={isCurator} />
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-2">
                <span>@{username || `fid:${fid}`}</span>
                <span>•</span>
                <span>FID: {fid}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex-shrink-0">
              {isOwnProfile ? (
                <div className="flex gap-2">
                  {isEditing ? (
                    <>
                      <button
                        onClick={handleSave}
                        disabled={updateLoading}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                      >
                        {updateLoading ? "Saving..." : "Save"}
                      </button>
                      <button
                        onClick={handleCancel}
                        disabled={updateLoading}
                        className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-sm font-medium"
                    >
                      Edit Profile
                    </button>
                  )}
                </div>
              ) : (
                viewerFid && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        // Navigate to chat page - will need to resolve FID to address
                        window.location.href = `/chat?peerFid=${fid}`;
                      }}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium flex items-center gap-2"
                      title="Send message"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                        />
                      </svg>
                      Message
                    </button>
                    <button
                      onClick={isFollowing ? handleUnfollow : handleFollow}
                      disabled={followLoading}
                      className={`px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium ${
                        isFollowing
                          ? "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                          : "bg-blue-600 text-white hover:bg-blue-700"
                      }`}
                    >
                      {followLoading ? "..." : isFollowing ? "Following" : "Follow"}
                    </button>
                    <button
                      onClick={isWatching ? handleUnwatch : handleWatch}
                      disabled={watchLoading}
                      className={`px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium ${
                        isWatching
                          ? "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                          : "bg-blue-600 text-white hover:bg-blue-700"
                      }`}
                    >
                      {watchLoading ? "..." : isWatching ? "Unwatch" : "Watch"}
                    </button>
                  </div>
                )
              )}
            </div>
          </div>

          {/* Bio */}
          {isEditing ? (
            <textarea
              value={editBio}
              onChange={(e) => setEditBio(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none"
              placeholder="Bio"
              rows={3}
              maxLength={280}
            />
          ) : (
            bio && (
              <p className="text-gray-700 dark:text-gray-300 mb-4 whitespace-pre-wrap">
                {bio}
              </p>
            )
          )}

          {/* Stats */}
          <div className="flex gap-4 text-sm">
            <div>
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {followerCount?.toLocaleString() || 0}
              </span>
              <span className="text-gray-500 dark:text-gray-400 ml-1">followers</span>
            </div>
            <div>
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {followingCount?.toLocaleString() || 0}
              </span>
              <span className="text-gray-500 dark:text-gray-400 ml-1">following</span>
            </div>
          </div>

          {/* Update Messages */}
          {updateError && (
            <div className="mt-3 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-600 dark:text-red-400">
              {updateError}
            </div>
          )}
          {updateSuccess && (
            <div className="mt-3 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded text-sm text-green-600 dark:text-green-400">
              Profile updated successfully
            </div>
          )}
        </div>
      </div>
    </div>
  );
}








