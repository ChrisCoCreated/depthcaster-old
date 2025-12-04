"use client";

import { useEffect, useState } from "react";
import { MiniAppProvider, useMiniApp } from "@neynar/react";
import { formatDistanceToNow } from "date-fns";
import { AvatarImage } from "@/app/components/AvatarImage";
import Link from "next/link";
import { analytics } from "@/lib/analytics";

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

const ADMIN_FID = 5701;

function MiniappContent() {
  const { isSDKLoaded, context, actions, added, notificationDetails, openUrl } = useMiniApp();
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [installed, setInstalled] = useState(false);
  const [checkingInstall, setCheckingInstall] = useState(false); // Start as false, don't block
  const [showInstallMessage, setShowInstallMessage] = useState(false);
  const [isPasting, setIsPasting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "error" | "success" } | null>(null);
  const [showCurateConfirm, setShowCurateConfirm] = useState(false);
  const [pendingCastData, setPendingCastData] = useState<any>(null);
  const [showPasteInput, setShowPasteInput] = useState(false);
  const [pasteInputValue, setPasteInputValue] = useState("");
  const [isCurator, setIsCurator] = useState<boolean | null>(null);
  const [checkingCurator, setCheckingCurator] = useState(false);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://depthcaster.vercel.app";
  
  const farcasterDmLink = context?.user?.fid 
    ? `https://farcaster.xyz/~/inbox/${context.user.fid}-${ADMIN_FID}`
    : `https://farcaster.xyz/~/inbox/${ADMIN_FID}`;

  useEffect(() => {
    // Check if miniapp is already installed via SDK
    if (added) {
      setInstalled(true);
      setCheckingInstall(false);
    }
  }, [added]);

  useEffect(() => {
    // Check if user has miniapp installed in database (non-blocking)
    const checkInstallation = async () => {
      if (context?.user?.fid) {
        setCheckingInstall(true);
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
        } finally {
          setCheckingInstall(false);
        }
      }
    };

    // Don't block on SDK load - check in background
    if (isSDKLoaded && context?.user?.fid) {
      checkInstallation();
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

  // Fetch initial feed immediately on mount (don't wait for anything)
  useEffect(() => {
    // Small delay to ensure page is fully loaded
    const timer = setTimeout(() => {
      fetchFeed(3); // Load only 3 items initially
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Lazy load remaining items after initial render
  useEffect(() => {
    if (!loading && feedItems.length > 0 && hasMore && feedItems.length < 30) {
      // Load remaining items after a short delay to ensure initial render is complete
      const timer = setTimeout(() => {
        loadMoreItems();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [loading, feedItems.length, hasMore]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message: string, type: "error" | "success" = "error") => {
    setToast({ message, type });
  };

  const extractCastIdentifier = (text: string): { identifier: string; type: "url" | "hash" } | null => {
    // Check if it's a full URL that Neynar can handle directly
    const urlPatterns = [
      /https?:\/\/farcaster\.xyz\/[^\s]+/i, // Full farcaster.xyz URLs
      /https?:\/\/base\.app\/post\/[^\s]+/i, // Full base.app URLs
      /https?:\/\/warpcast\.com\/[^\s]+/i, // Full warpcast.com URLs
    ];

    for (const pattern of urlPatterns) {
      const match = text.match(pattern);
      if (match) {
        return { identifier: match[0], type: "url" };
      }
    }

    // Try to extract hash from various URL formats
    // Cast hashes can vary in length (typically 40 hex chars after 0x, but can be shorter)
    const hashPatterns = [
      /\/cast\/(0x[a-fA-F0-9]{8,})/i, // /cast/0x... (at least 8 hex chars)
      /warpcast\.com\/.*\/cast\/(0x[a-fA-F0-9]{8,})/i, // warpcast.com URLs
      /farcaster\.xyz\/[^\/]+\/(0x[a-fA-F0-9]{8,})/i, // farcaster.xyz URLs (e.g., /cassie/0x...)
      /base\.app\/post\/(0x[a-fA-F0-9]{8,})/i, // base.app URLs
      /(?:^|\s|"|')(0x[a-fA-F0-9]{8,})(?:\s|$|"|')/, // Standalone hash (at least 8 hex chars)
    ];

    for (const pattern of hashPatterns) {
      const match = text.match(pattern);
      if (match) {
        return { identifier: match[1], type: "hash" };
      }
    }

    return null;
  };

  const handlePasteToCurate = () => {
    if (!context?.user?.fid || isPasting) return;
    
    // In miniapp, clipboard access always fails, so show text input directly
    setShowPasteInput(true);
    setPasteInputValue("");
  };

  const checkCuratorStatus = async (): Promise<boolean> => {
    if (!context?.user?.fid) return false;
    
    if (isCurator !== null) {
      return isCurator;
    }

    try {
      setCheckingCurator(true);
      const response = await fetch(`/api/admin/check?fid=${context.user.fid}`);
      if (response.ok) {
        const data = await response.json();
        const roles = data.roles || [];
        const hasCuratorRole = roles.includes("curator");
        setIsCurator(hasCuratorRole);
        return hasCuratorRole;
      }
      setIsCurator(false);
      return false;
    } catch (error) {
      console.error("Failed to check curator status:", error);
      setIsCurator(false);
      return false;
    } finally {
      setCheckingCurator(false);
    }
  };

  const handlePasteInputSubmit = async () => {
    if (!context?.user?.fid || isPasting || !pasteInputValue.trim()) return;

    try {
      setIsPasting(true);
      
      // Extract cast identifier (URL or hash)
      const castIdentifier = extractCastIdentifier(pasteInputValue.trim());
      
      if (!castIdentifier) {
        showToast("Text doesn't contain a valid cast link or hash");
        return;
      }

      // Fetch cast data using Neynar (supports both URL and hash lookups)
      const conversationResponse = await fetch(
        `/api/conversation?identifier=${encodeURIComponent(castIdentifier.identifier)}&type=${castIdentifier.type}&replyDepth=0`
      );

      if (!conversationResponse.ok) {
        throw new Error("Failed to fetch cast data");
      }

      const conversationData = await conversationResponse.json();
      const castData = conversationData?.conversation?.cast;

      if (!castData) {
        showToast("Cast not found");
        return;
      }

      // Use the hash from the fetched cast data (Neynar returns the full cast with hash)
      const castHash = castData.hash;
      if (!castHash) {
        showToast("Cast hash not found in response");
        return;
      }

      // Close text input
      setShowPasteInput(false);
      setPasteInputValue("");

      // Show confirmation modal with cast preview
      setPendingCastData(castData);
      setShowCurateConfirm(true);
    } catch (error: any) {
      console.error("Paste to curate error:", error);
      showToast(error.message || "Failed to fetch cast");
    } finally {
      setIsPasting(false);
    }
  };

  const handleConfirmCurate = async () => {
    if (!context?.user?.fid || !pendingCastData) return;

    try {
      setIsPasting(true);
      const castHash = pendingCastData.hash;

      // Curate the cast
      const curateResponse = await fetch("/api/curate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          castHash,
          curatorFid: context.user.fid,
          castData: pendingCastData,
        }),
      });

      if (!curateResponse.ok) {
        const errorData = await curateResponse.json();
        if (curateResponse.status === 403) {
          showToast("You don't have permission to curate casts");
        } else if (curateResponse.status === 409) {
          showToast("You have already curated this cast");
        } else {
          showToast(errorData.error || "Failed to curate cast");
        }
        return;
      }

      // Success - show success message
      showToast("Curated", "success");

      // Track analytics
      analytics.trackCuratePaste(castHash, context.user.fid);

      // Close modal and reset state
      setShowCurateConfirm(false);
      setPendingCastData(null);

      // Refresh the feed after a short delay (load all 30 items)
      setTimeout(() => {
        fetchFeed(30);
      }, 1000);
    } catch (error: any) {
      console.error("Curate error:", error);
      showToast(error.message || "Failed to curate cast");
    } finally {
      setIsPasting(false);
    }
  };

  const fetchFeed = async (limit: number = 3) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/miniapp/feed?limit=${limit}`, {
        // Add signal to allow cancellation if component unmounts
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch feed: ${response.status}`);
      }
      const data = await response.json();
      setFeedItems(data.items || []);
      setHasMore((data.items || []).length >= limit && limit < 30);
      setError(null);
    } catch (err: any) {
      // Ignore abort errors (component unmounted or timeout)
      if (err.name === 'AbortError' || err.name === 'TimeoutError') {
        console.log("Feed fetch cancelled or timed out");
        return;
      }
      console.error("Error fetching feed:", err);
      // Only set error if we don't have any items yet (initial load)
      if (feedItems.length === 0) {
        setError("Failed to load feed");
      }
    } finally {
      setLoading(false);
    }
  };

  const loadMoreItems = async () => {
    if (loadingMore || !hasMore || feedItems.length >= 30) return;

    try {
      setLoadingMore(true);
      const response = await fetch(`/api/miniapp/feed?limit=30`);
      if (!response.ok) {
        throw new Error("Failed to fetch more items");
      }
      const data = await response.json();
      const newItems = data.items || [];
      // Only add items we don't already have
      const existingHashes = new Set(feedItems.map(item => item.castHash));
      const itemsToAdd = newItems.filter((item: FeedItem) => !existingHashes.has(item.castHash));
      setFeedItems(prev => [...prev, ...itemsToAdd]);
      setHasMore(itemsToAdd.length > 0 && feedItems.length + itemsToAdd.length < 30);
    } catch (err) {
      console.error("Error loading more items:", err);
    } finally {
      setLoadingMore(false);
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
        
        // Check if message has been shown before
        const messageShown = localStorage.getItem("miniapp-installation-message-shown");
        if (messageShown !== "true") {
          // Show message and mark as shown
          setShowInstallMessage(true);
          localStorage.setItem("miniapp-installation-message-shown", "true");
          
          // Hide message after 5 seconds
          setTimeout(() => {
            setShowInstallMessage(false);
          }, 5000);
        }
        
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

  const handleCastClick = async (castHash: string) => {
    // Open externally in depthcaster conversation view using Farcaster miniapp SDK
    const url = `${appUrl}/conversation/${castHash}`;
    
    // Only use SDK in browser context
    if (typeof window === "undefined") {
      return;
    }
    
    try {
      // Try using openUrl directly from useMiniApp hook (preferred)
      if (openUrl) {
        await openUrl(url);
        return;
      }
      
      // Fallback: try actions.openUrl if available
      if (actions?.openUrl) {
        await actions.openUrl(url);
        return;
      }
      
      // Final fallback: dynamically import SDK only when needed
      const { sdk } = await import("@farcaster/miniapp-sdk");
      await sdk.actions.openUrl(url);
    } catch (error) {
      console.error("Error opening URL:", error);
      // Fallback to window.open if SDK fails
      window.open(url, "_blank", "noopener,noreferrer");
    }
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
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 z-[300] px-4 py-3 rounded-lg shadow-lg transition-all duration-300 ${
            toast.type === "success"
              ? "bg-green-500 text-white"
              : "bg-red-500 text-white"
          }`}
          role="alert"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{toast.message}</p>
            <button
              onClick={() => setToast(null)}
              className="ml-4 text-white hover:text-gray-200"
              aria-label="Close"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Thin consolidated miniapp header */}
      <div className="sticky top-0 z-[200] bg-white/80 dark:bg-black/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-2xl mx-auto px-4 py-2">
          <div className="flex items-center justify-between">
            <Link href="/" className="text-lg font-bold text-gray-900 dark:text-gray-100">
              Depthcaster <span className="text-xs font-normal text-gray-500 dark:text-gray-400">Beta</span>
            </Link>
          {context?.user?.fid && (
            <div className="relative flex items-center gap-1">
              <button
                onClick={handlePasteToCurate}
                disabled={isPasting}
                className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Paste to curate"
                title="Paste cast link to curate"
              >
                {isPasting ? (
                  <svg
                    className="w-4 h-4 animate-spin"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                    />
                  </svg>
                )}
              </button>
              
              {/* Expandable text input */}
              {showPasteInput && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg p-3 z-[250] transition-all duration-300">
                  <input
                    type="text"
                    value={pasteInputValue}
                    onChange={(e) => setPasteInputValue(e.target.value)}
                    placeholder="Paste cast link or hash"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handlePasteInputSubmit();
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setShowPasteInput(false);
                        setPasteInputValue("");
                      }
                    }}
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={handlePasteInputSubmit}
                      disabled={isPasting || !pasteInputValue.trim()}
                      className="flex-1 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Submit
                    </button>
                    <button
                      onClick={() => {
                        setShowPasteInput(false);
                        setPasteInputValue("");
                      }}
                      className="px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-2 pb-6">
        <div className="mb-2">
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-0">
            Latest Quality Curations
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
          {showInstallMessage && (
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

      {/* Curate Confirmation Modal */}
      {showCurateConfirm && pendingCastData && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => {
            setShowCurateConfirm(false);
            setPendingCastData(null);
          }}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Curate this cast?
              </h3>
              
              {/* Action Buttons */}
              <div className="flex gap-3 mb-4">
                <button
                  onClick={() => {
                    setShowCurateConfirm(false);
                    setPendingCastData(null);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmCurate}
                  disabled={isPasting}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPasting ? "Curating..." : "Curate"}
                </button>
              </div>
              
              {/* Cast Preview */}
              <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4">
                {/* Author */}
                <div className="flex items-center gap-3 mb-3">
                  <AvatarImage
                    src={pendingCastData.author?.pfp_url}
                    alt={pendingCastData.author?.username || pendingCastData.author?.display_name || "User"}
                    size={40}
                    className="w-10 h-10 rounded-full"
                  />
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-gray-100">
                      {pendingCastData.author?.display_name || pendingCastData.author?.username || `User ${pendingCastData.author?.fid}`}
                    </div>
                    {pendingCastData.author?.username && (
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        @{pendingCastData.author.username}
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Cast Text */}
                <div className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words">
                  {pendingCastData.text || "No text content"}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
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
