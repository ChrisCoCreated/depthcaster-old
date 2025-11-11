"use client";

import { useState, useEffect } from "react";
import { useNeynarContext } from "@neynar/react";
import { UserSearchInput } from "./UserSearchInput";

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

interface CloseFriendsPromptProps {
  onPackCreated?: () => void;
}

export function CloseFriendsPrompt({ onPackCreated }: CloseFriendsPromptProps) {
  const { user } = useNeynarContext();
  const [hasPacks, setHasPacks] = useState<boolean | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<UserSuggestion[]>([]);
  const [suggestedUsers, setSuggestedUsers] = useState<UserSuggestion[]>([]);

  useEffect(() => {
    if (user?.fid) {
      checkUserPacks();
      fetchSuggestedUsers();
    }
  }, [user?.fid]);

  const checkUserPacks = async () => {
    if (!user?.fid) return;
    
    try {
      const response = await fetch(`/api/curator-packs?creatorFid=${user.fid}`);
      if (response.ok) {
        const data = await response.json();
        const userHasPacks = data.packs && data.packs.length > 0;
        setHasPacks(userHasPacks);
        setShowPrompt(!userHasPacks);
      }
    } catch (error) {
      console.error("Error checking packs:", error);
    }
  };

  const fetchSuggestedUsers = async () => {
    if (!user?.fid) return;
    
    try {
      const response = await fetch(`/api/user/suggested?fid=${user.fid}&limit=20`);
      if (response.ok) {
        const data = await response.json();
        const users = data.users || [];
        setSuggestedUsers(users);
        // Pre-select first 10 suggested users
        setSelectedUsers(users.slice(0, 10));
      }
    } catch (error) {
      console.error("Error fetching suggested users:", error);
    }
  };

  const handleCreateCloseFriends = async () => {
    if (!user?.fid || isCreating || selectedUsers.length === 0) return;

    setIsCreating(true);
    try {
      const fids = selectedUsers.map((u) => u.fid!).filter((fid) => fid !== undefined);

      if (fids.length === 0) {
        alert("Please select at least one user!");
        setIsCreating(false);
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

      // Create the close friends pack
      const response = await fetch("/api/curator-packs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Close Friends",
          description: "Your close friends on Farcaster",
          fids,
          userData,
          isPublic: false,
          creatorFid: user.fid,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create pack");
      }

      setShowPrompt(false);
      setShowForm(false);
      setHasPacks(true);
      setSelectedUsers([]);
      onPackCreated?.();
    } catch (error) {
      console.error("Error creating close friends pack:", error);
      alert("Failed to create close friends pack");
    } finally {
      setIsCreating(false);
    }
  };

  if (!showPrompt || hasPacks || !user) {
    return null;
  }

  return (
    <div className="mb-4 sm:mb-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm relative z-[60]">
      {!showForm ? (
        <div className="p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3 sm:gap-4">
            <div className="flex-1 min-w-0">
              <div className="mb-3">
                <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100 mb-1.5">
                  Create Your First Curator Pack
                </h3>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  Start by creating a <span className="font-medium text-gray-900 dark:text-gray-100">"Close Friends"</span> pack. 
                  We've suggested users you interact with frequently.
                </p>
              </div>
              <button
                onClick={() => setShowForm(true)}
                className="px-4 sm:px-5 py-2 sm:py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-xs sm:text-sm font-medium shadow-sm hover:shadow-md"
              >
                Create Close Friends Pack
              </button>
            </div>
            <button
              onClick={() => setShowPrompt(false)}
              className="flex-shrink-0 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Dismiss"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      ) : (
        <div className="p-4 sm:p-6">
          <div className="mb-4 sm:mb-6 relative z-[50]">
            <div className="flex items-start sm:items-center justify-between mb-3 sm:mb-4 gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">
                  Create Close Friends Pack
                </h3>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  Select users to include in your pack
                </p>
              </div>
              <button
                onClick={() => {
                  setShowForm(false);
                  setSelectedUsers([]);
                }}
                className="flex-shrink-0 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div className="relative">
                <label className="block text-sm font-semibold mb-2 text-gray-900 dark:text-gray-100">
                  Select Users
                </label>
                <UserSearchInput
                  selectedUsers={selectedUsers}
                  onSelectUsers={setSelectedUsers}
                  placeholder="Search users by username..."
                />
                {suggestedUsers.length > 0 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {suggestedUsers.length} suggested users based on your interactions
                  </p>
                )}
              </div>

              {selectedUsers.length > 0 && (
                <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {selectedUsers.length} {selectedUsers.length === 1 ? "user" : "users"} selected
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-4 border-t border-gray-200 dark:border-gray-800 relative z-10">
            <button
              onClick={handleCreateCloseFriends}
              disabled={isCreating || selectedUsers.length === 0}
              className="flex-1 px-4 sm:px-5 py-2.5 sm:py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold shadow-sm hover:shadow-md disabled:shadow-none"
            >
              {isCreating ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Creating...
                </span>
              ) : (
                `Create Pack${selectedUsers.length > 0 ? ` (${selectedUsers.length})` : ""}`
              )}
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                setSelectedUsers([]);
              }}
              className="px-4 sm:px-5 py-2.5 sm:py-3 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
