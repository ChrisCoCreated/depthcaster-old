"use client";

import { useEffect, useState } from "react";
import { useNeynarContext } from "@neynar/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Statistics {
  period: string;
  users: {
    total: number;
    new: number;
    withRoles: number;
    uniqueActiveUsers: number;
  };
  analytics: {
    pageViews: { authenticated: number; anonymous: number; total: number };
    feedSessions: { authenticated: number; anonymous: number; total: number };
    castViews: { authenticated: number; anonymous: number; total: number };
  };
  content: {
    curatedCasts: { total: number; new: number };
    curatorPacks: number;
    packSubscriptions: number;
    packFavorites: number;
    castReplies: number;
  };
  interactions: {
    likes: number;
    recasts: number;
    replies: number;
    quotes: number;
    total: number;
  };
  userActions: {
    watches: { total: number; new: number };
    notifications: { total: number; unread: number; readRate: string };
    pushSubscriptions: number;
    buildIdeas: number;
  };
  popularPages: Array<{ path: string; views: number }>;
  feedAnalytics: {
    viewSessions: Array<{
      feedType: string;
      totalSessions: number;
      totalDurationSeconds: number;
      avgDurationSeconds: number;
      uniqueUsers: number;
    }>;
    castViews: Array<{
      feedType: string;
      totalViews: number;
      uniqueCasts: number;
      uniqueUsers: number;
    }>;
  };
  engagement: {
    avgScore: number;
    topCurators: Array<{ curatorFid: number; curationCount: number }>;
    mostEngagedCasts: Array<{
      castHash: string;
      engagementScore: number;
      likesCount: number;
      recastsCount: number;
      repliesCount: number;
    }>;
  };
  monitoring: {
    tableSizes: Array<{ tablename: string; size: string; size_bytes: number; column_count: number }>;
    rowCounts: Array<{ table_name: string; row_count: number }>;
    oldestRecords: Array<{ table_name: string; oldest_record: string }>;
  };
  apiCalls: {
    reactionFetches: {
      count: number;
      cuCost: number;
      cuCostPerCall: number;
    };
  };
}

