"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useNeynarContext } from "@neynar/react";
import { AvatarImage } from "../components/AvatarImage";

interface WeeklyContributor {
  curatorFid: number;
  curationCount: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
}

interface WeeklyContributorsData {
  topContributors: WeeklyContributor[];
  allContributors: WeeklyContributor[];
}

export default function ContributorsPage() {
  const { user } = useNeynarContext();
  const [data, setData] = useState<WeeklyContributorsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    const checkAdminAccess = async () => {
      if (!user?.fid) {
        setIsAdmin(false);
        return;
      }

      try {
        const response = await fetch(`/api/admin/check?fid=${user.fid}`);
        if (response.ok) {
          const data = await response.json();
          setIsAdmin(data.isAdmin || false);
        } else {
          setIsAdmin(false);
        }
      } catch (error) {
        console.error("Failed to check admin access:", error);
        setIsAdmin(false);
      }
    };

    checkAdminAccess();
  }, [user?.fid]);

  useEffect(() => {
    const fetchContributors = async () => {
      try {
        const response = await fetch("/api/curators/weekly-contributors");
        if (!response.ok) {
          throw new Error("Failed to fetch contributors");
        }
        const result = await response.json();
        setData(result);
      } catch (err: any) {
        console.error("Error fetching contributors:", err);
        setError(err.message || "Failed to load contributors");
      } finally {
        setLoading(false);
      }
    };

    fetchContributors();
  }, []);

  const sendTestNotification = async () => {
    if (!user?.fid) return;

    setIsSendingTest(true);
    setTestResult(null);

    try {
      const response = await fetch("/api/curators/weekly-contributors/send-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fid: user.fid }),
      });

      const data = await response.json();

      if (response.ok) {
        setTestResult(
          `Test notification sent! ${data.pushNotificationsSent} push notifications sent to ${data.usersNotified} admin(s).`
        );
      } else {
        setTestResult(`Error: ${data.error || "Failed to send test notification"}`);
      }
    } catch (error: any) {
      setTestResult(`Error: ${error.message || "Failed to send test notification"}`);
    } finally {
      setIsSendingTest(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <main className="max-w-4xl mx-auto px-4 py-8">
          <div className="text-center text-gray-500 dark:text-gray-400">Loading...</div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen">
        <main className="max-w-4xl mx-auto px-4 py-8">
          <div className="text-center text-red-600 dark:text-red-400">{error}</div>
        </main>
      </div>
    );
  }

  if (!data || (data.topContributors.length === 0 && data.allContributors.length === 0)) {
    return (
      <div className="min-h-screen">
        <main className="max-w-4xl mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Weekly Contributors
          </h1>
          <div className="text-center text-gray-500 dark:text-gray-400 mt-8">
            No contributors this week yet.
          </div>
        </main>
      </div>
    );
  }

  const ContributorPill = ({ contributor }: { contributor: WeeklyContributor }) => {
    const displayName = contributor.displayName || contributor.username || `@user${contributor.curatorFid}`;
    const profileUrl = `/profile/${contributor.curatorFid}`;

    return (
      <Link
        href={profileUrl}
        className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      >
        <AvatarImage
          src={contributor.pfpUrl}
          alt={displayName}
          size={40}
          className="rounded-full"
        />
        <span className="text-gray-900 dark:text-gray-100 font-medium">
          {displayName}
        </span>
      </Link>
    );
  };

  return (
    <div className="min-h-screen">
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6 flex items-end gap-4">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Weekly Contributors
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Curators who have contributed to the feed this week
            </p>
          </div>
          {isAdmin && (
            <div>
              <button
                onClick={sendTestNotification}
                disabled={isSendingTest}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSendingTest ? "Sending..." : "Send Test Notification"}
              </button>
              {testResult && (
                <p className={`mt-2 text-sm ${testResult.startsWith("Error") ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                  {testResult}
                </p>
              )}
            </div>
          )}
        </div>

        {data.topContributors.length > 0 && (
          <div className="mb-12">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Top Contributors
            </h2>
            <div className="flex flex-wrap gap-3">
              {data.topContributors.map((contributor) => (
                <ContributorPill key={contributor.curatorFid} contributor={contributor} />
              ))}
            </div>
          </div>
        )}

        {data.allContributors.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
              All Contributors
            </h2>
            <div className="flex flex-wrap gap-3">
              {data.allContributors.map((contributor) => (
                <ContributorPill key={contributor.curatorFid} contributor={contributor} />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
