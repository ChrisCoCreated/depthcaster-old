"use client";

import { useNeynarContext, NeynarAuthButton } from "@neynar/react";
import { NotificationBell } from "./NotificationBell";
import { HeaderUserSearch } from "./HeaderUserSearch";
import { FeedbackModal } from "./FeedbackModal";
import Link from "next/link";
import { useState, useEffect, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { AvatarImage } from "./AvatarImage";
import { analytics } from "@/lib/analytics";
import { HelpCircle, User, Settings, Shield } from "lucide-react";

export function Header() {
  const { user } = useNeynarContext();
  const pathname = usePathname();
  const isMiniapp = pathname?.startsWith("/miniapp");
  const [isPasting, setIsPasting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "error" | "success" } | null>(null);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [environment, setEnvironment] = useState<"local" | "preview" | null>(null);
  const [hasPreviewAccess, setHasPreviewAccess] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [isPfpDropdownOpen, setIsPfpDropdownOpen] = useState(false);
  const [isHelpDropdownOpen, setIsHelpDropdownOpen] = useState(false);
  const [pfpDropdownPosition, setPfpDropdownPosition] = useState({ top: 0, right: 0 });
  const [helpDropdownPosition, setHelpDropdownPosition] = useState({ top: 0, right: 0 });
  const [mounted, setMounted] = useState(false);
  const pfpDropdownRef = useRef<HTMLDivElement>(null);
  const helpDropdownRef = useRef<HTMLDivElement>(null);
  const pfpButtonRef = useRef<HTMLButtonElement>(null);
  const helpButtonRef = useRef<HTMLButtonElement>(null);

  const checkPreviewAccess = useCallback(async (fid: number) => {
    try {
      const response = await fetch(`/api/admin/check?fid=${fid}`);
      if (response.ok) {
        const data = await response.json();
        // Check if user has admin, superadmin, or tester role
        const hasAccess = data.isAdmin || data.roles?.includes("tester");
        setHasPreviewAccess(hasAccess);
        // Also check if user is admin or superadmin for admin panel access
        setIsAdminUser(data.isAdmin || data.isSuperAdmin);
      } else {
        setHasPreviewAccess(false);
        setIsAdminUser(false);
      }
    } catch (error) {
      console.error("Failed to check preview access:", error);
      setHasPreviewAccess(false);
      setIsAdminUser(false);
    }
  }, []);

  const checkAdminStatus = useCallback(async (fid: number) => {
    try {
      const response = await fetch(`/api/admin/check?fid=${fid}`);
      if (response.ok) {
        const data = await response.json();
        setIsAdminUser(data.isAdmin || data.isSuperAdmin);
      } else {
        setIsAdminUser(false);
      }
    } catch (error) {
      console.error("Failed to check admin status:", error);
      setIsAdminUser(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const hostname = window.location.hostname;
      if (hostname === "localhost" || hostname === "127.0.0.1" || hostname.startsWith("192.168.") || hostname.startsWith("10.")) {
        setEnvironment("local");
      } else if (hostname === "preview.depthcaster.com") {
        setEnvironment("preview");
        // Check if user has admin or tester role for preview access
        if (user?.fid) {
          checkPreviewAccess(user.fid);
        } else {
          setHasPreviewAccess(false);
          setIsAdminUser(false);
        }
      } else {
        setEnvironment(null);
      }
    }
  }, [user, checkPreviewAccess]);

  // Check admin status whenever user changes
  useEffect(() => {
    if (user?.fid) {
      checkAdminStatus(user.fid);
    } else {
      setIsAdminUser(false);
    }
  }, [user, checkAdminStatus]);

  // Set mounted flag for portal rendering
  useEffect(() => {
    setMounted(true);
  }, []);

  // Update browser tab title and favicon based on environment
  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") {
      return;
    }

    const originalTitle = "Depthcaster - Deep Thoughts on Farcaster";
    
    const createFavicon = (color: string, letter: string): string => {
      // Create a canvas-based favicon for better browser compatibility
      const canvas = document.createElement("canvas");
      canvas.width = 32;
      canvas.height = 32;
      const ctx = canvas.getContext("2d");
      
      if (!ctx) {
        // Fallback to SVG if canvas not available
        return `data:image/svg+xml,${encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="${color}"/><text x="16" y="22" font-size="20" font-weight="bold" text-anchor="middle" fill="#000" font-family="Arial, sans-serif">${letter}</text></svg>`
        )}`;
      }
      
      // Draw circle background
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(16, 16, 16, 0, 2 * Math.PI);
      ctx.fill();
      
      // Draw letter
      ctx.fillStyle = "#000";
      ctx.font = "bold 20px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(letter, 16, 16);
      
      return canvas.toDataURL("image/png");
    };
    
    const updateFavicon = (href: string) => {
      // Remove ALL existing dynamic favicons
      const existingDynamic = document.querySelectorAll("link[data-dynamic-favicon]");
      existingDynamic.forEach(link => {
        link.remove();
      });

      // Remove all existing icon links to ensure our new one takes precedence
      const allIconLinks = document.querySelectorAll("link[rel*='icon']");
      allIconLinks.forEach(link => {
        const rel = (link as HTMLLinkElement).rel;
        if (rel === "icon" || rel === "shortcut icon") {
          link.remove();
        }
      });

      // Create a new favicon link that takes precedence
      const newLink = document.createElement("link");
      newLink.rel = "icon";
      newLink.type = "image/png";
      newLink.href = href;
      newLink.setAttribute("data-dynamic-favicon", "true");
      
      // Insert at the very beginning of head to take precedence
      if (document.head.firstChild) {
        document.head.insertBefore(newLink, document.head.firstChild);
      } else {
        document.head.appendChild(newLink);
      }
    };

    // Use setInterval to continuously update title (in case Next.js overwrites it)
    let titleInterval: NodeJS.Timeout | null = null;

    if (environment === "local") {
      const newTitle = "🧪 LOCAL - " + originalTitle;
      document.title = newTitle;
      
      // Keep updating title in case Next.js overwrites it
      titleInterval = setInterval(() => {
        if (document.title !== newTitle) {
          document.title = newTitle;
        }
      }, 100);
      
      const yellowFavicon = createFavicon("#eab308", "L");
      updateFavicon(yellowFavicon);
    } else if (environment === "preview" && hasPreviewAccess) {
      const newTitle = "🔍 PREVIEW - " + originalTitle;
      document.title = newTitle;
      
      // Keep updating title in case Next.js overwrites it
      titleInterval = setInterval(() => {
        if (document.title !== newTitle) {
          document.title = newTitle;
        }
      }, 100);
      
      const orangeFavicon = createFavicon("#f97316", "P");
      updateFavicon(orangeFavicon);
    } else {
      // Reset to original
      document.title = originalTitle;
      // Remove dynamic favicon to restore original
      const dynamicFavicon = document.querySelectorAll("link[data-dynamic-favicon]");
      dynamicFavicon.forEach(link => {
        link.remove();
      });
    }
    
    // Cleanup interval on unmount or environment change
    return () => {
      if (titleInterval) {
        clearInterval(titleInterval);
      }
    };
  }, [environment, hasPreviewAccess]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Listen for toast events from other components (e.g., CastCard)
  useEffect(() => {
    const handleShowToast = (event: Event) => {
      const customEvent = event as CustomEvent<{ message: string; type: "error" | "success" }>;
      setToast({ message: customEvent.detail.message, type: customEvent.detail.type });
    };

    window.addEventListener("showToast", handleShowToast);
    return () => {
      window.removeEventListener("showToast", handleShowToast);
    };
  }, []);

  // Update dropdown positions when they open
  useEffect(() => {
    if (isPfpDropdownOpen && pfpButtonRef.current) {
      const rect = pfpButtonRef.current.getBoundingClientRect();
      setPfpDropdownPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
  }, [isPfpDropdownOpen]);

  useEffect(() => {
    if (isHelpDropdownOpen && helpButtonRef.current) {
      const rect = helpButtonRef.current.getBoundingClientRect();
      setHelpDropdownPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
  }, [isHelpDropdownOpen]);

  // Close PFP dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        pfpDropdownRef.current &&
        !pfpDropdownRef.current.contains(event.target as Node) &&
        pfpButtonRef.current &&
        !pfpButtonRef.current.contains(event.target as Node)
      ) {
        setIsPfpDropdownOpen(false);
      }
    };

    if (isPfpDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isPfpDropdownOpen]);

  // Close help dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        helpDropdownRef.current &&
        !helpDropdownRef.current.contains(event.target as Node) &&
        helpButtonRef.current &&
        !helpButtonRef.current.contains(event.target as Node)
      ) {
        setIsHelpDropdownOpen(false);
      }
    };

    if (isHelpDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isHelpDropdownOpen]);

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

  const handlePasteToCurate = async () => {
    if (!user?.fid || isPasting) return;

    try {
      setIsPasting(true);
      
      // Read clipboard
      let clipboardText: string;
      try {
        clipboardText = await navigator.clipboard.readText();
      } catch (clipboardError: any) {
        // Clipboard API might fail if permission denied or not HTTPS
        showToast("Unable to access clipboard. Please ensure you're on HTTPS and have granted clipboard permissions.");
        return;
      }
      
      // Extract cast identifier (URL or hash)
      const castIdentifier = extractCastIdentifier(clipboardText);
      
      if (!castIdentifier) {
        showToast("Clipboard doesn't contain a valid cast link or hash");
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

      // Curate the cast
      const curateResponse = await fetch("/api/curate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          castHash,
          curatorFid: user.fid,
          castData,
        }),
      });

      if (!curateResponse.ok) {
        const errorData = await curateResponse.json();
        if (curateResponse.status === 403) {
          showToast("You don't have permission to curate casts");
        } else if (curateResponse.status === 409) {
          showToast("This cast is already curated");
        } else {
          showToast(errorData.error || "Failed to curate cast");
        }
        return;
      }

      // Success - show success message
      showToast("Curated", "success");

      // Track analytics
      analytics.trackCuratePaste(castHash, user.fid);

      // Scroll to the cast in the feed
      window.dispatchEvent(new CustomEvent("scrollToCast", { detail: castHash }));

      // Check if auto-like is enabled and handle auto-like
      if (user?.fid && user?.signer_uuid) {
        try {
          // Fetch user preferences
          const prefsResponse = await fetch(
            `/api/user/preferences?fid=${user.fid}&signerUuid=${user.signer_uuid}`
          );
          if (prefsResponse.ok) {
            const prefsData = await prefsResponse.json();
            const autoLikeEnabled = prefsData.autoLikeOnCurate !== undefined ? prefsData.autoLikeOnCurate : true;
            const hasSeenNotification = prefsData.hasSeenAutoLikeNotification || false;

            // Check if cast is curated by deepbot by checking curators
            let isCuratedByDeepbot = false;
            try {
              const checkResponse = await fetch(`/api/curate?castHash=${castHash}`);
              if (checkResponse.ok) {
                const checkData = await checkResponse.json();
                isCuratedByDeepbot = (checkData.curatorInfo || []).some((c: any) => c.username?.toLowerCase() === "deepbot");
              }
            } catch (error) {
              console.error("Failed to check curators:", error);
            }

            // Auto-like if enabled and not curated by deepbot
            if (autoLikeEnabled && !isCuratedByDeepbot) {
              try {
                await fetch("/api/reaction", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    signerUuid: user.signer_uuid,
                    reactionType: "like",
                    target: castHash,
                    targetAuthorFid: castData.author?.fid,
                  }),
                });
              } catch (error) {
                console.error("Failed to auto-like cast:", error);
              }
            }

            // Show notification if first time
            if (!hasSeenNotification && autoLikeEnabled) {
              // Update hasSeenAutoLikeNotification flag
              try {
                await fetch("/api/user/preferences", {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    fid: user.fid,
                    signerUuid: user.signer_uuid,
                    hasSeenAutoLikeNotification: true,
                  }),
                });
              } catch (error) {
                console.error("Failed to update notification flag:", error);
              }
              // Note: For paste-to-curate, we'll show a toast instead of modal since we're reloading
              showToast("Casts you curate will be automatically liked (except those curated with @deepbot)", "success");
            }
          }
        } catch (error) {
          console.error("Failed to fetch preferences for auto-like:", error);
        }
      }

      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error: any) {
      console.error("Paste to curate error:", error);
      showToast(error.message || "Failed to curate cast");
    } finally {
      setIsPasting(false);
    }
  };

  return (
    <>
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
      {environment === "local" && (
        <div
          className="fixed top-0 left-0 right-0 z-[300] w-full text-center py-2 px-4 text-sm font-semibold bg-yellow-500 text-yellow-900 dark:bg-yellow-600 dark:text-yellow-100"
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
          🧪 LOCAL TESTING
        </div>
      )}
      {environment === "preview" && hasPreviewAccess && (
        <div
          className="fixed top-0 left-0 right-0 z-[300] w-full text-center py-2 px-4 text-sm font-semibold bg-orange-500 text-orange-900 dark:bg-orange-600 dark:text-orange-100"
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
          🔍 PREVIEW ENVIRONMENT
        </div>
      )}
      <header 
        className="sticky top-0 z-[200] bg-white/80 dark:bg-black/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-800 overflow-x-hidden w-full" 
        style={{ 
          paddingTop: 'env(safe-area-inset-top, 0px)' 
        }}
      >
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2">
                <Link href="/" className="text-xs sm:text-2xl font-bold text-gray-900 dark:text-gray-100 leading-tight">
                  Depthcaster
                </Link>
                <span className="text-[10px] sm:text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  Alpha
                </span>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 hidden sm:block">
              Depth is a sharp insight, a strong contribution to a topic, a display of intellect and thoughtfulness
            </p>
          </div>
          
          <div className="flex items-center gap-0.5 sm:gap-2 min-w-0">
            {user ? (
              <>
                <HeaderUserSearch />
                <button
                  onClick={handlePasteToCurate}
                  disabled={isPasting}
                  className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Paste to curate"
                  title="Paste cast link to curate"
                >
                  {isPasting ? (
                    <svg
                      className="w-5 h-5 sm:w-6 sm:h-6 animate-spin"
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
                      className="w-5 h-5 sm:w-6 sm:h-6"
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
                <div className="relative">
                  <button
                    ref={helpButtonRef}
                    onClick={() => setIsHelpDropdownOpen(!isHelpDropdownOpen)}
                    className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                    aria-label="Help"
                    title="Help"
                  >
                    <HelpCircle className="w-5 h-5 sm:w-6 sm:h-6" />
                  </button>
                  {isHelpDropdownOpen && mounted && createPortal(
                    <div
                      ref={helpDropdownRef}
                      className="fixed w-48 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 py-1 z-[9998]"
                      style={{
                        top: `${helpDropdownPosition.top}px`,
                        right: `${helpDropdownPosition.right}px`,
                      }}
                    >
                      <button
                        onClick={() => {
                          analytics.trackFeedbackModalOpen();
                          setIsFeedbackModalOpen(true);
                          setIsHelpDropdownOpen(false);
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      >
                        Feedback
                      </button>
                      <Link
                        href="/why"
                        onClick={() => setIsHelpDropdownOpen(false)}
                        className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      >
                        Why Depthcaster
                      </Link>
                    </div>,
                    document.body
                  )}
                </div>
                <NotificationBell />
                <div className="relative">
                  <button
                    ref={pfpButtonRef}
                    onClick={() => setIsPfpDropdownOpen(!isPfpDropdownOpen)}
                    className="flex items-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors p-1"
                    aria-label="User menu"
                  >
                    <AvatarImage
                      src={user.pfp_url}
                      alt={user.username}
                      size={32}
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover"
                    />
                  </button>
                  {isPfpDropdownOpen && mounted && createPortal(
                    <div
                      ref={pfpDropdownRef}
                      className="fixed w-48 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 py-1 z-[9998]"
                      style={{
                        top: `${pfpDropdownPosition.top}px`,
                        right: `${pfpDropdownPosition.right}px`,
                      }}
                    >
                      <Link
                        href={`/profile/${user.fid}`}
                        onClick={() => {
                          analytics.trackNavProfile(user.fid);
                          setIsPfpDropdownOpen(false);
                        }}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      >
                        <User className="w-4 h-4" />
                        Profile
                      </Link>
                      <Link
                        href="/settings"
                        onClick={() => {
                          analytics.trackNavSettings();
                          setIsPfpDropdownOpen(false);
                        }}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      >
                        <Settings className="w-4 h-4" />
                        Settings
                      </Link>
                      {isAdminUser && (
                        <Link
                          href="/admin"
                          onClick={() => {
                            setIsPfpDropdownOpen(false);
                          }}
                          className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        >
                          <Shield className="w-4 h-4" />
                          Admin Panel
                        </Link>
                      )}
                    </div>,
                    document.body
                  )}
                </div>
              </>
            ) : (
              !isMiniapp && <NeynarAuthButton />
            )}
          </div>
        </div>
      </header>
      <FeedbackModal isOpen={isFeedbackModalOpen} onClose={() => setIsFeedbackModalOpen(false)} />
    </>
  );
}