export default function AdminStatisticsPage() {
  const { user } = useNeynarContext();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [period, setPeriod] = useState<string>("all-time");
  const [isLoadingStats, setIsLoadingStats] = useState(false);

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
    }
  }, [period, isAdmin, user?.fid]);

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

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  return (
    <div className="min-h-screen bg-white dark:bg-black p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Statistics Dashboard
          </h1>
          <Link
            href="/admin"
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Back to Admin
          </Link>
        </div>

        <div className="mb-6">
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

        {isLoadingStats ? (
          <div className="text-center py-12">
            <div className="text-gray-500">Loading statistics...</div>
          </div>
        ) : statistics ? (
          <div className="space-y-6">
            {/* Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Authenticated Users</h3>
                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-2">
                  {formatNumber(statistics.users.total)}
                </p>
                {statistics.users.new > 0 && (
                  <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                    +{formatNumber(statistics.users.new)} new
                  </p>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {formatNumber(statistics.users.uniqueActiveUsers)} active
                </p>
              </div>

              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Curated Casts</h3>
                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-2">
                  {formatNumber(statistics.content.curatedCasts.total)}
                </p>
                {statistics.content.curatedCasts.new > 0 && (
                  <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                    +{formatNumber(statistics.content.curatedCasts.new)} new
                  </p>
                )}
              </div>

              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Interactions</h3>
                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-2">
                  {formatNumber(statistics.interactions.total)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {statistics.interactions.likes} likes, {statistics.interactions.recasts} recasts
                </p>
              </div>

              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Avg Engagement</h3>
                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-2">
                  {formatNumber(statistics.engagement.avgScore)}
                </p>
              </div>
            </div>

            {/* Feed Analytics */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Feed Analytics
              </h2>
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Time Spent by Feed
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead>
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                            Feed Type
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                            Sessions
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                            Total Time
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                            Avg Duration
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                            Unique Users
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {statistics.feedAnalytics.viewSessions.map((feed) => (
                          <tr key={feed.feedType}>
                            <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">
                              {feed.feedType}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
                              {formatNumber(feed.totalSessions)}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
                              {formatDuration(feed.totalDurationSeconds)}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
                              {formatDuration(feed.avgDurationSeconds)}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
                              {formatNumber(feed.uniqueUsers)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mt-6">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Cast Views by Feed
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead>
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                            Feed Type
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                            Total Views
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                            Unique Casts
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                            Unique Users
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {statistics.feedAnalytics.castViews.map((feed) => (
                          <tr key={feed.feedType}>
                            <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">
                              {feed.feedType}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
                              {formatNumber(feed.totalViews)}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
                              {formatNumber(feed.uniqueCasts)}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
                              {formatNumber(feed.uniqueUsers)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            {/* Popular Pages */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Popular Pages
              </h2>
              <div className="space-y-2">
                {statistics.popularPages.map((page, idx) => (
                  <div
                    key={page.path}
                    className="flex items-center justify-between py-2 border-b border-gray-200 dark:border-gray-700"
                  >
                    <span className="text-sm text-gray-900 dark:text-gray-100">{page.path}</span>
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                      {formatNumber(page.views)} views
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Database Monitoring */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Database Monitoring
              </h2>
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Table Sizes
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead>
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                            Table
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                            Size
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                            Columns
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {statistics.monitoring.tableSizes.map((table: any) => (
                          <tr key={table.tablename}>
                            <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">
                              {table.tablename}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
                              {table.size}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
                              {table.column_count}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mt-6">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Row Counts
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead>
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                            Table
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                            Rows
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {statistics.monitoring.rowCounts.map((table: any) => (
                          <tr key={table.table_name}>
                            <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">
                              {table.table_name}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
                              {formatNumber(Number(table.row_count))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mt-6">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Data Retention Status
                  </h3>
                  <div className="space-y-2">
                    {statistics.monitoring.oldestRecords.map((record: any) => (
                      <div
                        key={record.table_name}
                        className="flex items-center justify-between py-2 border-b border-gray-200 dark:border-gray-700"
                      >
                        <span className="text-sm text-gray-900 dark:text-gray-100">
                          {record.table_name}
                        </span>
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {record.oldest_record
                            ? new Date(record.oldest_record).toLocaleDateString()
                            : "N/A"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Analytics Breakdown */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Analytics: Authenticated vs Anonymous
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Page Views</h3>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Authenticated</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {formatNumber(statistics.analytics.pageViews.authenticated)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Anonymous</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {formatNumber(statistics.analytics.pageViews.anonymous)}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-gray-200 dark:border-gray-700 pt-1">
                      <span className="text-gray-900 dark:text-gray-100 font-medium">Total</span>
                      <span className="font-bold text-gray-900 dark:text-gray-100">
                        {formatNumber(statistics.analytics.pageViews.total)}
                      </span>
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Feed Sessions</h3>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Authenticated</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {formatNumber(statistics.analytics.feedSessions.authenticated)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Anonymous</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {formatNumber(statistics.analytics.feedSessions.anonymous)}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-gray-200 dark:border-gray-700 pt-1">
                      <span className="text-gray-900 dark:text-gray-100 font-medium">Total</span>
                      <span className="font-bold text-gray-900 dark:text-gray-100">
                        {formatNumber(statistics.analytics.feedSessions.total)}
                      </span>
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Cast Views</h3>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Authenticated</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {formatNumber(statistics.analytics.castViews.authenticated)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Anonymous</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {formatNumber(statistics.analytics.castViews.anonymous)}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-gray-200 dark:border-gray-700 pt-1">
                      <span className="text-gray-900 dark:text-gray-100 font-medium">Total</span>
                      <span className="font-bold text-gray-900 dark:text-gray-100">
                        {formatNumber(statistics.analytics.castViews.total)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Additional Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  Content Statistics
                </h2>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Curator Packs</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {formatNumber(statistics.content.curatorPacks)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Pack Subscriptions</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {formatNumber(statistics.content.packSubscriptions)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Pack Favorites</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {formatNumber(statistics.content.packFavorites)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Cast Replies</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {formatNumber(statistics.content.castReplies)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  User Actions
                </h2>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">User Watches</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {formatNumber(statistics.userActions.watches.total)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Notifications</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {formatNumber(statistics.userActions.notifications.total)} (
                      {statistics.userActions.notifications.readRate}% read)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Push Subscriptions</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {formatNumber(statistics.userActions.pushSubscriptions)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Build Ideas</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {formatNumber(statistics.userActions.buildIdeas)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="text-red-600">Failed to load statistics            </div>
          </div>
        )}

        {/* API Call Statistics */}
        {statistics && (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
              API Call Statistics
            </h2>
            <div className="space-y-4">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Reaction Fetches (Incremental Sync)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Total Fetches</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                      {formatNumber(statistics.apiCalls.reactionFetches.count)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">CU Cost per Fetch</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                      {statistics.apiCalls.reactionFetches.cuCostPerCall}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Total CU Cost</p>
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {formatNumber(statistics.apiCalls.reactionFetches.cuCost)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

