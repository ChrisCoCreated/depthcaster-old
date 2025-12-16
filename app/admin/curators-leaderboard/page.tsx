"use client";

import { useEffect, useState } from "react";
import { useNeynarContext } from "@neynar/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type CuratorLeaderboardEntry = {
  fid: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
  curationCount: number;
  firstCuration: string;
  lastCuration: string;
};

type WeeklyContributor = {
  curatorFid: number;
  curationCount: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
};

export default function CuratorsLeaderboardPage() {
  const { user } = useNeynarContext();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [leaderboard, setLeaderboard] = useState<CuratorLeaderboardEntry[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(true);
  const [weeklyContributors, setWeeklyContributors] = useState<WeeklyContributor[]>([]);
  const [loadingWeeklyContributors, setLoadingWeeklyContributors] = useState(true);

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
    if (!isAdmin) return;

    const fetchLeaderboard = async () => {
      try {
        const response = await fetch("/api/admin/curators-leaderboard");
        const data = await response.json();
        setLeaderboard(data.curators || []);
      } catch (error) {
        console.error("Failed to fetch leaderboard:", error);
      } finally {
        setLoadingLeaderboard(false);
      }
    };

    const fetchWeeklyContributors = async () => {
      try {
        const response = await fetch("/api/curators/weekly-contributors");
        const data = await response.json();
        // Combine top and all contributors, sorted by curation count
        const all = [...(data.topContributors || []), ...(data.allContributors || [])];
        all.sort((a, b) => b.curationCount - a.curationCount);
        setWeeklyContributors(all);
      } catch (error) {
        console.error("Failed to fetch weekly contributors:", error);
      } finally {
        setLoadingWeeklyContributors(false);
      }
    };

    fetchLeaderboard();
    fetchWeeklyContributors();
  }, [isAdmin]);

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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          Curators Leaderboard
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Top curators ranked by their curation activity
        </p>
      </div>

      {/* Weekly Contributors Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
              Weekly Contributors
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Curators who have contributed in the past 7 days
            </p>
          </div>
          <Link
            href="/contributors"
            className="text-accent-dark dark:text-accent hover:text-accent-dark dark:hover:text-accent font-medium"
          >
            View Contributors Page →
          </Link>
        </div>

        {loadingWeeklyContributors ? (
          <div className="text-center py-8">
            <div className="text-gray-500">Loading weekly contributors...</div>
          </div>
        ) : weeklyContributors.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
            <p className="text-gray-600 dark:text-gray-400">No weekly contributors found.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Rank
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Curator
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Weekly Curations
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {weeklyContributors.map((contributor, index) => (
                    <tr
                      key={contributor.curatorFid}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                        #{index + 1}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {contributor.pfpUrl && (
                            <img
                              src={contributor.pfpUrl}
                              alt={contributor.displayName || contributor.username || `User ${contributor.curatorFid}`}
                              className="h-10 w-10 rounded-full mr-3"
                            />
                          )}
                          <div>
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {contributor.displayName || contributor.username || `@user${contributor.curatorFid}`}
                            </div>
                            {contributor.username && (
                              <div className="text-sm text-gray-500 dark:text-gray-400">
                                @{contributor.username}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {contributor.curationCount.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

        {loadingLeaderboard ? (
          <div className="text-center py-12">
            <div className="text-gray-500">Loading leaderboard...</div>
          </div>
        ) : leaderboard.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
            <p className="text-gray-600 dark:text-gray-400">No curators found.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Rank
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Curator
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Curations
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      First Curation
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Last Curation
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {leaderboard.map((curator, index) => (
                    <tr
                      key={curator.fid}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                        #{index + 1}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {curator.pfpUrl && (
                            <img
                              src={curator.pfpUrl}
                              alt={curator.displayName || curator.username || `User ${curator.fid}`}
                              className="h-10 w-10 rounded-full mr-3"
                            />
                          )}
                          <div>
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {curator.displayName || curator.username || `@user${curator.fid}`}
                            </div>
                            {curator.username && (
                              <div className="text-sm text-gray-500 dark:text-gray-400">
                                @{curator.username}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {curator.curationCount.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {formatDate(curator.firstCuration)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {formatDate(curator.lastCuration)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
    </div>
  );
}

