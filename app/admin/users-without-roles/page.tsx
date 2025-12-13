"use client";

import { useEffect, useState } from "react";
import { useNeynarContext } from "@neynar/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AvatarImage } from "@/app/components/AvatarImage";

interface UserWithoutRoles {
  fid: number;
  username: string | null;
  displayName: string | null;
  pfpUrl: string | null;
  roles: string[];
  lastLogin: string | null;
}

type FilterType = "curator" | "plus" | "both";

export default function AdminUsersWithoutRolesPage() {
  const { user } = useNeynarContext();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [users, setUsers] = useState<UserWithoutRoles[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [filter, setFilter] = useState<FilterType>("both");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

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
      const params = new URLSearchParams({
        adminFid: user.fid.toString(),
        filter: filter,
      });
      
      if (searchQuery) {
        params.append("q", searchQuery);
      }
      
      const response = await fetch(`/api/admin/users-without-roles?${params}`);
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
  }, [searchQuery, filter, isAdmin, user?.fid]);

  const formatLastLogin = (lastLogin: string | null): string => {
    if (!lastLogin) return "Never";
    
    try {
      const date = new Date(lastLogin);
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
      case "plus":
        return "bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200 border-green-300 dark:border-green-700";
      default:
        return "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-700";
    }
  };

  const getFilterLabel = (filterType: FilterType): string => {
    switch (filterType) {
      case "curator":
        return "Without Curator Role";
      case "plus":
        return "Without Plus Role";
      case "both":
        return "Without Both Roles";
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
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          Users Without Roles
        </h1>
        <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
          Users who have logged into depthcaster but don't have curator or plus roles
        </p>
      </div>

      {message && (
        <div
          className={`mb-6 p-3 sm:p-4 rounded-lg border text-sm sm:text-base ${
            message.type === "success"
              ? "bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200 border-green-300 dark:border-green-700"
              : "bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200 border-red-300 dark:border-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Filter buttons */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4 sm:p-6 mb-6">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Filter
        </h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setFilter("both")}
            className={`px-4 py-2 rounded-lg transition-colors text-sm sm:text-base ${
              filter === "both"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            Without Both Roles
          </button>
          <button
            onClick={() => setFilter("curator")}
            className={`px-4 py-2 rounded-lg transition-colors text-sm sm:text-base ${
              filter === "curator"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            Without Curator Role
          </button>
          <button
            onClick={() => setFilter("plus")}
            className={`px-4 py-2 rounded-lg transition-colors text-sm sm:text-base ${
              filter === "plus"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            Without Plus Role
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4 sm:p-6 mb-6">
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch sm:items-center">
          <input
            type="text"
            placeholder="Search users by username..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 px-4 py-2.5 sm:py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm sm:text-base"
          />
          <button
            onClick={loadUsers}
            disabled={isLoadingUsers}
            className="px-4 py-2.5 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm sm:text-base whitespace-nowrap"
          >
            {isLoadingUsers ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Users list */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4 sm:p-6">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
          {getFilterLabel(filter)} ({users.length})
        </h2>

        {isLoadingUsers ? (
          <div className="text-center py-8 text-gray-500">Loading users...</div>
        ) : users.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {searchQuery ? "No users found matching your search." : `No users found ${getFilterLabel(filter).toLowerCase()}.`}
          </div>
        ) : (
          <div className="space-y-4">
            {users.map((userWithoutRoles) => (
              <div
                key={userWithoutRoles.fid}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 sm:p-5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 w-full sm:w-auto">
                    <Link href={`/profile/${userWithoutRoles.fid}`} className="flex-shrink-0">
                      <AvatarImage
                        src={userWithoutRoles.pfpUrl}
                        alt={userWithoutRoles.username || "User"}
                        size={40}
                        className="w-10 h-10 rounded-full hover:opacity-80 transition-opacity cursor-pointer"
                      />
                    </Link>
                    <div className="flex-1">
                      <Link 
                        href={`/profile/${userWithoutRoles.fid}`}
                        className="font-semibold text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                      >
                        {userWithoutRoles.displayName || userWithoutRoles.username || `FID: ${userWithoutRoles.fid}`}
                      </Link>
                      {userWithoutRoles.username && (
                        <Link 
                          href={`/profile/${userWithoutRoles.fid}`}
                          className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:underline block"
                        >
                          @{userWithoutRoles.username}
                        </Link>
                      )}
                      <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                        FID: {userWithoutRoles.fid}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Last login: {formatLastLogin(userWithoutRoles.lastLogin)}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 items-start sm:items-end w-full sm:w-auto">
                    <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                      {userWithoutRoles.roles.length > 0 ? (
                        userWithoutRoles.roles.map((role) => (
                          <span
                            key={role}
                            className={`px-3 py-1.5 sm:py-1 rounded-full text-xs font-medium border ${getRoleColor(role)}`}
                          >
                            {role}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-gray-500 dark:text-gray-400">No roles</span>
                      )}
                    </div>
                    <Link
                      href={`/admin/roles?q=${encodeURIComponent(userWithoutRoles.username || userWithoutRoles.fid.toString())}`}
                      className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Manage roles →
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}








