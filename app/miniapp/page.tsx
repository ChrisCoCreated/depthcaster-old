"use client";

import { useEffect, useState } from "react";
import { MiniAppProvider, useMiniApp } from "@neynar/react";
import { formatDistanceToNow } from "date-fns";
import { AvatarImage } from "@/app/components/AvatarImage";

interface FeedItem {
  castHash: string;
  text: string;
  authorFid: number | null;
  authorUsername: string | null;
  authorDisplayName: string | null;
  authorPfpUrl: string | null;
  repliesCount: number;
  qualityScore: number | null;
  castCreatedAt: string | null;
  curatedAt: string | null;
}

function MiniappContent() {
  const { isSDKLoaded, context, actions, added, notificationDetails } = useMiniApp();
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [installed, setInstalled] = useState(false);
  const [checkingInstall, setCheckingInstall] = useState(true);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://depthcaster.vercel.app";

  useEffect(() => {
    // Check if miniapp is already installed via SDK
    if (added) {
      setInstalled(true);
      setCheckingInstall(false);
    }
  }, [added]);

  useEffect(() => {
    // Check if user has miniapp installed in database
    const checkInstallation = async () => {
      if (context?.user?.fid) {
        try {
          const response = await fetch(`/api/miniapp/check?fid=${context.user.fid}`);
          if (response.ok) {
            const data = await response.json();
            if (data.installed) {
              setInstalled(true);
            }
          }
        } catch (err) {
          console.error("Error checking installation:", err);
        }
      }
      setCheckingInstall(false);
    };

    if (isSDKLoaded && context?.user?.fid) {
      checkInstallation();
    } else if (!isSDKLoaded) {
      setCheckingInstall(false);
    }
  }, [isSDKLoaded, context?.user?.fid]);

  useEffect(() => {
    // Call ready() when SDK is loaded to signal miniapp is ready
    if (isSDKLoaded && actions) {
      actions.ready().catch((err) => {
        console.error("Error calling ready():", err);
      });
    }
  }, [isSDKLoaded, actions]);

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
    if (!isSDKLoaded || !actions) return;

    try {
      const result = await actions.addFrame();
      // If we get a result (no error thrown), the miniapp was added
      // The 'added' state is managed by the hook and will update automatically
      if (result?.notificationDetails) {
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
    // Open externally in depthcaster conversation view
    const url = `${appUrl}/conversation/${castHash}`;
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
          {!checkingInstall && !installed && isSDKLoaded && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={handleInstall}
                className="px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
              >
                Install Miniapp for Notifications
              </button>
            </div>
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
                {/* Author info */}
                {item.authorFid && (
                  <div className="flex items-center gap-2 mb-2">
                    <AvatarImage
                      src={item.authorPfpUrl}
                      alt={item.authorUsername || item.authorDisplayName || "User"}
                      size={24}
                      className="w-6 h-6 rounded-full"
                    />
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {item.authorDisplayName || item.authorUsername || `User ${item.authorFid}`}
                    </span>
                  </div>
                )}

                {/* Cast text */}
                <div className="mb-2">
                  <p className="text-gray-900 dark:text-gray-100 text-sm leading-relaxed line-clamp-8">
                    {item.text || "No text content"}
                  </p>
                </div>

                {/* Curated time, quality score, and replies */}
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-3">
                  {item.curatedAt && (
                    <>
                      <span>
                        Curated {formatDistanceToNow(new Date(item.curatedAt), { addSuffix: true })}
                      </span>
                      {item.qualityScore !== null && (
                        <span className="text-gray-400 dark:text-gray-500">
                          · {item.qualityScore}
                        </span>
                      )}
                      {item.repliesCount > 0 && (
                        <span>
                          · {item.repliesCount} {item.repliesCount === 1 ? 'reply' : 'replies'}
                        </span>
                      )}
                    </>
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
