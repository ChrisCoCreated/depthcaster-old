"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { MiniAppProvider, useMiniApp } from "@neynar/react";
import { formatDistanceToNow } from "date-fns";
import { AvatarImage } from "@/app/components/AvatarImage";
import Link from "next/link";
import { analytics } from "@/lib/analytics";
import { sdk } from "@farcaster/miniapp-sdk";
import Image from "next/image";

interface FeedItem {
  castHash: string;
  text: string;
  firstEmbedImageUrl: string | null;
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
  const { isSDKLoaded, context, actions, added, notificationDetails } = useMiniApp();
  const hasAutoOpenedRef = useRef(false);
  const hasScrolledToCastRef = useRef(false);
  const castElementRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const hadNotificationOnMountRef = useRef<string | null>(null);
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
  const [minQualityScore, setMinQualityScore] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("miniappMinQualityScore");
      return saved ? parseInt(saved, 10) : 70;
    }
    return 70;
  });
  const [showQualityFilters, setShowQualityFilters] = useState(false);
  const [openLinkPreference, setOpenLinkPreference] = useState<"auto" | "farcaster" | "sopha">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("miniappOpenLinkPreference");
      if (saved === "farcaster" || saved === "sopha" || saved === "auto") {
        return saved;
      }
    }
    return "sopha"; // Default to Sopha
  });
  const [notificationFrequency, setNotificationFrequency] = useState<"all" | "daily" | "weekly">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("miniappNotificationFrequency");
      if (saved === "all" || saved === "daily" || saved === "weekly") {
        return saved;
      }
    }
    return "all"; // Default to All
  });
  const [isViewingOnWeb, setIsViewingOnWeb] = useState(false);

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
    // Load notification frequency preference from database
    const loadNotificationFrequency = async () => {
      if (context?.user?.fid) {
        try {
          // First, ensure user exists and get signer_uuid
          const ensureResponse = await fetch("/api/user/ensure", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fid: context.user.fid }),
          });

          let signerUuid: string | null = null;
          if (ensureResponse.ok) {
            const ensureData = await ensureResponse.json();
            signerUuid = ensureData.signer_uuid || null;
          }

          // If we have signer_uuid, fetch preferences
          if (signerUuid) {
            const response = await fetch(
              `/api/user/preferences?fid=${context.user.fid}&signerUuid=${signerUuid}`
            );
            if (response.ok) {
              const data = await response.json();
              if (data.notificationFrequency && (data.notificationFrequency === "all" || data.notificationFrequency === "daily" || data.notificationFrequency === "weekly")) {
                setNotificationFrequency(data.notificationFrequency);
                localStorage.setItem("miniappNotificationFrequency", data.notificationFrequency);
              }
            }
          }
        } catch (error) {
          console.error("Error loading notification frequency preference:", error);
        }
      }
    };

    if (isSDKLoaded && context?.user?.fid) {
      loadNotificationFrequency();
    }
  }, [isSDKLoaded, context?.user?.fid]);

  useEffect(() => {
    // Call ready() when SDK is loaded to signal miniapp is ready
    if (isSDKLoaded && actions) {
      actions.ready().catch((err) => {
        console.error("Error calling ready():", err);
      });
      
      // Log that Depthcaster miniapp opened
      console.log("[Miniapp] Depthcaster opened");
      
      // Log to backend API (non-blocking)
      if (context?.user?.fid) {
        fetch("/api/miniapp/open", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userFid: context.user.fid,
          }),
        }).catch((err) => {
          console.error("Error logging miniapp open:", err);
          // Don't block if logging fails
        });
      }
    }
  }, [isSDKLoaded, actions, context?.user?.fid]);

  // Track notification on initial mount
  useEffect(() => {
    if (!isSDKLoaded) {
      return;
    }

    // Check for castHash in URL query parameters
    let castHash: string | null = null;
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      castHash = urlParams.get("castHash");
    }
    
    // Also check notificationDetails from SDK if available
    const notificationCastHash = (notificationDetails as any)?.castHash;

    const hashToOpen = castHash || notificationCastHash;

    // Store the notification hash on initial mount if present
    if (hashToOpen && !hadNotificationOnMountRef.current) {
      hadNotificationOnMountRef.current = hashToOpen;
    }
  }, [isSDKLoaded, notificationDetails]);

  // Handle notification click - log data and either auto-open or prepare to scroll
  useEffect(() => {
    if (!isSDKLoaded) {
      return;
    }

    // Only proceed if we had a notification on mount (not if user just changed preference)
    const hashToOpen = hadNotificationOnMountRef.current;
    if (!hashToOpen) {
      return;
    }

    // Log notification click to backend
    if (context?.user?.fid) {
      fetch("/api/miniapp/notification-click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          castHash: hashToOpen,
          userFid: context.user.fid,
          notificationDetails: notificationDetails,
        }),
      }).catch((err) => {
        console.error("Error logging notification click:", err);
        // Don't block opening the cast if logging fails
      });
    }
    
    // Only auto-open if preference is "auto" and only once, and notification was present on mount
    if (openLinkPreference === "auto" && !hasAutoOpenedRef.current) {
      hasAutoOpenedRef.current = true;
      
      // Auto-open in Sopha conversation view
      const url = `${appUrl}/conversation/${hashToOpen}`;
      if (actions?.openUrl) {
        actions.openUrl(url).catch((err) => {
          console.error("Error opening cast from notification:", err);
          // Fallback to window.open if SDK method fails
          window.open(url, "_blank", "noopener,noreferrer");
        });
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    }
    // If preference is not "auto", we'll scroll to the cast in the feed instead
    // (handled in the scroll effect below)
  }, [isSDKLoaded, actions, appUrl, openLinkPreference, context?.user?.fid, notificationDetails]);

  const fetchFeed = useCallback(async (limit: number = 3) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/miniapp/feed?limit=${limit}&minQualityScore=${minQualityScore}`, {
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
      setError("Failed to load feed");
    } finally {
      setLoading(false);
    }
  }, [minQualityScore]);

  // Fetch initial feed immediately on mount (don't wait for anything)
  useEffect(() => {
    // Small delay to ensure page is fully loaded
    const timer = setTimeout(() => {
      fetchFeed(3); // Load only 3 items initially
    }, 100);
    return () => clearTimeout(timer);
  }, [fetchFeed]);

  const loadMoreItems = useCallback(async () => {
    if (loadingMore || !hasMore || feedItems.length >= 30) return;

    try {
      setLoadingMore(true);
      const response = await fetch(`/api/miniapp/feed?limit=30&minQualityScore=${minQualityScore}`);
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
  }, [loadingMore, hasMore, feedItems, minQualityScore]);

  // Lazy load remaining items after initial render
  useEffect(() => {
    if (!loading && feedItems.length > 0 && hasMore && feedItems.length < 30) {
      // Load remaining items after a short delay to ensure initial render is complete
      const timer = setTimeout(() => {
        loadMoreItems();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [loading, feedItems.length, hasMore, loadMoreItems]);

  // Scroll to cast when opened from notification (if preference is not "auto")
  useEffect(() => {
    if (openLinkPreference === "auto" || hasScrolledToCastRef.current || loading || feedItems.length === 0) {
      return;
    }


    // Only scroll if we had a notification on mount (not if user just changed preference)
    const hashToScroll = hadNotificationOnMountRef.current;

    if (!hashToScroll) {
      return;
    }

    // Check if cast is in current feed items
    const castInFeed = feedItems.find(item => item.castHash === hashToScroll);
    
    if (castInFeed) {
      // Cast is in feed, scroll to it
      hasScrolledToCastRef.current = true;
      const timer = setTimeout(() => {
        const element = castElementRefs.current.get(hashToScroll);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
          // Highlight the cast briefly
          element.style.transition = "background-color 0.3s";
          element.style.backgroundColor = "rgba(59, 130, 246, 0.1)";
          setTimeout(() => {
            element.style.backgroundColor = "";
          }, 2000);
        }
      }, 300); // Small delay to ensure DOM is ready
      return () => clearTimeout(timer);
    } else if (hasMore && feedItems.length < 30 && !loadingMore) {
      // Cast not in feed yet, load more items
      loadMoreItems();
    }
  }, [feedItems, loading, hasMore, loadingMore, notificationDetails, openLinkPreference, loadMoreItems]);

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
      showToast("Curated to your feed", "success");

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
    if (openLinkPreference === "farcaster") {
      // Open in Farcaster using SDK
      try {
        await sdk.actions.viewCast({ hash: castHash });
      } catch (error) {
        console.error("Error opening cast in Farcaster:", error);
        // Fallback to Sopha on error
        const url = `${appUrl}/conversation/${castHash}`;
        if (actions?.openUrl) {
          actions.openUrl(url);
        } else {
          window.open(url, "_blank", "noopener,noreferrer");
        }
      }
    } else {
      // Open in Sopha conversation view (for both "sopha" and "auto" preferences)
      const url = `${appUrl}/conversation/${castHash}`;
      if (actions?.openUrl) {
        actions.openUrl(url);
      } else {
        // Fallback to window.open if SDK not ready
        window.open(url, "_blank", "noopener,noreferrer");
      }
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

  // Check if user is viewing on depthcaster.com (not in miniapp context)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const hostname = window.location.hostname;
      const isOnDepthcaster = hostname === "depthcaster.com" || hostname === "www.depthcaster.com";
      // Show banner if on depthcaster.com and not in miniapp context (context will be null/undefined on web)
      setIsViewingOnWeb(isOnDepthcaster && !context);
    }
  }, [context]);

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      {/* Banner for users viewing on depthcaster.com */}
      {isViewingOnWeb && (
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border-b border-blue-200 dark:border-blue-800">
          <div className="max-w-2xl mx-auto px-4 py-6">
            <div className="flex items-center gap-4 mb-4">
              <Image
                src="/images/logos/sopha_logo.png"
                alt="Sopha Logo"
                width={64}
                height={64}
                className="w-16 h-16"
              />
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  Sopha
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  New miniapp available
                </p>
              </div>
            </div>
            <p className="text-base text-gray-700 dark:text-gray-300 mb-4">
              Install the new Sopha miniapp to get notifications and access curated quality content directly in Farcaster.
            </p>
            <button
              onClick={handleInstall}
              className="px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors font-medium"
            >
              Install Miniapp
            </button>
          </div>
        </div>
      )}
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
              Sopha <span className="text-xs font-normal text-gray-500 dark:text-gray-400">Beta</span>
            </Link>
            <div className="flex items-center gap-3">
              {context?.user?.fid && (
                <div className="relative flex items-center gap-1">
              {/* Toggle for opening links: Auto Open Sopha, Farcaster, or Sopha */}
              <button
                onClick={() => {
                  // Cycle through: auto -> farcaster -> sopha -> auto
                  const nextPreference = 
                    openLinkPreference === "auto" ? "farcaster" :
                    openLinkPreference === "farcaster" ? "sopha" : "auto";
                  setOpenLinkPreference(nextPreference);
                  localStorage.setItem("miniappOpenLinkPreference", nextPreference);
                }}
                className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                aria-label={
                  openLinkPreference === "auto" ? "Auto Open Sopha" :
                  openLinkPreference === "farcaster" ? "Open links in Farcaster" :
                  "Open links in Sopha"
                }
                title={
                  openLinkPreference === "auto" ? "Auto Open Sopha (click to change)" :
                  openLinkPreference === "farcaster" ? "Open links in Farcaster (click to change)" :
                  "Open links in Sopha (click to change)"
                }
              >
                {openLinkPreference === "auto" ? "⚡ Auto" :
                 openLinkPreference === "farcaster" ? "🔗 Farcaster" :
                 "📱 Sopha"}
              </button>
              {/* Notification frequency toggle: All / Daily / Weekly */}
              {/* Temporarily hidden */}
              {false && (() => {
                const isAppInstalled = installed || added;
                const areNotificationsEnabled = !!notificationDetails;
                const getButtonState = () => {
                  if (!isAppInstalled) return { text: "➕ Add", label: "Add app to enable notifications", className: "bg-accent/30 dark:bg-accent/20 border-accent/60 dark:border-accent-dark text-accent-dark dark:text-accent" };
                  if (!areNotificationsEnabled) return { text: "🔕 Off", label: "Notifications disabled - enable in Farcaster settings", className: "bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400" };
                  if (notificationFrequency === "all") return { text: "🔔 All", label: "All notifications enabled", className: "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300" };
                  if (notificationFrequency === "daily") return { text: "📅 Daily", label: "Daily notifications enabled", className: "bg-accent/30 dark:bg-accent/20 border-accent/60 dark:border-accent-dark text-accent-dark dark:text-accent" };
                  return { text: "📆 Weekly", label: "Weekly notifications enabled", className: "bg-purple-50 dark:bg-purple-900/20 border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300" };
                };
                const state = getButtonState();
                return (
                  <button
                    onClick={async () => {
                      // If app not installed, request to add it (which also requests notifications)
                      if (!isAppInstalled) {
                        if (!isSDKLoaded || !actions) {
                          showToast("Please wait for the app to load", "error");
                          return;
                        }
                        try {
                          await handleInstall();
                          showToast("App added! Notifications enabled.", "success");
                          return;
                        } catch (error) {
                          console.error("Error adding app:", error);
                          showToast("Failed to add app", "error");
                          return;
                        }
                      }

                      // If app is installed but notifications are not enabled, show message
                      if (isAppInstalled && !areNotificationsEnabled) {
                        showToast("Please enable notifications in your Farcaster settings", "error");
                        return;
                      }

                      // If everything is set up, cycle through frequency options
                      // Cycle through: all -> daily -> weekly -> all
                      const nextFrequency = 
                        notificationFrequency === "all" ? "daily" :
                        notificationFrequency === "daily" ? "weekly" : "all";
                      setNotificationFrequency(nextFrequency);
                      localStorage.setItem("miniappNotificationFrequency", nextFrequency);
                      
                      // Save to database if user is logged in
                      if (context?.user?.fid) {
                        try {
                          // First, ensure user exists and get signer_uuid
                          const ensureResponse = await fetch("/api/user/ensure", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ fid: context.user.fid }),
                          });

                          let signerUuid: string | null = null;
                          if (ensureResponse.ok) {
                            const ensureData = await ensureResponse.json();
                            signerUuid = ensureData.signer_uuid || null;
                          }

                          // If we have signer_uuid, save preferences
                          if (signerUuid) {
                            await fetch("/api/user/preferences", {
                              method: "PUT",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                fid: context.user.fid,
                                signerUuid: signerUuid,
                                notificationFrequency: nextFrequency,
                              }),
                            });
                          }
                        } catch (error) {
                          console.error("Error saving notification frequency preference:", error);
                        }
                      }
                    }}
                    className={`px-2 py-1 text-xs rounded border font-medium ${state.className} hover:opacity-80 transition-all`}
                    aria-label={state.label}
                    title={`${state.label} (click to ${isAppInstalled && areNotificationsEnabled ? "change" : isAppInstalled ? "enable" : "add"})`}
                  >
                    {state.text}
                  </button>
                );
              })()}
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
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent dark:focus:ring-accent"
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
                      className="flex-1 px-3 py-1.5 bg-accent text-white rounded text-sm hover:bg-accent-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-2 pb-6">
        <div className="mb-2">
          <div className="flex items-center flex-wrap gap-1 mb-2">
            <span className="text-xs text-gray-600 dark:text-gray-400">
              Latest Quality Curations
            </span>
            <button
              onClick={() => setShowQualityFilters(!showQualityFilters)}
              className="text-xs px-1.5 py-0.5 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
            >
              Q: {minQualityScore}+
            </button>
            {showQualityFilters && (
              <>
                {[
                  { value: 70, label: "70+" },
                  { value: 60, label: "60+" },
                  { value: 50, label: "50+" },
                  { value: 20, label: "20+" },
                ].map((filter) => (
                  <button
                    key={filter.value}
                    onClick={() => {
                      setMinQualityScore(filter.value);
                      localStorage.setItem("miniappMinQualityScore", filter.value.toString());
                      // Refresh feed with new quality filter
                      fetchFeed(3);
                    }}
                    className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
                      minQualityScore === filter.value
                        ? "bg-black text-white dark:bg-white dark:text-black"
                        : "bg-black text-gray-400 dark:bg-gray-800 dark:text-gray-500 hover:text-white dark:hover:text-gray-300"
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </>
            )}
          </div>

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
                ref={(el) => {
                  if (el) {
                    castElementRefs.current.set(item.castHash, el);
                  } else {
                    castElementRefs.current.delete(item.castHash);
                  }
                }}
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

                {/* Cast text or first embed image */}
                <div className="mb-2">
                  {item.text ? (
                    <p className="text-gray-900 dark:text-gray-100 text-sm leading-relaxed line-clamp-8">
                      {item.text}
                    </p>
                  ) : item.firstEmbedImageUrl ? (
                    <div className="w-full rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
                      <img
                        src={item.firstEmbedImageUrl}
                        alt="Embedded image"
                        className="w-full h-auto max-h-96 object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                  ) : (
                    <p className="text-gray-500 dark:text-gray-400 text-sm italic">
                      No text content
                    </p>
                  )}
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
                          · Q: {item.qualityScore}
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
                Curate to your feed?
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
                  className="flex-1 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPasting ? "Curating..." : "Curate to your feed"}
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
