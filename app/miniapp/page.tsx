"use client";

import { useEffect, useState } from "react";
import { MiniAppProvider, useMiniApp } from "@neynar/react";
import { formatDistanceToNow } from "date-fns";

interface FeedItem {
  castHash: string;
  text: string;
  authorFid: number | null;
  likesCount: number;
  recastsCount: number;
  repliesCount: number;
  qualityScore: number | null;
  castCreatedAt: string | null;
  curatedAt: string | null;
}

function MiniappContent() {
  const { isSDKLoaded, context, addMiniApp } = useMiniApp();
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [installed, setInstalled] = useState(false);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://depthcaster.vercel.app";

  useEffect(() => {
    // Check if miniapp is already installed
    if (context?.added) {
      setInstalled(true);
    }
  }, [context]);

  useEffect(() => {
    fetchFeed();
  }, []);

  const fetchFeed = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/miniapp/feed?limit=30");
      if (!response.ok) {
        throw new Error("Failed to fetch feed");
      }
      const data = await response.json();
      setFeedItems(data.items || []);
      setError(null);
    } catch (err) {
      console.error("Error fetching feed:", err);
      setError("Failed to load feed");
    } finally {
      setLoading(false);
    }
  };

  const handleInstall = async () => {
    if (!isSDKLoaded) return;

    try {
      const result = await addMiniApp();
      if (result.added) {
        setInstalled(true);
        // Track installation on server
        if (context?.user?.fid) {
          await fetch("/api/miniapp/install", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fid: context.user.fid }),
          });
        }
      }
    } catch (err) {
      console.error("Error installing miniapp:", err);
    }
  };

  const handleCastClick = (castHash: string) => {
    // Open externally in depthcaster
    const url = `${appUrl}/cast/${castHash}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center">
        <div className="text-gray-600 dark:text-gray-400">Loading feed...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center">
        <div className="text-red-600 dark:text-red-400">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Depthcaster Curated Feed
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Quality content, recently curated
          </p>
          {!installed && isSDKLoaded && (
            <button
              onClick={handleInstall}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Install Miniapp for Notifications
            </button>
          )}
          {installed && (
            <div className="mt-4 px-4 py-2 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-lg text-sm">
              ✓ Miniapp installed - you'll receive notifications
            </div>
          )}
        </div>

        <div className="space-y-4">
          {feedItems.length === 0 ? (
            <div className="text-center text-gray-600 dark:text-gray-400 py-12">
              No items in feed
            </div>
          ) : (
            feedItems.map((item) => (
              <div
                key={item.castHash}
                onClick={() => handleCastClick(item.castHash)}
                className="border border-gray-200 dark:border-gray-800 rounded-lg p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <p className="text-gray-900 dark:text-gray-100 text-sm leading-relaxed line-clamp-4">
                      {item.text || "No text content"}
                    </p>
                  </div>
                  {item.qualityScore !== null && (
                    <div className="ml-4 px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded text-xs font-medium">
                      {item.qualityScore}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 mt-3">
                  <span>❤️ {item.likesCount}</span>
                  <span>🔄 {item.recastsCount}</span>
                  <span>💬 {item.repliesCount}</span>
                  {item.curatedAt && (
                    <span>
                      Curated {formatDistanceToNow(new Date(item.curatedAt), { addSuffix: true })}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function MiniappPage() {
  return (
    <MiniAppProvider>
      <MiniappContent />
    </MiniAppProvider>
  );
}
