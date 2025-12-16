"use client";

import { useState, useEffect, use } from "react";
import { useNeynarContext } from "@neynar/react";
import Link from "next/link";
import { CuratorPackCard } from "@/app/components/CuratorPackCard";
import { UserSearchInput } from "@/app/components/UserSearchInput";
import { AvatarImage } from "@/app/components/AvatarImage";

interface UserSuggestion {
  username: string;
  pfp_url?: string;
  display_name: string;
  fid?: number;
  viewer_context?: {
    following?: boolean;
    followed_by?: boolean;
    blocking?: boolean;
    blocked_by?: boolean;
  };
}

interface PackUser {
  fid: number;
  username?: string | null;
  displayName?: string | null;
  pfpUrl?: string | null;
  addedAt: Date | string;
}

interface Pack {
  id: string;
  name: string;
  description?: string | null;
  creatorFid: number;
  creator?: {
    fid: number;
    username?: string | null;
    displayName?: string | null;
    pfpUrl?: string | null;
  } | null;
  isPublic: boolean;
  usageCount: number;
  userCount: number;
  users?: PackUser[];
  createdAt: Date | string;
}

export default function PackDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useNeynarContext();
  const [pack, setPack] = useState<Pack | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<UserSuggestion[]>([]);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    isPublic: true,
  });

  useEffect(() => {
    fetchPack();
  }, [id]);

  const fetchPack = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/curator-packs/${id}`);
      if (!response.ok) throw new Error("Failed to fetch pack");
      const data = await response.json();
      setPack(data);
    } catch (error) {
      console.error("Error fetching pack:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async () => {
    if (!user?.fid) return;
    
    setIsSubscribing(true);
    try {
      await fetch(`/api/curator-packs/${id}/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userFid: user.fid }),
      });
      fetchPack(); // Refresh to update usage count
    } catch (error) {
      console.error("Failed to subscribe:", error);
    } finally {
      setIsSubscribing(false);
    }
  };

  const handleUseInFeed = () => {
    // Store selected pack IDs in localStorage or state management
    const selectedPacks = [id];
    localStorage.setItem("selectedPackIds", JSON.stringify(selectedPacks));
    window.location.href = "/";
  };

  const handleStartEdit = () => {
    if (!pack) return;
    setFormData({
      name: pack.name,
      description: pack.description || "",
      isPublic: pack.isPublic,
    });
    
    // Convert pack users to UserSuggestion format
    const packUsers: UserSuggestion[] = (pack.users || []).map((u: any) => ({
      username: u.username || "",
      display_name: u.displayName || u.username || "",
      pfp_url: u.pfpUrl,
      fid: u.fid,
    }));
    setSelectedUsers(packUsers);
    setShowEditForm(true);
  };

  const handleUpdate = async () => {
    if (!pack || !user?.fid) return;

    const fids = selectedUsers.map((u) => u.fid!).filter((fid) => fid !== undefined && !isNaN(fid));

    // Build userData map from selectedUsers
    const userData: Record<number, { username?: string; displayName?: string; pfpUrl?: string }> = {};
    for (const selectedUser of selectedUsers) {
      if (selectedUser.fid) {
        userData[selectedUser.fid] = {
          username: selectedUser.username,
          displayName: selectedUser.display_name,
          pfpUrl: selectedUser.pfp_url,
        };
      }
    }

    try {
      setIsEditing(true);
      const response = await fetch(`/api/curator-packs/${pack.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description || null,
          fids,
          userData,
          isPublic: formData.isPublic,
          creatorFid: user.fid,
        }),
      });

      if (!response.ok) throw new Error("Failed to update pack");
      
      setShowEditForm(false);
      setFormData({ name: "", description: "", isPublic: true });
      setSelectedUsers([]);
      fetchPack(); // Refresh pack data
    } catch (error) {
      console.error("Error updating pack:", error);
      alert("Failed to update pack");
    } finally {
      setIsEditing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Loading pack...</div>
      </div>
    );
  }

  if (!pack) {
    return (
      <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Pack not found</div>
      </div>
    );
  }

  const isCreator = user?.fid === pack.creatorFid;

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link href="/packs" className="text-blue-600 dark:text-blue-400 hover:underline mb-4 inline-block">
            ← Back to Packs
          </Link>
        </div>

        {pack && (
          <div className="mb-6">
            <CuratorPackCard pack={pack} viewerFid={user?.fid} showActions={false} />
          </div>
        )}

        <div className="flex gap-3 mb-6">
          {isCreator && (
            <button
              onClick={showEditForm ? () => setShowEditForm(false) : handleStartEdit}
              className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              {showEditForm ? "Cancel Edit" : "Edit Pack"}
            </button>
          )}
          {!isCreator && user && (
            <button
              onClick={handleSubscribe}
              disabled={isSubscribing}
              className="px-4 py-2 bg-accent text-white rounded-full hover:bg-accent-dark transition-colors disabled:opacity-50"
            >
              {isSubscribing ? "Subscribing..." : "Subscribe"}
            </button>
          )}
          <button
            onClick={handleUseInFeed}
            className="px-4 py-2 bg-green-600 text-white rounded-full hover:bg-green-700 transition-colors"
          >
            Use in Feed
          </button>
        </div>

        {showEditForm && isCreator && (
          <div className="mb-6 p-6 border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-900">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
              Edit Pack
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                  Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  placeholder="Pack name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  placeholder="Pack description"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                  Users *
                </label>
                <UserSearchInput
                  selectedUsers={selectedUsers}
                  onSelectUsers={setSelectedUsers}
                  placeholder="Search users by username..."
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isPublic"
                  checked={formData.isPublic}
                  onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
                  className="w-4 h-4"
                />
                <label htmlFor="isPublic" className="text-sm text-gray-700 dark:text-gray-300">
                  Make this pack public
                </label>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleUpdate}
                  disabled={isEditing || !formData.name || selectedUsers.length === 0}
                  className="px-4 py-2 bg-accent text-white rounded-full hover:bg-accent-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isEditing ? "Updating..." : "Update Pack"}
                </button>
                <button
                  onClick={() => setShowEditForm(false)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="border-t border-gray-200 dark:border-gray-800 pt-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
            Users in this pack ({pack.userCount})
          </h2>
          
          {pack.users && pack.users.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pack.users.map((packUser) => (
                <Link
                  key={packUser.fid}
                  href={`/profile/${packUser.fid}`}
                  className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
                >
                  <AvatarImage
                    src={packUser.pfpUrl || undefined}
                    alt={packUser.username || `FID ${packUser.fid}`}
                    size={40}
                    className="w-10 h-10 rounded-full"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                      {packUser.displayName || packUser.username || `@user_${packUser.fid}`}
                    </div>
                    {packUser.username ? (
                      <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
                        @{packUser.username}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
                        FID: {packUser.fid}
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              No users in this pack
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

