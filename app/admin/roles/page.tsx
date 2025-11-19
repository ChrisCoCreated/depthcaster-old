"use client";

import { useEffect, useState, useCallback } from "react";
import { useNeynarContext } from "@neynar/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AvatarImage } from "@/app/components/AvatarImage";

interface UserWithRoles {
  fid: number;
  username: string | null;
  displayName: string | null;
  pfpUrl: string | null;
  roles: string[];
  lastActivity: string | null;
}

const VALID_ROLES = ["tester", "curator", "admin", "superadmin"] as const;
type ValidRole = typeof VALID_ROLES[number];

export default function AdminRolesPage() {
  const { user } = useNeynarContext();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [addingRole, setAddingRole] = useState<{ userFid: number; role: string } | null>(null);
  const [removingRole, setRemovingRole] = useState<{ userFid: number; role: string } | null>(null);
  const [addUserQuery, setAddUserQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ fid: number; username: string; display_name: string; pfp_url?: string }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showAddUserSection, setShowAddUserSection] = useState(false);

  useEffect(() => {
    const checkAdminAccess = async () => {
      if (!user?.fid) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/admin/check?fid=${user.fid}`);
        const data = await response.json();
        
        if (data.isAdmin) {
          setIsAdmin(true);
          loadUsers();
        } else {
          setIsAdmin(false);
          router.push("/");
        }
      } catch (error) {
        console.error("Failed to check admin access:", error);
        setIsAdmin(false);
        router.push("/");
      } finally {
        setIsLoading(false);
      }
    };

    checkAdminAccess();
  }, [user, router]);

  const loadUsers = async () => {
    if (!user?.fid) return;
    
    setIsLoadingUsers(true);
    try {
      const url = searchQuery
        ? `/api/admin/roles?adminFid=${user.fid}&q=${encodeURIComponent(searchQuery)}`
        : `/api/admin/roles?adminFid=${user.fid}`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (response.ok) {
        setUsers(data.users || []);
      } else {
        setMessage({ type: "error", text: data.error || "Failed to load users" });
      }
    } catch (error: any) {
      console.error("Failed to load users:", error);
      setMessage({ type: "error", text: error.message || "Failed to load users" });
    } finally {
      setIsLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (isAdmin && user?.fid) {
      const timeoutId = setTimeout(() => {
        loadUsers();
      }, 300); // Debounce search
      return () => clearTimeout(timeoutId);
    }
  }, [searchQuery, isAdmin, user?.fid]);

  const handleAddRole = async (userFid: number, role: ValidRole) => {
    if (!user?.fid) return;
    
    setAddingRole({ userFid, role });
    setMessage(null);
    
    try {
      const response = await fetch("/api/admin/roles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          adminFid: user.fid,
          userFid,
          role,
        }),
      });

      const data = await response.json();
      
      if (response.ok) {
        setMessage({ type: "success", text: data.message || `Role "${role}" added successfully` });
        loadUsers();
      } else {
        setMessage({ type: "error", text: data.error || "Failed to add role" });
      }
    } catch (error: any) {
      console.error("Failed to add role:", error);
      setMessage({ type: "error", text: error.message || "Failed to add role" });
    } finally {
      setAddingRole(null);
    }
  };

  const handleRemoveRole = async (userFid: number, role: string) => {
    if (!user?.fid) return;
    
    if (!confirm(`Are you sure you want to remove the "${role}" role from this user?`)) {
      return;
    }
    
    setRemovingRole({ userFid, role });
    setMessage(null);
    
    try {
      const response = await fetch(
        `/api/admin/roles?adminFid=${user.fid}&userFid=${userFid}&role=${encodeURIComponent(role)}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();
      
      if (response.ok) {
        setMessage({ type: "success", text: data.message || `Role "${role}" removed successfully` });
        loadUsers();
      } else {
        setMessage({ type: "error", text: data.error || "Failed to remove role" });
      }
    } catch (error: any) {
      console.error("Failed to remove role:", error);
      setMessage({ type: "error", text: error.message || "Failed to remove role" });
    } finally {
      setRemovingRole(null);
    }
  };

  const searchFarcasterUsers = useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      // Check if query is a FID (numeric)
      const fidMatch = query.match(/^\d+$/);
      if (fidMatch) {
        // Search by FID
        const fid = parseInt(fidMatch[0]);
        const response = await fetch(`/api/user/${fid}`);
        if (response.ok) {
          const user = await response.json();
          setSearchResults([{
            fid: user.fid,
            username: user.username || "",
            display_name: user.display_name || "",
            pfp_url: user.pfp_url,
          }]);
        } else {
          setSearchResults([]);
        }
      } else {
        // Search by username
        const params = new URLSearchParams({
          q: query,
          limit: "10",
        });
        if (user?.fid) {
          params.append("viewerFid", user.fid.toString());
        }

        const response = await fetch(`/api/user/search?${params}`);
        if (response.ok) {
          const data = await response.json();
          setSearchResults((data.users || []).map((u: any) => ({
            fid: u.fid,
            username: u.username || "",
            display_name: u.display_name || "",
            pfp_url: u.pfp_url,
          })));
        } else {
          setSearchResults([]);
        }
      }
    } catch (error) {
      console.error("Error searching users:", error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [user?.fid]);

  useEffect(() => {
    if (!showAddUserSection) {
      setAddUserQuery("");
      setSearchResults([]);
      return;
    }

    const timeoutId = setTimeout(() => {
      if (addUserQuery) {
        searchFarcasterUsers(addUserQuery);
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [addUserQuery, showAddUserSection, searchFarcasterUsers]);

  const handleAddUserWithRole = async (userFid: number, role: ValidRole) => {
    if (!user?.fid) return;
    
    setAddingRole({ userFid, role });
    setMessage(null);
    
    try {
      const response = await fetch("/api/admin/roles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          adminFid: user.fid,
          userFid,
          role,
        }),
      });

      const data = await response.json();
      
      if (response.ok) {
        setMessage({ type: "success", text: data.message || `Role "${role}" added successfully` });
        setAddUserQuery("");
        setSearchResults([]);
        loadUsers();
      } else {
        setMessage({ type: "error", text: data.error || "Failed to add role" });
      }
    } catch (error: any) {
      console.error("Failed to add role:", error);
      setMessage({ type: "error", text: error.message || "Failed to add role" });
    } finally {
      setAddingRole(null);
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case "superadmin":
        return "bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200 border-red-300 dark:border-red-700";
      case "admin":
        return "bg-purple-100 dark:bg-purple-900/20 text-purple-800 dark:text-purple-200 border-purple-300 dark:border-purple-700";
      case "curator":
        return "bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 border-blue-300 dark:border-blue-700";
      case "tester":
        return "bg-orange-100 dark:bg-orange-900/20 text-orange-800 dark:text-orange-200 border-orange-300 dark:border-orange-700";
      default:
        return "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-700";
    }
  };

  const formatLastActivity = (lastActivity: string | null): string => {
    if (!lastActivity) return "Never";
    
    try {
      const date = new Date(lastActivity);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);
      
      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      
      // For older dates, show the date
      return date.toLocaleDateString(undefined, { 
        month: 'short', 
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
      });
    } catch {
      return "Unknown";
    }
  };

  if (!user || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-600">Access Denied</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <Link
            href="/admin"
            className="text-blue-600 dark:text-blue-400 hover:underline mb-4 inline-block"
          >
            ← Back to Admin Panel
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            User Roles Management
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Manage user roles: curator, admin, superadmin, and tester
          </p>
        </div>

        {message && (
          <div
            className={`mb-6 p-4 rounded-lg border ${
              message.type === "success"
                ? "bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200 border-green-300 dark:border-green-700"
                : "bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200 border-red-300 dark:border-red-700"
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6 mb-6">
          <div className="flex gap-4 items-center mb-4">
            <input
              type="text"
              placeholder="Search users by username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={loadUsers}
              disabled={isLoadingUsers}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoadingUsers ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Add Farcaster User
            </h2>
            <button
              onClick={() => {
                setShowAddUserSection(!showAddUserSection);
                if (showAddUserSection) {
                  setAddUserQuery("");
                  setSearchResults([]);
                }
              }}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
            >
              {showAddUserSection ? "Cancel" : "+ Add User"}
            </button>
          </div>

          {showAddUserSection && (
            <div className="space-y-4">
              <div>
                <input
                  type="text"
                  placeholder="Search by username or enter FID (e.g., @username or 12345)"
                  value={addUserQuery}
                  onChange={(e) => setAddUserQuery(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                  Search for any Farcaster user by username or FID. You can add roles to users even if they&apos;re not in the database yet.
                </p>
              </div>

              {isSearching && (
                <div className="text-center py-4 text-gray-500">Searching...</div>
              )}

              {!isSearching && searchResults.length > 0 && (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {searchResults.map((result) => {
                    // Check if user already has roles
                    const existingUser = users.find((u) => u.fid === result.fid);
                    const existingRoles = existingUser?.roles || [];

                    return (
                      <div
                        key={result.fid}
                        className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3 flex-1">
                            <Link href={`/profile/${result.fid}`} className="flex-shrink-0">
                              <AvatarImage
                                src={result.pfp_url}
                                alt={result.username || "User"}
                                size={40}
                                className="w-10 h-10 rounded-full hover:opacity-80 transition-opacity cursor-pointer"
                              />
                            </Link>
                            <div className="flex-1">
                              <Link 
                                href={`/profile/${result.fid}`}
                                className="font-semibold text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                              >
                                {result.display_name || result.username || `FID: ${result.fid}`}
                              </Link>
                              {result.username && (
                                <Link 
                                  href={`/profile/${result.fid}`}
                                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:underline block"
                                >
                                  @{result.username}
                                </Link>
                              )}
                              <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                FID: {result.fid}
                              </div>
                              {existingUser?.lastActivity && (
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  Last active: {formatLastActivity(existingUser.lastActivity)}
                                </div>
                              )}
                              {existingRoles.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {existingRoles.map((role) => (
                                    <span
                                      key={role}
                                      className={`px-2 py-0.5 rounded text-xs font-medium border ${getRoleColor(role)}`}
                                    >
                                      {role}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex gap-2 flex-wrap">
                            {VALID_ROLES.filter(
                              (role) => !existingRoles.includes(role)
                            ).map((role) => (
                              <button
                                key={role}
                                onClick={() => handleAddUserWithRole(result.fid, role)}
                                disabled={
                                  addingRole?.userFid === result.fid &&
                                  addingRole?.role === role
                                }
                                className="px-3 py-1 text-xs bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-green-300 dark:border-green-700"
                              >
                                {addingRole?.userFid === result.fid &&
                                addingRole?.role === role
                                  ? "Adding..."
                                  : `+ ${role}`}
                              </button>
                            ))}
                            {existingRoles.length === VALID_ROLES.length && (
                              <span className="text-xs text-gray-500 dark:text-gray-400 px-2 py-1">
                                All roles assigned
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {!isSearching && addUserQuery.length >= 2 && searchResults.length === 0 && (
                <div className="text-center py-4 text-gray-500">
                  No users found. Try a different search term or FID.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Users ({users.length})
          </h2>

          {isLoadingUsers ? (
            <div className="text-center py-8 text-gray-500">Loading users...</div>
          ) : users.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {searchQuery ? "No users found matching your search." : "No users found."}
            </div>
          ) : (
            <div className="space-y-4">
              {users.map((userWithRoles) => (
                <div
                  key={userWithRoles.fid}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <Link href={`/profile/${userWithRoles.fid}`} className="flex-shrink-0">
                        <AvatarImage
                          src={userWithRoles.pfpUrl}
                          alt={userWithRoles.username || "User"}
                          size={40}
                          className="w-10 h-10 rounded-full hover:opacity-80 transition-opacity cursor-pointer"
                        />
                      </Link>
                      <div className="flex-1">
                        <Link 
                          href={`/profile/${userWithRoles.fid}`}
                          className="font-semibold text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                        >
                          {userWithRoles.displayName || userWithRoles.username || `FID: ${userWithRoles.fid}`}
                        </Link>
                        {userWithRoles.username && (
                          <Link 
                            href={`/profile/${userWithRoles.fid}`}
                            className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:underline block"
                          >
                            @{userWithRoles.username}
                          </Link>
                        )}
                        <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                          FID: {userWithRoles.fid}
                        </div>
                        {userWithRoles.lastActivity && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Last active: {formatLastActivity(userWithRoles.lastActivity)}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 items-end">
                      <div className="flex flex-wrap gap-2">
                        {userWithRoles.roles.length > 0 ? (
                          userWithRoles.roles.map((role) => (
                            <div
                              key={role}
                              className={`px-3 py-1 rounded-full text-xs font-medium border ${getRoleColor(role)} flex items-center gap-2`}
                            >
                              <span>{role}</span>
                              <button
                                onClick={() => handleRemoveRole(userWithRoles.fid, role)}
                                disabled={
                                  removingRole?.userFid === userWithRoles.fid &&
                                  removingRole?.role === role
                                }
                                className="hover:opacity-70 disabled:opacity-50"
                                title={`Remove ${role} role`}
                              >
                                ×
                              </button>
                            </div>
                          ))
                        ) : (
                          <span className="text-sm text-gray-500 dark:text-gray-400">No roles</span>
                        )}
                      </div>

                      <div className="flex gap-2 flex-wrap">
                        {VALID_ROLES.filter(
                          (role) => !userWithRoles.roles.includes(role)
                        ).map((role) => (
                          <button
                            key={role}
                            onClick={() => handleAddRole(userWithRoles.fid, role)}
                            disabled={
                              addingRole?.userFid === userWithRoles.fid &&
                              addingRole?.role === role
                            }
                            className="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            {addingRole?.userFid === userWithRoles.fid &&
                            addingRole?.role === role
                              ? "Adding..."
                              : `+ ${role}`}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

