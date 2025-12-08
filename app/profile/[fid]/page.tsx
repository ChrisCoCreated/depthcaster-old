"use client";

import { useEffect, useState, use } from "react";
import { useNeynarContext } from "@neynar/react";
import { ProfileHeader } from "../../components/ProfileHeader";
import { UserActivitySection } from "../../components/UserActivitySection";

type ActivityType = "curated-casts" | "popular-casts" | "casts" | "replies-recasts" | "interactions";

interface UserProfile {
  fid: number;
  username?: string;
  display_name?: string;
  pfp_url?: string;
  bio?: string;
  follower_count?: number;
  following_count?: number;
  verified?: boolean;
  isFollowing?: boolean;
}

export default function ProfilePage({
  params,
}: {
  params: Promise<{ fid: string }>;
}) {
  const { fid: fidParam } = use(params);
  const { user } = useNeynarContext();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActivityType>("curated-casts");
  const fid = parseInt(fidParam);
  const isFid = !isNaN(fid);

  useEffect(() => {
    fetchProfile();
  }, [fidParam, user?.fid]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      setError(null);

      const viewerFid = user?.fid;
      const url = viewerFid
        ? `/api/user/${encodeURIComponent(fidParam)}?viewerFid=${viewerFid}`
        : `/api/user/${encodeURIComponent(fidParam)}`;

      // Pass the parameter as-is (can be FID or username)
      const response = await fetch(url);
      if (!response.ok) {
        if (response.status === 404) {
          setError("User not found");
        } else {
          throw new Error("Failed to fetch profile");
        }
        setLoading(false);
        return;
      }

      const data = await response.json();
      setProfile(data);
    } catch (err: any) {
      console.error("Failed to fetch profile:", err);
      setError(err.message || "Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  const handleProfileUpdate = () => {
    // Refresh profile data after update
    fetchProfile();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Loading profile...</div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen">
        <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
          <div className="p-4 sm:p-6 border border-red-200 dark:border-red-800 rounded-lg bg-red-50 dark:bg-red-900/20">
            <p className="text-red-600 dark:text-red-400">
              {error || "Profile not found"}
            </p>
          </div>
        </main>
      </div>
    );
  }

  const viewerFid = user?.fid;

  return (
    <div className="min-h-screen">
      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {/* Profile Header */}
        <ProfileHeader
          fid={profile.fid}
          username={profile.username}
          displayName={profile.display_name}
          pfpUrl={profile.pfp_url}
          bio={profile.bio}
          followerCount={profile.follower_count}
          followingCount={profile.following_count}
          verified={profile.verified}
          viewerFid={viewerFid}
          isFollowing={profile.isFollowing}
          onProfileUpdate={handleProfileUpdate}
        />

        {/* Activity Sections - Feed Menu Style */}
        <div className="w-full">
          {/* Activity tabs */}
          <div className="sticky top-0 bg-white dark:bg-black border-b border-gray-200 dark:border-gray-800 z-40">
            <div className="flex gap-1 overflow-x-auto px-2 sm:px-4 scrollbar-hide overscroll-x-contain">
              {[
                { id: "curated-casts" as ActivityType, label: "Curated Casts" },
                { id: "popular-casts" as ActivityType, label: "Popular Casts" },
                { id: "casts" as ActivityType, label: "Casts" },
                { id: "replies-recasts" as ActivityType, label: "Replies & Recasts" },
                { id: "interactions" as ActivityType, label: "Interactions" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                      : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Activity content */}
          <div className="mt-4">
            {activeTab === "curated-casts" && profile && (
              <UserActivitySection
                fid={profile.fid}
                viewerFid={viewerFid}
                type="curated-casts"
                title="Curated Casts"
                icon="✨"
                autoExpand={true}
              />
            )}
            {activeTab === "popular-casts" && profile && (
              <UserActivitySection
                fid={profile.fid}
                viewerFid={viewerFid}
                type="popular-casts"
                title="Popular Casts"
                icon="⭐"
                autoExpand={true}
              />
            )}
            {activeTab === "casts" && profile && (
              <UserActivitySection
                fid={profile.fid}
                viewerFid={viewerFid}
                type="casts"
                title="Casts"
                icon="📝"
                autoExpand={true}
              />
            )}
            {activeTab === "replies-recasts" && profile && (
              <UserActivitySection
                fid={profile.fid}
                viewerFid={viewerFid}
                type="replies-recasts"
                title="Replies & Recasts"
                icon="💬"
                autoExpand={true}
              />
            )}
            {activeTab === "interactions" && profile && (
              <UserActivitySection
                fid={profile.fid}
                viewerFid={viewerFid}
                type="interactions"
                title="Interactions"
                icon="❤️"
                autoExpand={true}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
