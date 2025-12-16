"use client";

import { useEffect, useState } from "react";
import { useNeynarContext } from "@neynar/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AvatarImage } from "@/app/components/AvatarImage";

interface Statistics {
  period: string;
  users: {
    total: number;
    new: number;
    withRoles: number;
    uniqueActiveUsers: number;
    miniappOnlyUsers?: number;
  };
  activeUsers: Array<{
    date: string;
    users: Array<{
      fid: number;
      username: string | null;
      displayName: string | null;
      pfpUrl: string | null;
      curated: boolean;
      onchain: boolean;
    }>;
  }>;
  inactiveCurators: {
    notVisited7Days: Array<{
      fid: number;
      username: string | null;
      displayName: string | null;
      pfpUrl: string | null;
      lastVisit: string;
    }>;
    notVisited14Days: Array<{
      fid: number;
      username: string | null;
      displayName: string | null;
      pfpUrl: string | null;
      lastVisit: string;
    }>;
    neverSignedIn: Array<{
      fid: number;
      username: string | null;
      displayName: string | null;
      pfpUrl: string | null;
    }>;
    miniappInstalled: Array<{
      fid: number;
      username: string | null;
      displayName: string | null;
      pfpUrl: string | null;
    }>;
    miniappNotInstalled: Array<{
      fid: number;
      username: string | null;
      displayName: string | null;
      pfpUrl: string | null;
    }>;
  };
}

