"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { CastCard } from "./CastCard";
import { Cast } from "@neynar/nodejs-sdk/build/api";
import Link from "next/link";
import { CloseFriendsPrompt } from "./CloseFriendsPrompt";
import { My37Manager } from "./My37Manager";
import { shouldHideCast, getFeedPreferences, FeedSettingsInline, CuratorFilterInline } from "./FeedSettings";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { saveFeedState, getFeedState, throttle } from "@/lib/feedState";
import { NeynarAuthButton } from "@neynar/react";

interface Curator {
  fid: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
}

type FeedType = "curated" | "deep-thoughts" | "conversations" | "art" | "following" | "trending" | "packs" | "for-you" | "my-37";

interface Pack {
  id: string;
  name: string;
  description?: string | null;
  userCount: number;
}

interface FeedProps {
  viewerFid?: number;
  initialFeedType?: FeedType;
}

export function Feed({ viewerFid, initialFeedType = "curated" }: FeedProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  
  // Only allow visible feed types: "curated", "following", "for-you", "trending", or "my-37"
  // When not logged in, only allow "curated" feed
  const normalizeFeedType = (type: FeedType): "curated" | "following" | "for-you" | "trending" | "my-37" => {
    // If not logged in, only allow curated feed
    if (!viewerFid) {
      return "curated";
    }
    
    if (type === "following" && viewerFid) {
      return "following";
    }
    if (type === "for-you" && viewerFid) {
      return "for-you";
    }
    if (type === "my-37" && viewerFid) {
      return "my-37";
    }
    if (type === "trending" && viewerFid) {
      return "trending";
    }
    return "curated";
  };

  // Get feed type from URL or initial prop
  const urlFeedType = searchParams.get("feed") as FeedType | null;
  const effectiveInitialType = urlFeedType || initialFeedType;
  
  const [feedType, setFeedType] = useState<"curated" | "following" | "for-you" | "trending" | "my-37">(() => normalizeFeedType(effectiveInitialType));
  const [casts, setCasts] = useState<Cast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [selectedPackIds, setSelectedPackIds] = useState<string[]>([]);
  const [selectedPacks, setSelectedPacks] = useState<Pack[]>([]);
  const [favoritePacks, setFavoritePacks] = useState<Pack[]>([]);
  const [showPackSelector, setShowPackSelector] = useState(false);
  const [showFavoriteDropdown, setShowFavoriteDropdown] = useState(false);
  const [loadingPacks, setLoadingPacks] = useState(false);
  const [preferencesVersion, setPreferencesVersion] = useState(0);
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const [selectedCuratorFids, setSelectedCuratorFids] = useState<number[]>([]);
  const [my37PackId, setMy37PackId] = useState<string | null>(null);
  const [my37HasUsers, setMy37HasUsers] = useState<boolean>(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const lastFetchTimeRef = useRef<number>(0);
  const consecutiveLoadsRef = useRef<number>(0);
  const isRestoringScrollRef = useRef<boolean>(false);
  const scrollRestoredRef = useRef<boolean>(false);
  const previousFeedTypeRef = useRef<string>("");
  
  // Rate limiting: minimum 2 seconds between API calls
  const MIN_FETCH_INTERVAL = 2000;

  // Sync feedType with URL query params
  useEffect(() => {
    const urlFeed = searchParams.get("feed") as FeedType | null;
    if (urlFeed) {
      const normalized = normalizeFeedType(urlFeed);
      setFeedType((current) => {
        if (normalized !== current) {
          return normalized;
        }
        return current;
      });
    }
  }, [searchParams]);

  // Normalize feedType if viewerFid changes (affects "following" availability)
  useEffect(() => {
    const normalized = normalizeFeedType(feedType as FeedType);
    if (normalized !== feedType) {
      setFeedType(normalized);
      // Update URL to reflect normalized type
      const params = new URLSearchParams(window.location.search);
      params.set("feed", normalized);
      router.replace(`/?${params.toString()}`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerFid]);

  // Listen for preference changes to trigger re-render
  useEffect(() => {
    const handlePreferencesChange = () => {
      setPreferencesVersion((v) => v + 1);
    };
    window.addEventListener("feedPreferencesChanged", handlePreferencesChange);
    return () => {
      window.removeEventListener("feedPreferencesChanged", handlePreferencesChange);
    };
  }, []);

  // Don't automatically load packs from localStorage
  // Packs should only be applied when explicitly selected via UI
  // This prevents accidental pack filtering when curate/recast buttons trigger feed refresh
  // useEffect(() => {
  //   const saved = localStorage.getItem("selectedPackIds");
  //   if (saved) {
  //     try {
  //       const ids = JSON.parse(saved);
  //       if (Array.isArray(ids) && ids.length > 0) {
  //         setSelectedPackIds(ids);
  //         fetchSelectedPacks(ids);
  //       }
  //     } catch (e) {
  //       // Ignore parse errors
  //     }
  //   }
  // }, []);

  // Load selected curator FIDs from localStorage on mount, or default to curators with role
  useEffect(() => {
    const saved = localStorage.getItem("selectedCuratorFids");
    if (saved) {
      try {
        const fids = JSON.parse(saved);
        if (Array.isArray(fids) && fids.length > 0) {
          setSelectedCuratorFids(fids);
          return;
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
    
    // Default: fetch curators with role and select them
    const fetchDefaultCurators = async () => {
      try {
        const response = await fetch("/api/curators");
        if (response.ok) {
          const data = await response.json();
          const curatorFids = (data.curators || []).map((c: Curator) => c.fid);
          if (curatorFids.length > 0) {
            setSelectedCuratorFids(curatorFids);
            localStorage.setItem("selectedCuratorFids", JSON.stringify(curatorFids));
          }
        }
      } catch (error) {
        console.error("Failed to fetch default curators:", error);
      }
    };
    
    if (feedType === "curated") {
      fetchDefaultCurators();
    }
  }, [feedType]);

  const fetchSelectedPacks = async (packIds: string[]) => {
    try {
      setLoadingPacks(true);
      const packs: Pack[] = [];
      for (const packId of packIds) {
        try {
          const response = await fetch(`/api/curator-packs/${packId}`);
          if (response.ok) {
            const data = await response.json();
            packs.push({
              id: data.id,
              name: data.name,
              description: data.description,
              userCount: data.userCount || 0,
            });
          }
        } catch (error) {
          console.error(`Error fetching pack ${packId}:`, error);
        }
      }
      setSelectedPacks(packs);
    } catch (error) {
      console.error("Error fetching selected packs:", error);
    } finally {
      setLoadingPacks(false);
    }
  };

  const fetchFavoritePacks = async () => {
    if (!viewerFid) return;
    
    try {
      const response = await fetch(`/api/curator-packs/favorites?userFid=${viewerFid}`);
      if (response.ok) {
        const data = await response.json();
        setFavoritePacks(data.packs || []);
      }
    } catch (error) {
      console.error("Error fetching favorite packs:", error);
    }
  };

  const handlePackSelect = (packIds: string[]) => {
    setSelectedPackIds(packIds);
    localStorage.setItem("selectedPackIds", JSON.stringify(packIds));
    if (packIds.length > 0) {
      fetchSelectedPacks(packIds);
    } else {
      setSelectedPacks([]);
    }
  };

  const handleSelectFavoritePack = (packId: string) => {
    if (!selectedPackIds.includes(packId)) {
      const newSelected = [...selectedPackIds, packId];
      handlePackSelect(newSelected);
    }
    setShowFavoriteDropdown(false);
  };

  const handleRemovePack = (packId: string) => {
    const newSelected = selectedPackIds.filter((id) => id !== packId);
    handlePackSelect(newSelected);
  };

  const fetchFeed = useCallback(async (newCursor?: string | null) => {
    // Don't fetch my-37 feed if pack doesn't exist or has no users
    if (feedType === "my-37" && (!my37PackId || !my37HasUsers)) {
      setCasts([]);
      setCursor(null);
      setHasMore(false);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Get filter preferences
      const preferences = getFeedPreferences();

      // Only fetch for visible feed types
      const params = new URLSearchParams({
        feedType: feedType,
        limit: "30",
      });

      if (viewerFid) {
        params.append("viewerFid", viewerFid.toString());
      }

      if (newCursor) {
        params.append("cursor", newCursor);
      }

      // Add filter parameters
      if (preferences.hideDollarCasts) {
        params.append("hideDollarCasts", "true");
      }
      if (preferences.hideShortCasts) {
        params.append("hideShortCasts", "true");
        params.append("minCastLength", preferences.minCastLength.toString());
      }
      if (preferences.hideTradingWords && preferences.tradingWords.length > 0) {
        params.append("hideTradingWords", "true");
        params.append("tradingWords", preferences.tradingWords.join(","));
      }
      // Add curator filter for curated feed - always pass it (empty array means show nothing)
      if (feedType === "curated") {
        params.append("curatorFids", selectedCuratorFids.join(","));
      }
      // Don't add packIds for my-37 feed - API will fetch it directly
      // Don't automatically apply packIds from localStorage to prevent feed switching
      // when curate/recast buttons trigger feed refresh
      // Pack filtering should only happen when explicitly selected via UI
      // if (feedType !== "my-37" && selectedPackIds.length > 0) {
      //   params.append("packIds", selectedPackIds.join(","));
      // }
      
      // Add hide recasts preference for my-37 feed
      if (feedType === "my-37") {
        const my37HideRecasts = localStorage.getItem("my37HideRecasts");
        if (my37HideRecasts === "true") {
          params.append("hideRecasts", "true");
        }
      }

      const response = await fetch(`/api/feed?${params}`);
      if (!response.ok) {
        throw new Error("Failed to fetch feed");
      }

      const data = await response.json();
      
      if (newCursor) {
        setCasts((prev) => [...prev, ...data.casts]);
      } else {
        setCasts(data.casts);
      }

      setCursor(data.next?.cursor || null);
      setHasMore(!!data.next?.cursor);
    } catch (err: any) {
      setError(err.message || "Failed to load feed");
    } finally {
      setLoading(false);
    }
  }, [feedType, viewerFid, selectedCuratorFids, my37PackId, my37HasUsers]);

  const fetchMy37PackId = useCallback(async () => {
    if (!viewerFid) return;
    try {
      const response = await fetch(`/api/curator-packs?creatorFid=${viewerFid}`);
      if (response.ok) {
        const data = await response.json();
        const my37Pack = data.packs?.find((p: Pack) => p.name === "My 37");
        if (my37Pack) {
          setMy37PackId(my37Pack.id);
          // Check if pack has users
          const packResponse = await fetch(`/api/curator-packs/${my37Pack.id}`);
          if (packResponse.ok) {
            const packData = await packResponse.json();
            const hasUsers = packData.users && packData.users.length > 0;
            setMy37HasUsers(hasUsers);
          }
        } else {
          setMy37HasUsers(false);
        }
      }
    } catch (error) {
      console.error("Error fetching My 37 pack:", error);
      setMy37HasUsers(false);
    }
  }, [viewerFid]);

  // Track previous feed type and pack ID to detect changes
  const prevFeedTypeRef = useRef<string>("");
  const prevMy37PackIdRef = useRef<string | null>(null);
  const fetchingRef = useRef<boolean>(false);

  // Save scroll position and feed state (throttled)
  const saveScrollPosition = useCallback(() => {
    if (isRestoringScrollRef.current) return;
    
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    const castHashes = casts.map((cast) => cast.hash || "").filter(Boolean);
    
    saveFeedState(feedType, {
      scrollY,
      cursor,
      castHashes,
    });
  }, [feedType, cursor, casts]);

  // Throttled scroll handler - create stable reference
  const throttledSaveScrollRef = useRef<ReturnType<typeof throttle> | null>(null);
  
  useEffect(() => {
    throttledSaveScrollRef.current = throttle(() => {
      saveScrollPosition();
    }, 500);
  }, [saveScrollPosition]);

  // Restore feed state when casts are loaded and we're returning to same feed type
  useEffect(() => {
    // Only restore if we're on the home page, haven't restored yet, and casts are loaded
    if (pathname !== "/" || scrollRestoredRef.current || loading || casts.length === 0) return;

    const savedState = getFeedState(feedType);
    if (savedState && savedState.scrollY > 0) {
      // Mark that we're restoring to prevent saving during restoration
      isRestoringScrollRef.current = true;
      scrollRestoredRef.current = true;
      
      // Restore scroll position after DOM is ready
      // Use requestAnimationFrame to ensure layout is complete
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.scrollTo({ top: savedState.scrollY, behavior: "auto" });
          isRestoringScrollRef.current = false;
        });
      });
    } else {
      scrollRestoredRef.current = true;
    }
  }, [feedType, pathname, loading, casts.length]);

  // Save state when casts or cursor changes
  useEffect(() => {
    if (!scrollRestoredRef.current || isRestoringScrollRef.current) return;
    if (casts.length > 0) {
      saveScrollPosition();
    }
  }, [casts, cursor, saveScrollPosition]);

  // Save state when feed type changes (before clearing)
  useEffect(() => {
    if (previousFeedTypeRef.current && previousFeedTypeRef.current !== feedType) {
      // Save state for previous feed type before switching
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      const castHashes = casts.map((cast) => cast.hash || "").filter(Boolean);
      if (castHashes.length > 0 || scrollY > 0) {
        saveFeedState(previousFeedTypeRef.current, {
          scrollY,
          cursor,
          castHashes,
        });
      }
      
      // Reset restoration flag for new feed type
      scrollRestoredRef.current = false;
    }
    previousFeedTypeRef.current = feedType;
  }, [feedType, cursor, casts]);

  // Save state before navigating away
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveScrollPosition();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    // Note: Next.js App Router doesn't have router events like Pages Router
    // We'll rely on beforeunload and the pathname change effect
    
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      // Save on unmount as well
      saveScrollPosition();
    };
  }, [saveScrollPosition]);

  // Save state when pathname changes (user navigates away)
  useEffect(() => {
    if (pathname !== "/") {
      saveScrollPosition();
    }
  }, [pathname, saveScrollPosition]);
  
  // Listen for my37 preferences changes
  useEffect(() => {
    const handleMy37PreferencesChange = () => {
      if (feedType === "my-37" && my37PackId && my37HasUsers) {
        fetchFeed();
      }
    };
    
    window.addEventListener("my37PreferencesChanged", handleMy37PreferencesChange);
    return () => {
      window.removeEventListener("my37PreferencesChanged", handleMy37PreferencesChange);
    };
  }, [feedType, my37PackId, my37HasUsers, fetchFeed]);

  // Separate effect for feed type changes and other dependencies
  useEffect(() => {
    const feedTypeChanged = prevFeedTypeRef.current !== feedType;
    
    if (feedTypeChanged) {
      // Clear old feed type state if switching away
      if (prevFeedTypeRef.current) {
        // State was already saved in the previous effect
      }
      
      setCasts([]);
      setCursor(null);
      setHasMore(false);
      prevFeedTypeRef.current = feedType;
      fetchingRef.current = false;
      scrollRestoredRef.current = false; // Allow restoration for new feed type
    }
    
    // Load My 37 pack ID when switching to my-37 feed
    if (feedType === "my-37" && viewerFid && !my37PackId) {
      fetchMy37PackId();
      return;
    }
    
    // Only fetch if not my-37 feed, or if my-37 feed has saved pack with users
    if (feedType !== "my-37" || (my37PackId && my37HasUsers)) {
      // Fetch on feed type change (but prevent duplicate fetches)
      if (feedTypeChanged && !fetchingRef.current) {
        fetchingRef.current = true;
        fetchFeed();
        setTimeout(() => {
          fetchingRef.current = false;
        }, 1000);
      }
    }
  }, [feedType, selectedCuratorFids, preferencesVersion, fetchFeed, my37PackId, my37HasUsers, viewerFid, fetchMy37PackId]);
  
  // Separate effect for when My 37 pack becomes ready
  useEffect(() => {
    if (feedType === "my-37" && my37PackId && my37HasUsers) {
      const packBecameReady = prevMy37PackIdRef.current !== my37PackId;
      
      if (packBecameReady && !fetchingRef.current) {
        fetchingRef.current = true;
        fetchFeed();
        prevMy37PackIdRef.current = my37PackId;
        setTimeout(() => {
          fetchingRef.current = false;
        }, 1000);
      }
    }
  }, [my37PackId, my37HasUsers, feedType, fetchFeed]);

  const loadMore = useCallback(() => {
    const now = Date.now();
    const timeSinceLastFetch = now - lastFetchTimeRef.current;
    
    // Rate limiting: don't fetch if too soon since last fetch
    if (timeSinceLastFetch < MIN_FETCH_INTERVAL) {
      return;
    }
    
    // Don't fetch if already loading or no more content
    if (loading || !hasMore || !cursor) {
      return;
    }
    
    lastFetchTimeRef.current = now;
    consecutiveLoadsRef.current += 1;
    fetchFeed(cursor);
  }, [loading, hasMore, cursor, fetchFeed]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const target = entries[0];
        if (target.isIntersecting && hasMore && !loading) {
          loadMore();
        }
      },
      {
        root: null,
        rootMargin: "400px", // Start loading when 400px before bottom
        threshold: 0.1,
      }
    );

    const currentRef = loadMoreRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [hasMore, loading, loadMore]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showFavoriteDropdown && !(event.target as Element).closest('.favorite-dropdown')) {
        setShowFavoriteDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showFavoriteDropdown]);

  // Show scroll to top button when scrolled down and save scroll position
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      setShowScrollToTop(scrollY > 300);
      if (throttledSaveScrollRef.current) {
        throttledSaveScrollRef.current();
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Reset consecutive loads counter when feed type changes
  useEffect(() => {
    consecutiveLoadsRef.current = 0;
    lastFetchTimeRef.current = 0;
  }, [feedType]);

  // Close login prompt when user logs in
  useEffect(() => {
    if (viewerFid && showLoginPrompt) {
      setShowLoginPrompt(false);
    }
  }, [viewerFid, showLoginPrompt]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Memoize the onPackReady callback to prevent My37Manager from re-rendering
  const handlePackReady = useCallback((packId: string, hasUsers: boolean) => {
    // Only update state - let useEffect handle fetching
    // Use a small delay to batch state updates and prevent multiple fetches
    setTimeout(() => {
      setMy37PackId(packId);
      setMy37HasUsers(hasUsers);
      if (!hasUsers) {
        // Clear casts if pack has no users
        setCasts([]);
        setCursor(null);
        setHasMore(false);
      }
    }, 50);
  }, []);

  return (
    <div className="w-full max-w-4xl mx-auto overflow-x-hidden">
      {/* Close Friends Prompt - shown at top of curated feed */}
      {feedType === "curated" && viewerFid && (
        <div className="mb-4">
          <CloseFriendsPrompt />
        </div>
      )}

      {/* Feed type tabs */}
      <div className="sticky top-0 bg-white dark:bg-black border-b border-gray-200 dark:border-gray-800 z-40">
        <div className="flex gap-1 overflow-x-auto px-2 sm:px-4 scrollbar-hide overscroll-x-contain">
          {[
            { id: "curated", label: "Curated", requiresAuth: false },
            { id: "trending", label: "Trending", requiresAuth: true },
            { id: "for-you", label: "For You", requiresAuth: true },
            { id: "following", label: "Following", requiresAuth: true },
            { id: "my-37", label: "My 37", requiresAuth: true },
          ].map((tab) => {
            const isDisabled = tab.requiresAuth && !viewerFid;
            const isActive = feedType === tab.id;
            
            return (
              <button
                key={tab.id}
                onClick={() => {
                  if (isDisabled) {
                    setShowLoginPrompt(true);
                    return;
                  }
                  const newType = tab.id as "curated" | "following" | "for-you" | "trending" | "my-37";
                  setFeedType(newType);
                  // Update URL
                  const params = new URLSearchParams(window.location.search);
                  params.set("feed", newType);
                  router.push(`/?${params.toString()}`, { scroll: false });
                }}
                className={`px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                  isDisabled
                    ? "text-gray-400 dark:text-gray-600 cursor-pointer"
                    : isActive
                    ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        
        {/* Filter settings - shown for all feeds except curated */}
        {feedType !== "curated" && <FeedSettingsInline feedType={feedType} />}
        
        {/* Curator filter - shown only for curated feed */}
        {feedType === "curated" && (
          <CuratorFilterInline
            selectedCuratorFids={selectedCuratorFids}
            onCuratorFidsChange={(fids) => {
              setSelectedCuratorFids(fids);
              localStorage.setItem("selectedCuratorFids", JSON.stringify(fids));
            }}
          />
        )}
      </div>

      {/* My 37 Manager - shown below tabs for my-37 feed */}
      {feedType === "my-37" && viewerFid && (
        <div className="mb-4">
          <My37Manager 
            onPackReady={handlePackReady}
          />
        </div>
      )}

      {/* Feed content */}
      {error && (
        <div className="p-4 text-red-600 dark:text-red-400">
          Error: {error}
        </div>
      )}

      {feedType === "my-37" && (!my37PackId || !my37HasUsers) ? (
        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
          Select users above to create your My 37 feed.
        </div>
      ) : loading && casts.length === 0 ? (
        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
          Loading feed...
        </div>
      ) : casts.length === 0 ? (
        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
          No casts found. Try a different feed type.
        </div>
      ) : (
        <>
          <div className="overflow-x-hidden">
            {casts
              .filter((cast) => feedType === "curated" || !shouldHideCast(cast))
              .map((cast) => (
                <CastCard
                  key={cast.hash}
                  cast={cast}
                  showThread
                  feedType={feedType}
                  onUpdate={() => {
                    // Refresh the feed to get updated reaction counts
                    fetchFeed();
                  }}
                />
              ))}
          </div>

          {/* Infinite scroll trigger */}
          {hasMore && (
            <div ref={loadMoreRef} className="p-4 text-center">
              {loading && (
                <div className="text-gray-500 dark:text-gray-400 text-sm">
                  Loading more...
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Scroll to top button */}
      {showScrollToTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 sm:bottom-8 sm:right-8 z-50 p-3 bg-blue-600 dark:bg-blue-500 text-white rounded-full shadow-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-all duration-200 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          aria-label="Scroll to top"
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
              d="M5 10l7-7m0 0l7 7m-7-7v18"
            />
          </svg>
        </button>
      )}

      {/* Login Prompt Modal */}
      {showLoginPrompt && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setShowLoginPrompt(false)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-lg shadow-xl p-6 sm:p-8 max-w-md w-full mx-4 border border-gray-200 dark:border-gray-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                Sign in required
              </h2>
              <button
                onClick={() => setShowLoginPrompt(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                aria-label="Close"
              >
                <svg
                  className="w-6 h-6"
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
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Please sign in to access this feed.
            </p>
            <div className="flex justify-center [&_button]:cursor-pointer">
              <NeynarAuthButton />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
