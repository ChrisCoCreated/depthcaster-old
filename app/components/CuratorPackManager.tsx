"use client";

import { useState, useEffect } from "react";
import { useNeynarContext } from "@neynar/react";
import { CuratorPackCard } from "./CuratorPackCard";
import { UserSearchInput } from "./UserSearchInput";
import { analytics } from "@/lib/analytics";

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
  createdAt: Date | string;
}

export function CuratorPackManager() {
  const { user } = useNeynarContext();
  const [packs, setPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingPack, setEditingPack] = useState<Pack | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<UserSuggestion[]>([]);
  const [suggestedUsers, setSuggestedUsers] = useState<UserSuggestion[]>([]);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    isPublic: true,
  });

  useEffect(() => {
    if (user?.fid) {
      fetchUserPacks();
      if (showCreateForm && !editingPack) {
        fetchSuggestedUsers();
      }
    }
  }, [user?.fid, showCreateForm]);

  const fetchSuggestedUsers = async () => {
    if (!user?.fid) return;
    
    try {
      const response = await fetch(`/api/user/suggested?fid=${user.fid}&limit=20`);
      if (response.ok) {
        const data = await response.json();
        setSuggestedUsers(data.users || []);
      }
    } catch (error) {
      console.error("Error fetching suggested users:", error);
    }
  };

  const fetchUserPacks = async () => {
    if (!user?.fid) return;
    
    try {
      setLoading(true);
      const response = await fetch(`/api/curator-packs?creatorFid=${user.fid}`);
      if (!response.ok) throw new Error("Failed to fetch packs");
      const data = await response.json();
      setPacks(data.packs || []);
    } catch (error) {
      console.error("Error fetching packs:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!user?.fid || !formData.name) return;

    const fids = selectedUsers.map((u) => u.fid!).filter((fid) => fid !== undefined && !isNaN(fid));

    if (fids.length === 0) {
      alert("Please select at least one user");
      return;
    }

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
      const response = await fetch("/api/curator-packs", {
        method: "POST",
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

      if (!response.ok) throw new Error("Failed to create pack");
      
      const data = await response.json();
      const packId = data.pack?.id || data.id;
      const userCount = fids.length;
      
      // Track analytics
      if (packId) {
        analytics.trackPackCreate(packId, formData.name, userCount);
      }
      
      setShowCreateForm(false);
      setFormData({ name: "", description: "", isPublic: true });
      setSelectedUsers([]);
      fetchUserPacks();
    } catch (error) {
      console.error("Error creating pack:", error);
      alert("Failed to create pack");
    }
  };

  const handleUpdate = async () => {
    if (!editingPack || !user?.fid || !formData.name) return;

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
      const response = await fetch(`/api/curator-packs/${editingPack.id}`, {
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
      
      const userCount = fids.length;
      
      // Track analytics
      analytics.trackPackUpdate(editingPack.id, formData.name, userCount);
      
      setEditingPack(null);
      setFormData({ name: "", description: "", isPublic: true });
      setSelectedUsers([]);
      fetchUserPacks();
    } catch (error) {
      console.error("Error updating pack:", error);
      alert("Failed to update pack");
    }
  };

  const handleDelete = async (packId: string) => {
    if (!user?.fid || !confirm("Are you sure you want to delete this pack?")) return;

    const pack = packs.find(p => p.id === packId);
    const packName = pack?.name || "";

    try {
      const response = await fetch(`/api/curator-packs/${packId}?creatorFid=${user.fid}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete pack");
      
      // Track analytics
      analytics.trackPackDelete(packId, packName);
      
      fetchUserPacks();
    } catch (error) {
      console.error("Error deleting pack:", error);
      alert("Failed to delete pack");
    }
  };

  const startEdit = async (pack: Pack) => {
    try {
      const response = await fetch(`/api/curator-packs/${pack.id}`);
      if (!response.ok) throw new Error("Failed to fetch pack");
      const data = await response.json();
      
      setEditingPack(data);
      setFormData({
        name: data.name,
        description: data.description || "",
        isPublic: data.isPublic,
      });
      
      // Convert pack users to UserSuggestion format
      const packUsers: UserSuggestion[] = (data.users || []).map((u: any) => ({
        username: u.username || "",
        display_name: u.displayName || u.username || "",
        pfp_url: u.pfpUrl,
        fid: u.fid,
      }));
      setSelectedUsers(packUsers);
      setShowCreateForm(true);
    } catch (error) {
      console.error("Error fetching pack:", error);
    }
  };

  if (!user) {
    return (
      <div className="p-8 text-center text-gray-500 dark:text-gray-400">
        Please sign in to manage your curator packs
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          My Curator Packs
        </h2>
        <button
          onClick={() => {
            setShowCreateForm(!showCreateForm);
            setEditingPack(null);
            setFormData({ name: "", description: "", isPublic: true });
            setSelectedUsers([]);
            if (!showCreateForm) {
              fetchSuggestedUsers();
            }
          }}
          className="px-4 py-2 bg-accent text-white rounded-full hover:bg-accent-dark transition-colors"
        >
          {showCreateForm ? "Cancel" : "Create Pack"}
        </button>
      </div>

      {showCreateForm && (
        <div className="mb-6 p-6 border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-900">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
            {editingPack ? "Edit Pack" : "Create New Pack"}
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
              {suggestedUsers.length > 0 && !editingPack && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Suggested: {suggestedUsers.length} users based on your interactions
                </p>
              )}
              {selectedUsers.length > 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {selectedUsers.length} user{selectedUsers.length !== 1 ? "s" : ""} selected
                </p>
              )}
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
                onClick={editingPack ? handleUpdate : handleCreate}
                className="px-4 py-2 bg-accent text-white rounded-full hover:bg-accent-dark transition-colors"
              >
                {editingPack ? "Update" : "Create"}
              </button>
              {editingPack && (
                <button
                  onClick={() => {
                    setEditingPack(null);
                    setShowCreateForm(false);
                    setFormData({ name: "", description: "", isPublic: true });
                    setSelectedUsers([]);
                  }}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          Loading packs...
        </div>
      ) : packs.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          No packs yet. Create your first pack!
        </div>
      ) : (
        <div className="space-y-3">
          {packs.map((pack) => (
            <div key={pack.id} className="relative border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
              <CuratorPackCard pack={pack} viewerFid={user.fid} showActions={false} />
              <div className="absolute top-3 right-3 flex gap-2">
                <button
                  onClick={() => startEdit(pack)}
                  className="px-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-700 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors bg-white dark:bg-gray-900 shadow-sm"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(pack.id)}
                  className="px-3 py-1.5 text-xs font-medium border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors bg-white dark:bg-gray-900 shadow-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