export default function UserStatisticsPage() {
  const { user } = useNeynarContext();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [period, setPeriod] = useState<string>("all-time");
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    activeUsers: true,
    inactiveCurators: true,
    miniappStatus: true,
    miniappNotifications: true,
  });
  const [miniview, setMiniview] = useState(true);
  const [selectedUserFid, setSelectedUserFid] = useState<number | null>(null);
  const [userSearchQuery, setUserSearchQuery] = useState<string>("");
  const [miniappNotifications, setMiniappNotifications] = useState<Array<{
    token: string;
    fid: number;
    created_at: string;
    updated_at: string;
    status?: string;
    [key: string]: any;
  }>>([]);
  const [miniappNotificationsByUser, setMiniappNotificationsByUser] = useState<Map<number, {
    fid: number;
    username: string | null;
    displayName: string | null;
    pfpUrl: string | null;
    notifications: Array<{
      token: string;
      created_at: string;
      updated_at: string;
      status?: string;
    }>;
    currentStatus: string;
    firstEnabled: string | null;
    lastEnabled: string | null;
    lastDisabled: string | null;
  }>>(new Map());
  const [isLoadingMiniappNotifications, setIsLoadingMiniappNotifications] = useState(false);
  const [miniappNotificationsLastUpdated, setMiniappNotificationsLastUpdated] = useState<string | null>(null);

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
          loadStatistics();
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

  useEffect(() => {
    if (isAdmin && user?.fid) {
      loadStatistics();
    }
  }, [period]);

  const loadStatistics = async () => {
    if (!user?.fid) return;

    setIsLoadingStats(true);
    try {
      const response = await fetch(`/api/admin/statistics?fid=${user.fid}&period=${period}`);
      const data = await response.json();

      if (response.ok) {
        setStatistics(data);
      } else {
        console.error("Failed to load statistics:", data.error);
      }
    } catch (error: any) {
      console.error("Failed to load statistics:", error);
    } finally {
      setIsLoadingStats(false);
    }
  };

  useEffect(() => {
    if (isAdmin && user?.fid) {
      loadStatistics();
      loadMiniappNotificationsFromStorage();
    }
  }, [period, isAdmin, user?.fid]);

  const processNotificationsData = async (allTokens: Array<{
    token: string;
    fid: number;
    created_at: string;
    updated_at: string;
    status?: string;
    [key: string]: any;
  }>) => {
    // Group by user FID and fetch user data
    const uniqueFids = Array.from(new Set(allTokens.map(t => t.fid)));
    const userMap = new Map<number, {
      fid: number;
      username: string | null;
      displayName: string | null;
      pfpUrl: string | null;
      notifications: Array<{
        token: string;
        created_at: string;
        updated_at: string;
        status?: string;
      }>;
      currentStatus: string;
      firstEnabled: string | null;
      lastEnabled: string | null;
      lastDisabled: string | null;
    }>();

    // Fetch user data for all unique FIDs
    try {
      const userPromises = uniqueFids.map(async (fid) => {
        try {
          const response = await fetch(`/api/user/${fid}`);
          if (response.ok) {
            const userData = await response.json();
            return { fid, userData };
          }
        } catch (error) {
          console.error(`Failed to fetch user ${fid}:`, error);
        }
        return { fid, userData: null };
      });

      const userResults = await Promise.all(userPromises);

      // Group notifications by FID
      for (const fid of uniqueFids) {
        const userNotifications = allTokens.filter(t => t.fid === fid);
        const userResult = userResults.find(r => r.fid === fid);
        const userData = userResult?.userData;

        // Sort notifications by created_at (oldest first for timeline)
        userNotifications.sort((a, b) => {
          const dateA = new Date(a.created_at).getTime();
          const dateB = new Date(b.created_at).getTime();
          return dateA - dateB;
        });

        // Determine current status (most recent status, or "enabled" if no status field)
        const mostRecent = userNotifications[userNotifications.length - 1];
        const currentStatus = mostRecent?.status || "enabled";

        // Find first enabled, last enabled, last disabled
        let firstEnabled: string | null = null;
        let lastEnabled: string | null = null;
        let lastDisabled: string | null = null;

        for (const notif of userNotifications) {
          const status = notif.status || "enabled";
          if (status === "enabled" || !notif.status) {
            if (!firstEnabled) {
              firstEnabled = notif.created_at;
            }
            lastEnabled = notif.created_at;
          } else if (status === "disabled") {
            lastDisabled = notif.created_at;
          }
        }

        userMap.set(fid, {
          fid,
          username: userData?.username || null,
          displayName: userData?.display_name || null,
          pfpUrl: userData?.pfp_url || null,
          notifications: userNotifications.map(n => ({
            token: n.token,
            created_at: n.created_at,
            updated_at: n.updated_at,
            status: n.status,
          })),
          currentStatus,
          firstEnabled,
          lastEnabled,
          lastDisabled,
        });
      }
    } catch (error) {
      console.error("Failed to fetch user data:", error);
    }

    setMiniappNotificationsByUser(userMap);
  };

  const loadMiniappNotificationsFromStorage = async () => {
    try {
      const stored = localStorage.getItem("miniapp_notifications");
      const lastUpdated = localStorage.getItem("miniapp_notifications_last_updated");
      if (stored) {
        const allTokens = JSON.parse(stored);
        setMiniappNotifications(allTokens);
        await processNotificationsData(allTokens);
      }
      if (lastUpdated) {
        setMiniappNotificationsLastUpdated(lastUpdated);
      }
    } catch (error) {
      console.error("Failed to load miniapp notifications from storage:", error);
    }
  };

  const fetchAllMiniappNotifications = async () => {
    if (!user?.fid) return;

    setIsLoadingMiniappNotifications(true);
    try {
      const allTokens: Array<{
        token: string;
        fid: number;
        created_at: string;
        updated_at: string;
        status?: string;
        [key: string]: any;
      }> = [];
      let cursor: string | null = null;
      let hasMore = true;

      while (hasMore) {
        let url = `/api/admin/miniapp-notifications?fid=${user.fid}&limit=20`;
        if (cursor) {
          url += `&cursor=${cursor}`;
        }

        const response = await fetch(url);
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to fetch notifications");
        }

        const data = await response.json();
        if (data.notification_tokens && Array.isArray(data.notification_tokens)) {
          allTokens.push(...data.notification_tokens);
        }

        cursor = data.next_cursor || null;
        hasMore = data.has_more && !!cursor;
      }

      // Sort by created_at descending (newest first)
      allTokens.sort((a, b) => {
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        return dateB - dateA;
      });

      setMiniappNotifications(allTokens);
      await processNotificationsData(allTokens);
      const now = new Date().toISOString();
      setMiniappNotificationsLastUpdated(now);
      
      // Save to localStorage
      localStorage.setItem("miniapp_notifications", JSON.stringify(allTokens));
      localStorage.setItem("miniapp_notifications_last_updated", now);
    } catch (error: any) {
      console.error("Failed to fetch miniapp notifications:", error);
      alert(`Failed to fetch miniapp notifications: ${error.message}`);
    } finally {
      setIsLoadingMiniappNotifications(false);
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

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(1) + "K";
    return num.toString();
  };

  return (
    <div className="min-h-screen bg-white dark:bg-black p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            User Statistics
          </h1>
          <div className="flex items-center gap-3">
            <Link
              href="/admin/statistics"
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              View Other Stats
            </Link>
            <Link
              href="/admin"
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Back to Admin
            </Link>
          </div>
        </div>

        <div className="mb-6 flex items-end gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Time Period
            </label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
            >
              <option value="all-time">All Time</option>
              <option value="30d">Last 30 Days</option>
              <option value="7d">Last 7 Days</option>
              <option value="24h">Last 24 Hours</option>
            </select>
          </div>
        </div>

        {isLoadingStats ? (
          <div className="text-center py-12">
            <div className="text-gray-500">Loading statistics...</div>
          </div>
        ) : statistics ? (
          <div className="space-y-6">
            {/* Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Signed-In Users (All Time)</h3>
                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-2">
                  {formatNumber(statistics.users.total)}
                </p>
                {statistics.users.new > 0 && (
                  <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                    +{formatNumber(statistics.users.new)} new
                  </p>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1" title="Users who have taken at least one meaningful action in the past 14 days">
                  {formatNumber(statistics.users.uniqueActiveUsers)} D14 Active
                </p>
              </div>

              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Users with Roles</h3>
                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-2">
                  {formatNumber(statistics.users.withRoles)}
                </p>
              </div>

              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">14-Day Active Users (D14 Active)</h3>
                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-2">
                  {formatNumber(statistics.users.uniqueActiveUsers)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1" title="Users who have taken at least one meaningful action in the past 14 days">
                  Core retention metric
                </p>
              </div>

              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Miniapp Notifications</h3>
                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-2">
                  {formatNumber(miniappNotificationsByUser.size)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {formatNumber(miniappNotifications.length)} tokens
                </p>
              </div>
            </div>

            {/* Active Users View - Past 30 Days */}
            {statistics.activeUsers && statistics.activeUsers.length > 0 && (
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <button
                    onClick={() => setExpandedSections(prev => ({ ...prev, activeUsers: !prev.activeUsers }))}
                    className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-gray-100 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    <span className={`transition-transform ${expandedSections.activeUsers ? 'rotate-90' : ''}`}>
                      ▶
                    </span>
                    <span>Active Users (Past 30 Days)</span>
                  </button>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600 dark:text-gray-400">Miniview</label>
                    <button
                      onClick={() => setMiniview(!miniview)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        miniview ? 'bg-accent' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          miniview ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                  Based on qualifying activity events: post/reply, save/curate, follow/add, session depth (≥60s)
                </p>
                {expandedSections.activeUsers && (
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex-1">
                      <input
                        type="text"
                        placeholder="Search by name..."
                        value={userSearchQuery}
                        onChange={(e) => setUserSearchQuery(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                      />
                    </div>
                    {(selectedUserFid !== null || userSearchQuery) && (
                      <button
                        onClick={() => {
                          setSelectedUserFid(null);
                          setUserSearchQuery("");
                        }}
                        className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
                      >
                        Clear Filter
                      </button>
                    )}
                  </div>
                )}
                {expandedSections.activeUsers && (() => {
                  // Filter active users based on selected user and search query
                  const filteredActiveUsers = statistics.activeUsers.map(day => {
                    let filteredUsers = day.users;
                    
                    // Filter by selected user FID
                    if (selectedUserFid !== null) {
                      filteredUsers = filteredUsers.filter(user => user.fid === selectedUserFid);
                    }
                    
                    // Filter by search query
                    if (userSearchQuery.trim()) {
                      const query = userSearchQuery.toLowerCase().trim();
                      filteredUsers = filteredUsers.filter(user => {
                        const displayName = (user.displayName || user.username || `User ${user.fid}`).toLowerCase();
                        return displayName.includes(query);
                      });
                    }
                    
                    return {
                      ...day,
                      users: filteredUsers
                    };
                  });
                  
                  return miniview ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Day/Date
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Users
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                          {filteredActiveUsers.map((day, idx) => {
                            const date = new Date(day.date);
                            const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' });
                            const isToday = date.toDateString() === new Date().toDateString();
                            
                            // Sort users alphabetically by displayName or username
                            const sortedUsers = [...day.users].sort((a, b) => {
                              const aName = (a.displayName || a.username || `User ${a.fid}`).toLowerCase();
                              const bName = (b.displayName || b.username || `User ${b.fid}`).toLowerCase();
                              return aName.localeCompare(bName);
                            });
                            
                            return (
                              <tr
                                key={idx}
                                className={isToday ? 'bg-accent/30 dark:bg-accent/20' : ''}
                              >
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <div className="flex items-center gap-2">
                                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                      {dateStr}
                                    </div>
                                    {isToday && (
                                      <span className="text-xs text-accent-dark dark:text-accent font-medium">(Today)</span>
                                    )}
                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                      {day.users.length > 0 ? (
                                        <span>{day.users.length} active</span>
                                      ) : (
                                        <span className="text-gray-400 dark:text-gray-500 italic">No matches</span>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex flex-wrap gap-1.5">
                                    {sortedUsers.length === 0 ? (
                                      <span className="text-sm text-gray-400 dark:text-gray-500 italic">No users match the filter</span>
                                    ) : (
                                      sortedUsers.map((user) => {
                                        const displayName = user.displayName || user.username || `User ${user.fid}`;
                                        const isSelected = selectedUserFid === user.fid;
                                        return (
                                          <div
                                            key={user.fid}
                                            onClick={() => setSelectedUserFid(isSelected ? null : user.fid)}
                                            className={`relative flex-shrink-0 group cursor-pointer transition-all ${
                                              isSelected ? 'ring-2 ring-accent ring-offset-2' : 'hover:ring-2 hover:ring-gray-300 dark:hover:ring-gray-600'
                                            }`}
                                            title={displayName}
                                          >
                                            <AvatarImage
                                              src={user.pfpUrl}
                                              alt={displayName}
                                              size={32}
                                              className="w-8 h-8 rounded-full object-cover border-2 border-gray-200 dark:border-gray-700"
                                            />
                                            <div className="absolute -bottom-0.5 -right-0.5 flex items-center gap-0.5">
                                              {user.curated && (
                                                <span className="text-yellow-500 text-[10px] bg-white dark:bg-gray-800 rounded-full" title="Curated">
                                                  ⭐
                                                </span>
                                              )}
                                              {user.onchain && (
                                                <span className="text-accent text-[10px] bg-white dark:bg-gray-800 rounded-full" title="Onchain action">
                                                  ⛓️
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {filteredActiveUsers.map((day, idx) => {
                        const date = new Date(day.date);
                        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' });
                        const isToday = date.toDateString() === new Date().toDateString();
                        
                        // Sort users alphabetically by displayName or username
                        const sortedUsers = [...day.users].sort((a, b) => {
                          const aName = (a.displayName || a.username || `User ${a.fid}`).toLowerCase();
                          const bName = (b.displayName || b.username || `User ${b.fid}`).toLowerCase();
                          return aName.localeCompare(bName);
                        });
                        
                        return (
                          <div
                            key={idx}
                            className={`border rounded-lg p-4 ${
                              isToday
                                ? 'border-accent bg-accent/30 dark:bg-accent/20'
                                : 'border-gray-200 dark:border-gray-700'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                  {dateStr}
                                </div>
                                {isToday && (
                                  <span className="text-xs text-accent-dark dark:text-accent font-medium">(Today)</span>
                                )}
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  {day.users.length > 0 ? (
                                    <span>{day.users.length} active</span>
                                  ) : (
                                    <span className="text-gray-400 dark:text-gray-500 italic">No matches</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-1.5 overflow-x-auto pb-1">
                              {sortedUsers.length === 0 ? (
                                <span className="text-sm text-gray-400 dark:text-gray-500 italic">No users match the filter</span>
                              ) : (
                                sortedUsers.map((user) => {
                                  const displayName = user.displayName || user.username || `User ${user.fid}`;
                                  const isSelected = selectedUserFid === user.fid;
                                  return (
                                    <div
                                      key={user.fid}
                                      onClick={() => setSelectedUserFid(isSelected ? null : user.fid)}
                                      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-full border flex-shrink-0 cursor-pointer transition-all ${
                                        isSelected
                                          ? 'bg-accent/40 dark:bg-accent-dark/90 border-accent ring-2 ring-accent ring-offset-1'
                                          : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700'
                                      }`}
                                      style={{ width: '110px', minWidth: '110px', maxWidth: '110px' }}
                                    >
                                      <AvatarImage
                                        src={user.pfpUrl}
                                        alt={displayName}
                                        size={18}
                                        className="w-[18px] h-[18px] rounded-full flex-shrink-0 object-cover"
                                      />
                                      <div className="flex-1 min-w-0">
                                        <div className="text-[11px] font-medium text-gray-900 dark:text-gray-100 truncate">
                                          {displayName}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-0.5 flex-shrink-0">
                                        {user.curated && (
                                          <span className="text-yellow-500 text-[10px]" title="Curated">
                                            ⭐
                                          </span>
                                        )}
                                        {user.onchain && (
                                          <span className="text-accent text-[10px]" title="Onchain action">
                                            ⛓️
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
                {expandedSections.activeUsers && (
                  <div className="mt-4 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                    <div className="flex items-center gap-1">
                      <span>⭐</span>
                      <span>Curated</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span>⛓️</span>
                      <span>Onchain action</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Inactive Curators */}
            {statistics.inactiveCurators && (
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <button
                    onClick={() => setExpandedSections(prev => ({ ...prev, inactiveCurators: !prev.inactiveCurators }))}
                    className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-gray-100 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    <span className={`transition-transform ${expandedSections.inactiveCurators ? 'rotate-90' : ''}`}>
                      ▶
                    </span>
                    <span>Inactive Curators</span>
                  </button>
                </div>
                {expandedSections.inactiveCurators && (
                  <div className="space-y-6">
                    {/* Never Signed In */}
                    {statistics.inactiveCurators.neverSignedIn && statistics.inactiveCurators.neverSignedIn.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                          Never Signed In ({statistics.inactiveCurators.neverSignedIn.length})
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {statistics.inactiveCurators.neverSignedIn.map((curator) => {
                            const displayName = curator.displayName || curator.username || `User ${curator.fid}`;
                            return (
                              <div
                                key={curator.fid}
                                className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
                              >
                                <AvatarImage
                                  src={curator.pfpUrl}
                                  alt={displayName}
                                  size={24}
                                  className="w-6 h-6 rounded-full object-cover"
                                />
                                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                  {displayName}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Not Visited in 14+ Days */}
                    {statistics.inactiveCurators.notVisited14Days && statistics.inactiveCurators.notVisited14Days.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                          Not Visited in 14+ Days ({statistics.inactiveCurators.notVisited14Days.length})
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {statistics.inactiveCurators.notVisited14Days.map((curator) => {
                            const displayName = curator.displayName || curator.username || `User ${curator.fid}`;
                            const lastVisit = new Date(curator.lastVisit);
                            const daysAgo = Math.floor((Date.now() - lastVisit.getTime()) / (1000 * 60 * 60 * 24));
                            return (
                              <div
                                key={curator.fid}
                                className="flex items-center gap-2 px-3 py-2 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg"
                                title={`Last visit: ${lastVisit.toLocaleDateString()} (${daysAgo} days ago)`}
                              >
                                <AvatarImage
                                  src={curator.pfpUrl}
                                  alt={displayName}
                                  size={24}
                                  className="w-6 h-6 rounded-full object-cover"
                                />
                                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                  {displayName}
                                </span>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  ({daysAgo}d ago)
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Not Visited in 7+ Days */}
                    {statistics.inactiveCurators.notVisited7Days && statistics.inactiveCurators.notVisited7Days.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                          Not Visited in 7+ Days ({statistics.inactiveCurators.notVisited7Days.length})
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {statistics.inactiveCurators.notVisited7Days.map((curator) => {
                            const displayName = curator.displayName || curator.username || `User ${curator.fid}`;
                            const lastVisit = new Date(curator.lastVisit);
                            const daysAgo = Math.floor((Date.now() - lastVisit.getTime()) / (1000 * 60 * 60 * 24));
                            return (
                              <div
                                key={curator.fid}
                                className="flex items-center gap-2 px-3 py-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg"
                                title={`Last visit: ${lastVisit.toLocaleDateString()} (${daysAgo} days ago)`}
                              >
                                <AvatarImage
                                  src={curator.pfpUrl}
                                  alt={displayName}
                                  size={24}
                                  className="w-6 h-6 rounded-full object-cover"
                                />
                                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                  {displayName}
                                </span>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  ({daysAgo}d ago)
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                      {(!statistics.inactiveCurators.neverSignedIn || statistics.inactiveCurators.neverSignedIn.length === 0) &&
                      (!statistics.inactiveCurators.notVisited14Days || statistics.inactiveCurators.notVisited14Days.length === 0) &&
                      (!statistics.inactiveCurators.notVisited7Days || statistics.inactiveCurators.notVisited7Days.length === 0) && (
                        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                          <p>All curators have been active recently! 🎉</p>
                        </div>
                      )}

                  </div>
                )}
              </div>
            )}

            {/* Miniapp Installation Status - Separate Section */}
            {statistics.inactiveCurators && (
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <button
                    onClick={() => setExpandedSections(prev => ({ ...prev, miniappStatus: !prev.miniappStatus }))}
                    className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-gray-100 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    <span className={`transition-transform ${expandedSections.miniappStatus ? 'rotate-90' : ''}`}>
                      ▶
                    </span>
                    <span>Miniapp Installation Status</span>
                  </button>
                </div>
                {expandedSections.miniappStatus && (
                  <div className="space-y-6">
                    {/* With Miniapp Installed */}
                    {statistics.inactiveCurators.miniappInstalled && statistics.inactiveCurators.miniappInstalled.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                          Installed ({statistics.inactiveCurators.miniappInstalled.length})
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {statistics.inactiveCurators.miniappInstalled.map((curator) => {
                            const displayName = curator.displayName || curator.username || `User ${curator.fid}`;
                            return (
                              <div
                                key={curator.fid}
                                className="flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg"
                              >
                                <AvatarImage
                                  src={curator.pfpUrl}
                                  alt={displayName}
                                  size={24}
                                  className="w-6 h-6 rounded-full object-cover"
                                />
                                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                  {displayName}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Without Miniapp Installed */}
                    {statistics.inactiveCurators.miniappNotInstalled && statistics.inactiveCurators.miniappNotInstalled.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                          Not Installed ({statistics.inactiveCurators.miniappNotInstalled.length})
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {statistics.inactiveCurators.miniappNotInstalled.map((curator) => {
                            const displayName = curator.displayName || curator.username || `User ${curator.fid}`;
                            return (
                              <div
                                key={curator.fid}
                                className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
                              >
                                <AvatarImage
                                  src={curator.pfpUrl}
                                  alt={displayName}
                                  size={24}
                                  className="w-6 h-6 rounded-full object-cover"
                                />
                                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                  {displayName}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {(!statistics.inactiveCurators.miniappInstalled || statistics.inactiveCurators.miniappInstalled.length === 0) &&
                      (!statistics.inactiveCurators.miniappNotInstalled || statistics.inactiveCurators.miniappNotInstalled.length === 0) && (
                        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                          <p>No curator data available</p>
                        </div>
                      )}
                  </div>
                )}
              </div>
            )}

            {/* Miniapp Notifications */}
            {isAdmin && (
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <button
                    onClick={() => setExpandedSections(prev => ({ ...prev, miniappNotifications: !prev.miniappNotifications }))}
                    className="flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-gray-100 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    <span className={`transition-transform ${expandedSections.miniappNotifications ? 'rotate-90' : ''}`}>
                      ▶
                    </span>
                    <span>Miniapp Notifications</span>
                  </button>
                  <div className="flex items-center gap-4">
                    {miniappNotificationsLastUpdated && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        Last updated: {new Date(miniappNotificationsLastUpdated).toLocaleString()}
                      </span>
                    )}
                    <button
                      onClick={fetchAllMiniappNotifications}
                      disabled={isLoadingMiniappNotifications}
                      className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                      {isLoadingMiniappNotifications ? "Updating..." : "Update"}
                    </button>
                  </div>
                </div>
                {expandedSections.miniappNotifications && (
                  <div className="space-y-4">
                    {isLoadingMiniappNotifications ? (
                      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        Loading notification tokens...
                      </div>
                    ) : miniappNotifications.length === 0 ? (
                      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        <p>No notification tokens found.</p>
                        <p className="text-sm mt-2">Click "Update" to fetch from Neynar API.</p>
                      </div>
                    ) : (
                      <>
                        <div className="mb-4 flex items-center justify-between">
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            Total users: <span className="font-semibold text-gray-900 dark:text-gray-100">{miniappNotificationsByUser.size}</span>
                            {" • "}
                            Total tokens: <span className="font-semibold text-gray-900 dark:text-gray-100">{miniappNotifications.length}</span>
                          </p>
                        </div>
                        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                          <div className="space-y-4">
                            {Array.from(miniappNotificationsByUser.values())
                              .sort((a, b) => {
                                // Sort by most recent notification first
                                const aLatest = a.notifications[a.notifications.length - 1]?.created_at || "";
                                const bLatest = b.notifications[b.notifications.length - 1]?.created_at || "";
                                return bLatest.localeCompare(aLatest);
                              })
                              .map((userData) => {
                                const displayName = userData.displayName || userData.username || `User ${userData.fid}`;
                                const isEnabled = userData.currentStatus === "enabled" || !userData.currentStatus;
                                
                                return (
                                  <div
                                    key={userData.fid}
                                    className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                                  >
                                    <div className="flex items-start gap-3 mb-3">
                                      <AvatarImage
                                        src={userData.pfpUrl}
                                        alt={displayName}
                                        size={40}
                                        className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                                      />
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                                            {displayName}
                                          </h4>
                                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                            isEnabled
                                              ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                              : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                                          }`}>
                                            {isEnabled ? "Enabled" : "Disabled"}
                                          </span>
                                        </div>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                          FID: {userData.fid}
                                          {userData.username && ` • @${userData.username}`}
                                        </p>
                                      </div>
                                    </div>

                                    {/* Timeline */}
                                    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                                      <div className="space-y-2">
                                        {userData.firstEnabled && (
                                          <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                                            <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                            <span>First enabled: {new Date(userData.firstEnabled).toLocaleString()}</span>
                                          </div>
                                        )}
                                        {userData.lastEnabled && userData.lastEnabled !== userData.firstEnabled && (
                                          <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                                            <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                            <span>Last enabled: {new Date(userData.lastEnabled).toLocaleString()}</span>
                                          </div>
                                        )}
                                        {userData.lastDisabled && (
                                          <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                                            <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                            <span>Last disabled: {new Date(userData.lastDisabled).toLocaleString()}</span>
                                          </div>
                                        )}
                                      </div>

                                      {/* Notification tokens timeline */}
                                      {userData.notifications.length > 1 && (
                                        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                                          <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Notification History ({userData.notifications.length} tokens)
                                          </p>
                                          <div className="space-y-1 max-h-32 overflow-y-auto">
                                            {userData.notifications.map((notif, idx) => {
                                              const notifStatus = notif.status || "enabled";
                                              const isNotifEnabled = notifStatus === "enabled";
                                              return (
                                                <div
                                                  key={`${notif.token}-${idx}`}
                                                  className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400"
                                                >
                                                  <span className={`w-1.5 h-1.5 rounded-full ${
                                                    isNotifEnabled ? "bg-green-500" : "bg-red-500"
                                                  }`}></span>
                                                  <span className="font-mono text-[10px] truncate flex-1" title={notif.token}>
                                                    {notif.token.substring(0, 20)}...
                                                  </span>
                                                  <span className="text-gray-500 dark:text-gray-500">
                                                    {new Date(notif.created_at).toLocaleDateString()}
                                                  </span>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}


