"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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

interface Pack {
  id: string;
  name: string;
  description?: string | null;
  users?: UserSuggestion[];
}

interface My37ManagerProps {
  onPackReady?: (packId: string, hasUsers: boolean) => void;
}

const MAX_USERS = 37;

export function My37Manager({ onPackReady }: My37ManagerProps) {
  const { user } = useNeynarContext();
  const [pack, setPack] = useState<Pack | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<UserSuggestion[]>([]);
  const [suggestedUsers, setSuggestedUsers] = useState<UserSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [savedUsers, setSavedUsers] = useState<UserSuggestion[]>([]);
  const [hideRecasts, setHideRecasts] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("my37HideRecasts");
      return saved === "true";
    }
    return false;
  });

  // Track if we've already loaded to prevent re-fetching
  const hasLoadedRef = useRef<boolean>(false);
  
  // Check if there are unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    if (!pack) return false; // No pack means nothing saved yet
    if (selectedUsers.length !== savedUsers.length) return true;
    
    const selectedFids = new Set(selectedUsers.map(u => u.fid).filter(Boolean));
    const savedFids = new Set(savedUsers.map(u => u.fid).filter(Boolean));
    
    if (selectedFids.size !== savedFids.size) return true;
    
    for (const fid of selectedFids) {
      if (!savedFids.has(fid)) return true;
    }
    
    return false;
  }, [selectedUsers, savedUsers, pack]);
  
  // Fetch My 37 pack and load local state
  const fetchOrCreatePack = useCallback(async () => {
    if (!user?.fid || hasLoadedRef.current) return;

    try {
      setLoading(true);
      setError(null);
      hasLoadedRef.current = true;

      // First, load from localStorage
      const savedUsers = localStorage.getItem("my37SelectedUsers");
      if (savedUsers) {
        try {
          const parsed = JSON.parse(savedUsers);
          setSelectedUsers(parsed);
        } catch (e) {
          console.error("Error parsing saved users:", e);
        }
      }

      // Then, try to find existing "My 37" pack in database
      const packsResponse = await fetch(`/api/curator-packs?creatorFid=${user.fid}`);
      if (packsResponse.ok) {
        const packsData = await packsResponse.json();
        const my37Pack = packsData.packs?.find((p: Pack) => p.name === "My 37");
        
        if (my37Pack) {
          // Fetch pack details with users
          const packResponse = await fetch(`/api/curator-packs/${my37Pack.id}`);
          if (packResponse.ok) {
            const packData = await packResponse.json();
            const packUsers = (packData.users || []).map((u: any) => ({
              fid: u.fid,
              username: u.username,
              display_name: u.displayName || u.display_name,
              pfp_url: u.pfpUrl || u.pfp_url,
            }));
            setPack(packData);
            // Use database users if localStorage is empty, otherwise use localStorage
            if (!savedUsers || packUsers.length > 0) {
              setSelectedUsers(packUsers);
              localStorage.setItem("my37SelectedUsers", JSON.stringify(packUsers.map((u: { fid: number; username?: string; display_name?: string; pfp_url?: string }) => ({
                fid: u.fid,
                username: u.username,
                display_name: u.display_name,
                pfp_url: u.pfp_url,
              }))));
            }
            const hasUsers = packUsers.length > 0;
            setIsCollapsed(hasUsers); // Collapse if pack has users
            onPackReady?.(packData.id, hasUsers);
            setLoading(false);
            return;
          }
        }
      }

      // Pack doesn't exist yet - use localStorage state if available
      setLoading(false);
    } catch (err: any) {
      console.error("Error fetching pack:", err);
      setError(err.message || "Failed to load pack");
      setLoading(false);
      hasLoadedRef.current = false; // Reset on error so we can retry
    }
  }, [user?.fid, onPackReady]);

  // Create new My 37 pack
  const createPack = async (initialUsers: UserSuggestion[]) => {
    if (!user?.fid) return;
    
    // Don't create pack if no users
    if (initialUsers.length === 0) {
      return;
    }

    try {
      setSaving(true);
      setError(null);
      
      const fids = initialUsers.map((u) => u.fid!).filter((fid) => fid !== undefined);
      
      if (fids.length === 0) {
        throw new Error("No valid users selected");
      }
      
      const userData: Record<number, { username?: string; displayName?: string; pfpUrl?: string }> = {};
      for (const selectedUser of initialUsers) {
        if (selectedUser.fid) {
          userData[selectedUser.fid] = {
            username: selectedUser.username,
            displayName: selectedUser.display_name,
            pfpUrl: selectedUser.pfp_url,
          };
        }
      }

      const response = await fetch("/api/curator-packs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "My 37",
          description: "Your selected 37 users",
          fids,
          userData,
          isPublic: false,
          creatorFid: user.fid,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to create pack (${response.status})`);
      }

      const data = await response.json();
      setPack(data.pack);
      setSelectedUsers(initialUsers);
      setSavedUsers(initialUsers); // Update saved state after save
      setError(null); // Clear any previous errors
      const hasUsers = initialUsers.length > 0;
      setIsCollapsed(hasUsers); // Collapse after successful save
      onPackReady?.(data.pack.id, hasUsers);
    } catch (err: any) {
      console.error("Error creating pack:", err);
      setError(err.message || "Failed to create pack");
    } finally {
      setSaving(false);
    }
  };

  // Update pack with new users
  const updatePack = useCallback(async (newUsers: UserSuggestion[]) => {
    if (!pack || !user?.fid || saving) return;

    try {
      setSaving(true);
      setError(null);

      const fids = newUsers.map((u) => u.fid!).filter((fid) => fid !== undefined);
      
      const userData: Record<number, { username?: string; displayName?: string; pfpUrl?: string }> = {};
      for (const selectedUser of newUsers) {
        if (selectedUser.fid) {
          userData[selectedUser.fid] = {
            username: selectedUser.username,
            displayName: selectedUser.display_name,
            pfpUrl: selectedUser.pfp_url,
          };
        }
      }

      const response = await fetch(`/api/curator-packs/${pack.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "My 37",
          description: "Your selected 37 users",
          fids,
          userData,
          creatorFid: user.fid,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to update pack (${response.status})`);
      }

      const data = await response.json();
      setPack(data.pack);
      setSelectedUsers(newUsers);
      setSavedUsers(newUsers); // Update saved state after save
      setError(null); // Clear any previous errors
      const hasUsers = newUsers.length > 0;
      setIsCollapsed(hasUsers); // Collapse after successful save
      onPackReady?.(data.pack.id, hasUsers);
    } catch (err: any) {
      console.error("Error updating pack:", err);
      setError(err.message || "Failed to update pack");
    } finally {
      setSaving(false);
    }
  }, [pack, user?.fid, saving, onPackReady]);

  // Fetch suggested users from bestfriends
  const fetchSuggestedUsers = useCallback(async () => {
    if (!user?.fid) return;

    try {
      const response = await fetch(`/api/user/suggested?fid=${user.fid}&limit=50`);
      if (response.ok) {
        const data = await response.json();
        setSuggestedUsers(data.users || []);
      }
    } catch (error) {
      console.error("Error fetching suggested users:", error);
    }
  }, [user?.fid]);

  useEffect(() => {
    if (user?.fid && !hasLoadedRef.current) {
      fetchOrCreatePack();
      fetchSuggestedUsers();
    }
  }, [user?.fid, fetchOrCreatePack, fetchSuggestedUsers]);

  // Handle user selection - only update local state, don't save to DB
  const handleUsersChange = (newUsers: UserSuggestion[]) => {
    // Enforce maximum limit
    const limitedUsers = newUsers.slice(0, MAX_USERS);
    if (newUsers.length > MAX_USERS) {
      setError(`Maximum ${MAX_USERS} users allowed. Only the first ${MAX_USERS} users will be saved.`);
      setSelectedUsers(limitedUsers);
      // Save to localStorage
      localStorage.setItem("my37SelectedUsers", JSON.stringify(limitedUsers.map(u => ({
        fid: u.fid,
        username: u.username,
        display_name: u.display_name,
        pfp_url: u.pfp_url,
      }))));
      return;
    }
    setError(null);
    setSelectedUsers(newUsers);
    // Save to localStorage only
    localStorage.setItem("my37SelectedUsers", JSON.stringify(newUsers.map(u => ({
      fid: u.fid,
      username: u.username,
      display_name: u.display_name,
      pfp_url: u.pfp_url,
    }))));
  };

  // Save to database when user clicks save button
  const handleSave = async () => {
    if (!user?.fid || saving) return;
    
    if (selectedUsers.length === 0) {
      setError("Please select at least one user");
      return;
    }

    if (selectedUsers.length > MAX_USERS) {
      setError(`Maximum ${MAX_USERS} users allowed`);
      return;
    }

    try {
      setSaving(true);
      setError(null);

      if (pack) {
        await updatePack(selectedUsers);
      } else {
        await createPack(selectedUsers);
      }
    } catch (err: any) {
      console.error("Error saving pack:", err);
      setError(err.message || "Failed to save pack");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-500 dark:text-gray-400">
        Loading My 37...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-8 text-center text-gray-500 dark:text-gray-400">
        Please sign in to use My 37
      </div>
    );
  }

  return (
    <>
      {isCollapsed ? (
        <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-black">
          <div className="px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between">
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="flex-1 flex items-center gap-2 text-left hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors -ml-3 sm:-ml-4 pl-3 sm:pl-4 py-2 sm:py-3 -my-2 sm:-my-3"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  My 37
                </span>
                {selectedUsers.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full">
                      {selectedUsers.length}
                    </span>
                    {hasUnsavedChanges && (
                      <span className="px-1.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                        unsaved
                      </span>
                    )}
                  </div>
                )}
              </div>
            </button>
            <div className="flex items-center gap-3">
              <div 
                className="flex items-center gap-2"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  id="hideRecastsCollapsed"
                  checked={hideRecasts}
                  onChange={(e) => {
                    const newValue = e.target.checked;
                    setHideRecasts(newValue);
                    localStorage.setItem("my37HideRecasts", newValue.toString());
                    // Trigger feed refresh by dispatching event
                    window.dispatchEvent(new CustomEvent("my37PreferencesChanged"));
                  }}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                />
                <label htmlFor="hideRecastsCollapsed" className="text-xs text-gray-600 dark:text-gray-400 cursor-pointer whitespace-nowrap">
                  Hide recasts
                </label>
              </div>
              <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                aria-label="Expand"
              >
                <svg
                  className={`w-4 h-4 transition-transform ${
                    isCollapsed ? "" : "rotate-180"
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-4 sm:mb-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
          <div className="p-4 sm:p-6">
            <div 
              className="mb-4 cursor-pointer flex items-center justify-between"
              onClick={() => setIsCollapsed(!isCollapsed)}
            >
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">
                  My 37
                </h3>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  Select up to {MAX_USERS} users for your personalized feed
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div 
                  className="flex items-center gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    id="hideRecastsExpanded"
                    checked={hideRecasts}
                    onChange={(e) => {
                      const newValue = e.target.checked;
                      setHideRecasts(newValue);
                      localStorage.setItem("my37HideRecasts", newValue.toString());
                      // Trigger feed refresh by dispatching event
                      window.dispatchEvent(new CustomEvent("my37PreferencesChanged"));
                    }}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                  />
                  <label htmlFor="hideRecastsExpanded" className="text-xs text-gray-600 dark:text-gray-400 cursor-pointer whitespace-nowrap">
                    Hide recasts
                  </label>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsCollapsed(!isCollapsed);
                  }}
                  className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                  aria-label="Collapse"
                >
                  <svg
                    className="w-5 h-5 transition-transform rotate-180"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            )}

            {saving && (
              <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-blue-600 dark:text-blue-400">
                Saving...
              </div>
            )}

            {/* Save button */}
            <div className="mb-4 flex items-center justify-between">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {pack ? "Changes saved locally. Click Save to update your feed." : "Select users and click Save to create your feed."}
              </div>
              <button
                onClick={handleSave}
                disabled={saving || selectedUsers.length === 0 || selectedUsers.length > MAX_USERS}
                className={`px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium ${
                  hasUnsavedChanges
                    ? "bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-700"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>

            {/* User Selection */}
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2 text-gray-900 dark:text-gray-100">
                Selected Users ({selectedUsers.length}/{MAX_USERS})
              </label>
              <UserSearchInput
                selectedUsers={selectedUsers}
                onSelectUsers={handleUsersChange}
                placeholder="Search users by username..."
              />
            </div>

            {/* Suggested Users */}
            {suggestedUsers.length > 0 && (
              <div className="mb-4">
                <label className="block text-sm font-semibold mb-2 text-gray-900 dark:text-gray-100">
                  Suggested Users
                </label>
                <div className="max-h-60 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-2">
                  <div className="flex flex-wrap gap-2">
                    {suggestedUsers
                      .filter((u) => !selectedUsers.find((su) => su.fid === u.fid))
                      .slice(0, 50)
                      .map((user) => (
                        <button
                          key={user.fid}
                          onClick={() => {
                            if (selectedUsers.length < MAX_USERS) {
                              handleUsersChange([...selectedUsers, user]);
                            } else {
                              setError(`Maximum ${MAX_USERS} users allowed`);
                            }
                          }}
                          disabled={selectedUsers.length >= MAX_USERS}
                          className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <img
                            src={user.pfp_url || "/default-avatar.png"}
                            alt={user.username}
                            className="w-6 h-6 rounded-full"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            {user.display_name || user.username}
                          </span>
                          <span className="text-xs text-blue-600 dark:text-blue-400">+</span>
                        </button>
                      ))}
                  </div>
                </div>
              </div>
            )}

            {/* Selected Users Display */}
            {selectedUsers.length > 0 && (
              <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {selectedUsers.length} {selectedUsers.length === 1 ? "user" : "users"} selected
                  </span>
                  {selectedUsers.length >= MAX_USERS && (
                    <span className="text-xs text-amber-600 dark:text-amber-400">
                      Maximum reached
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

