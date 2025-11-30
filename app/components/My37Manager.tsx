"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNeynarContext } from "@neynar/react";
import { UserSearchInput } from "./UserSearchInput";
import { AvatarImage } from "./AvatarImage";
import { getUserRoles, hasPlusRole } from "@/lib/roles";
import { getMaxMyUsers } from "@/lib/plus-features";

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
  const [maxUsers, setMaxUsers] = useState(7); // Default to 7, will be updated based on role
  const [feedName, setFeedName] = useState("My 7"); // Default to "My 7", will be updated based on role
  const [hideRecasts, setHideRecasts] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("my37HideRecasts");
      return saved === "true";
    }
    return false;
  });

  // Track if we've already loaded to prevent re-fetching
  const hasLoadedRef = useRef<boolean>(false);
  // Track debounce timer for auto-save
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Track if there's a pending auto-save or failed save
  const [autoSaveError, setAutoSaveError] = useState<string | null>(null);
  
  // Check if there are pending changes (pending save or failed save)
  const hasPendingChanges = useMemo(() => {
    if (saving) return true; // Currently saving
    if (autoSaveError) return true; // Last auto-save failed
    if (!pack) return false; // No pack means nothing saved yet
    if (selectedUsers.length !== savedUsers.length) return true;
    
    const selectedFids = new Set(selectedUsers.map(u => u.fid).filter(Boolean));
    const savedFids = new Set(savedUsers.map(u => u.fid).filter(Boolean));
    
    if (selectedFids.size !== savedFids.size) return true;
    
    for (const fid of selectedFids) {
      if (!savedFids.has(fid)) return true;
    }
    
    return false;
  }, [selectedUsers, savedUsers, pack, saving, autoSaveError]);
  
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

      // Then, try to find existing "My X" pack in database (could be "My 7" or "My 37")
      const packsResponse = await fetch(`/api/curator-packs?creatorFid=${user.fid}`);
      if (packsResponse.ok) {
        const packsData = await packsResponse.json();
        // Look for "My 37" first (for backward compatibility), then "My 7"
        const my37Pack = packsData.packs?.find((p: Pack) => p.name === "My 37" || p.name === "My 7");
        
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
  const createPack = useCallback(async (initialUsers: UserSuggestion[], isAutoSave = false) => {
    if (!user?.fid) return;
    
    // Don't create pack if no users
    if (initialUsers.length === 0) {
      return;
    }

    try {
      setSaving(true);
      if (isAutoSave) {
        setAutoSaveError(null);
      } else {
        setError(null);
      }
      
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
          name: feedName,
          description: `Your selected ${maxUsers} users`,
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
      const hasUsers = initialUsers.length > 0;
      if (isAutoSave) {
        setAutoSaveError(null);
      } else {
        setError(null); // Clear any previous errors
        // Only collapse on manual save, not auto-save
        setIsCollapsed(hasUsers);
      }
      onPackReady?.(data.pack.id, hasUsers);
    } catch (err: any) {
      console.error("Error creating pack:", err);
      const errorMessage = err.message || "Failed to create pack";
      if (isAutoSave) {
        setAutoSaveError(errorMessage);
      } else {
        setError(errorMessage);
      }
      throw err; // Re-throw so caller can handle if needed
    } finally {
      setSaving(false);
    }
  }, [user?.fid, onPackReady, feedName, maxUsers]);

  // Update pack with new users
  const updatePack = useCallback(async (newUsers: UserSuggestion[], isAutoSave = false) => {
    if (!pack || !user?.fid || saving) return;

    try {
      setSaving(true);
      if (isAutoSave) {
        setAutoSaveError(null);
      } else {
        setError(null);
      }

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
          name: feedName,
          description: `Your selected ${maxUsers} users`,
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
      const hasUsers = newUsers.length > 0;
      if (isAutoSave) {
        setAutoSaveError(null);
      } else {
        setError(null); // Clear any previous errors
        // Only collapse on manual save, not auto-save
        setIsCollapsed(hasUsers);
      }
      onPackReady?.(data.pack.id, hasUsers);
    } catch (err: any) {
      console.error("Error updating pack:", err);
      const errorMessage = err.message || "Failed to update pack";
      if (isAutoSave) {
        setAutoSaveError(errorMessage);
      } else {
        setError(errorMessage);
      }
      throw err; // Re-throw so caller can handle if needed
    } finally {
      setSaving(false);
    }
  }, [pack, user?.fid, onPackReady, feedName, maxUsers, saving]);

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

  // Fetch user's plus role status and set max users
  useEffect(() => {
    const fetchUserRole = async () => {
      if (!user?.fid) {
        setMaxUsers(7);
        setFeedName("My 7");
        return;
      }

      try {
        const roles = await getUserRoles(user.fid);
        const hasPlus = hasPlusRole(roles);
        const max = getMaxMyUsers(hasPlus);
        setMaxUsers(max);
        setFeedName(`My ${max}`);
      } catch (error) {
        console.error("Error fetching user role:", error);
        // Default to 7 on error
        setMaxUsers(7);
        setFeedName("My 7");
      }
    };

    fetchUserRole();
  }, [user?.fid]);

  useEffect(() => {
    if (user?.fid && !hasLoadedRef.current) {
      fetchOrCreatePack();
      fetchSuggestedUsers();
    }
  }, [user?.fid, fetchOrCreatePack, fetchSuggestedUsers]);

  // Cleanup auto-save timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, []);

  // Debounced auto-save function
  const triggerAutoSave = useCallback((usersToSave: UserSuggestion[]) => {
    // Clear any existing timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    // Skip auto-save if:
    // - No user authenticated
    // - Currently saving (manual save in progress)
    // - Still loading initial data
    if (!user?.fid || saving || loading) {
      return;
    }

    // Set up debounced auto-save (1 second delay)
    autoSaveTimerRef.current = setTimeout(async () => {
      // Double-check we're not saving before executing
      if (saving) return;
      
      // Skip if no users and no pack exists
      if (usersToSave.length === 0 && !pack) {
        return;
      }

      try {
        if (pack) {
          await updatePack(usersToSave, true);
        } else if (usersToSave.length > 0) {
          await createPack(usersToSave, true);
        }
      } catch (err) {
        // Error already handled in createPack/updatePack with autoSaveError state
        console.error("Auto-save failed:", err);
      }
    }, 1000);
  }, [user?.fid, pack, saving, loading, updatePack, createPack]);

  // Handle user selection - update local state and trigger auto-save
  const handleUsersChange = useCallback((newUsers: UserSuggestion[]) => {
    // Enforce maximum limit
    const limitedUsers = newUsers.slice(0, maxUsers);
    if (newUsers.length > maxUsers) {
      setError(`Maximum ${maxUsers} users allowed. Only the first ${maxUsers} users will be saved.`);
      setSelectedUsers(limitedUsers);
      // Save to localStorage
      localStorage.setItem("my37SelectedUsers", JSON.stringify(limitedUsers.map(u => ({
        fid: u.fid,
        username: u.username,
        display_name: u.display_name,
        pfp_url: u.pfp_url,
      }))));
      // Trigger auto-save
      triggerAutoSave(limitedUsers);
      return;
    }
    setError(null);
    setSelectedUsers(newUsers);
    // Save to localStorage
    localStorage.setItem("my37SelectedUsers", JSON.stringify(newUsers.map(u => ({
      fid: u.fid,
      username: u.username,
      display_name: u.display_name,
      pfp_url: u.pfp_url,
    }))));
    // Trigger auto-save
    triggerAutoSave(newUsers);
  }, [triggerAutoSave, maxUsers]);

  // Save to database when user clicks save button
  const handleSave = async () => {
    if (!user?.fid || saving) return;
    
    // Cancel any pending auto-save
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    
    if (selectedUsers.length === 0) {
      setError("Please select at least one user");
      return;
    }

    if (selectedUsers.length > maxUsers) {
      setError(`Maximum ${maxUsers} users allowed`);
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setAutoSaveError(null); // Clear auto-save errors on manual save

      if (pack) {
        await updatePack(selectedUsers, false);
      } else {
        await createPack(selectedUsers, false);
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
        Loading {feedName}...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-8 text-center text-gray-500 dark:text-gray-400">
        Please sign in to use {feedName}
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
                  {feedName}
                </span>
                {selectedUsers.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full">
                      {selectedUsers.length}
                    </span>
                    {hasPendingChanges && (
                      <span className="px-1.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                        {autoSaveError ? "error" : saving ? "saving" : "pending"}
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
                  {feedName}
                </h3>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  Select up to {maxUsers} users for your personalized feed
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

            {autoSaveError && (
              <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-600 dark:text-amber-400">
                Auto-save failed: {autoSaveError}. Click Save to retry.
              </div>
            )}

            {/* Save button */}
            <div className="mb-4 flex items-center justify-between">
              <div className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
                {saving && (
                  <svg className="animate-spin h-4 w-4 text-blue-600 dark:text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
                <span>
                  {pack ? "Changes are saved automatically" : "Select users and click Save to create your feed."}
                </span>
              </div>
              <button
                onClick={handleSave}
                disabled={saving || selectedUsers.length === 0 || selectedUsers.length > maxUsers}
                className={`px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium ${
                  hasPendingChanges
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
                Selected Users ({selectedUsers.length}/{maxUsers})
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
                            if (selectedUsers.length < maxUsers) {
                              handleUsersChange([...selectedUsers, user]);
                            } else {
                              setError(`Maximum ${maxUsers} users allowed`);
                            }
                          }}
                          disabled={selectedUsers.length >= maxUsers}
                          className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <AvatarImage
                            src={user.pfp_url}
                            alt={user.username}
                            size={24}
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
                  {selectedUsers.length >= maxUsers && (
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

