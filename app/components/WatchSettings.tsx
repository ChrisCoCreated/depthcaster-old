"use client";

import { useState, useEffect } from "react";
import { useNeynarContext } from "@neynar/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Watch {
  id: string;
  watchedFid: number;
  createdAt: Date | string;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
}

export function WatchSettings() {
  const { user } = useNeynarContext();
  const router = useRouter();
  const [watches, setWatches] = useState<Watch[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (user?.fid) {
      fetchWatches();
    }
  }, [user?.fid]);

  const fetchWatches = async () => {
    if (!user?.fid) return;

    try {
      setLoading(true);
      const response = await fetch(
        `/api/webhooks/user-watch?watcherFid=${user.fid}&includeDetails=true`
      );
      const data = await response.json();

      if (data.success && data.watches) {
        setWatches(data.watches);
      }
    } catch (error) {
      console.error("Failed to fetch watches:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (watch: Watch) => {
    if (!user?.fid) return;

    setRemovingIds((prev) => new Set(prev).add(watch.id));

    try {
      const response = await fetch(
        `/api/webhooks/user-watch?watcherFid=${user.fid}&watchedFid=${watch.watchedFid}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (data.success) {
        // Remove from local state
        setWatches((prev) => prev.filter((w) => w.id !== watch.id));
      } else {
        console.error("Failed to remove watch:", data.error);
        alert(data.error || "Failed to remove watch");
      }
    } catch (error) {
      console.error("Failed to remove watch:", error);
      alert("Failed to remove watch");
    } finally {
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(watch.id);
        return next;
      });
    }
  };

  if (loading) {
    return <div className="p-4 text-gray-500">Loading watches...</div>;
  }

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Active Watches
      </h2>

      {watches.length === 0 ? (
        <p className="text-gray-600 dark:text-gray-400">
          You're not watching anyone yet. Visit a user's profile to start watching
          them.
        </p>
      ) : (
        <div className="space-y-2">
          {watches.map((watch) => (
            <div
              key={watch.id}
              className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900"
            >
              <Link
                href={`/profile/${watch.watchedFid}`}
                className="flex items-center gap-3 flex-1 min-w-0"
              >
                {watch.pfpUrl ? (
                  <img
                    src={watch.pfpUrl}
                    alt={watch.displayName || watch.username || "User"}
                    className="w-10 h-10 rounded-full flex-shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gray-300 dark:bg-gray-700 flex-shrink-0 flex items-center justify-center">
                    <span className="text-gray-600 dark:text-gray-400 text-sm">
                      {(watch.displayName || watch.username || "?")[0].toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {watch.displayName || watch.username || `User ${watch.watchedFid}`}
                  </div>
                  {watch.username && watch.displayName && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      @{watch.username}
                    </div>
                  )}
                </div>
              </Link>
              <button
                onClick={() => handleRemove(watch)}
                disabled={removingIds.has(watch.id)}
                className="ml-4 px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
              >
                {removingIds.has(watch.id) ? "Removing..." : "Remove"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

