"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { CastCard } from "./CastCard";
import { Cast } from "@neynar/nodejs-sdk/build/api";
import Link from "next/link";
import { CloseFriendsPrompt } from "./CloseFriendsPrompt";
import { My37Manager } from "./My37Manager";
import { shouldHideCast, getFeedPreferences, FeedSettingsInline, CuratorFilterInline } from "./FeedSettings";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { saveFeedState, getFeedState, isStateStale, throttle } from "@/lib/feedState";
import { NeynarAuthButton } from "@neynar/react";
import { analytics } from "@/lib/analytics";
import { useActivityMonitor } from "@/lib/hooks/useActivityMonitor";

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
  const normalizeFeedType = useCallback((type: FeedType): "curated" | "following" | "for-you" | "trending" | "my-37" => {
    // If not logged in, only allow curated feed
    if (!viewerFid) {
      return "curated";
    }
    
    // Explicitly handle each valid feed type
    if (type === "curated") {
      return "curated";
    }
    if (type === "following") {
      return "following";
    }
    if (type === "for-you") {
      return "for-you";
    }
    if (type === "my-37") {
      return "my-37";
    }
    if (type === "trending") {
      return "trending";
    }
    // Default to curated for any unrecognized types
    return "curated";
  }, [viewerFid]);

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
  const [selectedCategory, setSelectedCategory] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("selectedCategory");
      return saved || null;
    }
    return null;
  });
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const [selectedCuratorFids, setSelectedCuratorFids] = useState<number[]>([]);
  const [my37PackId, setMy37PackId] = useState<string | null>(null);
  const [my37HasUsers, setMy37HasUsers] = useState<boolean>(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [sortBy, setSortBy] = useState<"recently-curated" | "time-of-cast" | "recent-reply">("recent-reply");
  const sortByInitializedRef = useRef(false);
  const [hasNewCuratedCasts, setHasNewCuratedCasts] = useState(false);
  const curatorFilterInitializedRef = useRef(false);
  
  // Use shared activity monitor for curated feed refresh
  const { isUserActive, isTabVisible } = useActivityMonitor({
    inactivityThreshold: 3 * 60 * 1000, // 3 minutes
  });
  
  // Load sortBy from localStorage after hydration (only once)
  useEffect(() => {
    if (!sortByInitializedRef.current) {
      const saved = localStorage.getItem("curatedFeedSortBy");
      if (saved === "recently-curated" || saved === "time-of-cast" || saved === "recent-reply") {
        setSortBy(saved);
      }
      sortByInitializedRef.current = true;
    }
  }, []);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const lastFetchTimeRef = useRef<number>(0);
  const consecutiveLoadsRef = useRef<number>(0);
  const isRestoringScrollRef = useRef<boolean>(false);
  const scrollRestoredRef = useRef<boolean>(false);
  const castsRestoredRef = useRef<boolean>(false);
  const feedViewStartTimeRef = useRef<number | null>(null);
  const feedViewIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // Rate limiting: minimum 2 seconds between API calls
  const MIN_FETCH_INTERVAL = 2000;

  // Sync feedType with URL query params (primary source of truth)
  useEffect(() => {
    const urlFeed = searchParams.get("feed") as FeedType | null;
    const feedToUse = urlFeed || initialFeedType || "curated";
    const normalized = normalizeFeedType(feedToUse);
    
    setFeedType((current) => {
      // Only update if the normalized type is different from current
      if (normalized !== current) {
        return normalized;
      }
      return current;
    });
  }, [searchParams, viewerFid, initialFeedType, normalizeFeedType]);

  // Normalize feedType if viewerFid changes (affects feed availability)
  // This only runs when viewerFid changes, not when feedType changes
  useEffect(() => {
    // Get the current feed type from URL (source of truth) or state
    const urlFeed = searchParams.get("feed") as FeedType | null;
    // Use functional update to get current feedType without adding it to dependencies
    setFeedType((currentFeedType) => {
      const feedToCheck = urlFeed || currentFeedType;
      const normalized = normalizeFeedType(feedToCheck as FeedType);
      
      // Only update if normalization changed the type (e.g., user logged out and had "trending" selected)
      if (normalized !== feedToCheck) {
        // Update URL to reflect normalized type
        const params = new URLSearchParams(window.location.search);
        params.set("feed", normalized);
        router.replace(`/?${params.toString()}`, { scroll: false });
        return normalized;
      }
      return currentFeedType;
    });
  }, [viewerFid, searchParams, router, normalizeFeedType]);

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
  // Automatically includes new curators, only excludes those explicitly removed
  useEffect(() => {
    // Only initialize when on curated feed
    if (feedType !== "curated") {
      // Reset initialization flag when switching away from curated feed
      curatorFilterInitializedRef.current = false;
      return;
    }
    
    // Get excluded curators (those explicitly removed by user)
    const getExcludedCurators = (): number[] => {
      const saved = localStorage.getItem("excludedCuratorFids");
      if (saved) {
        try {
          const fids = JSON.parse(saved);
          if (Array.isArray(fids)) {
            return fids;
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
      return [];
    };
    
    // Fetch all curators and select all except excluded ones
    const updateCuratorSelection = async () => {
      try {
        const response = await fetch("/api/curators");
        if (response.ok) {
          const data = await response.json();
          const allCuratorFids = (data.curators || []).map((c: Curator) => c.fid);
          const excludedFids = getExcludedCurators();
          
          // Select all curators except excluded ones
          const selectedFids = allCuratorFids.filter((fid: number) => !excludedFids.includes(fid));
          
          if (allCuratorFids.length > 0) {
            setSelectedCuratorFids(selectedFids);
            // Initialize the ref to track changes
            prevSelectedCuratorFidsRef.current = [...selectedFids];
            // Also update selectedCuratorFids in localStorage for backward compatibility
            localStorage.setItem("selectedCuratorFids", JSON.stringify(selectedFids));
          }
        }
      } catch (error) {
        console.error("Failed to fetch curators:", error);
      }
    };
    
    // Update selection to include new curators when switching to curated feed
    // This ensures new curators are automatically included
    updateCuratorSelection();
    
    if (!curatorFilterInitializedRef.current) {
      curatorFilterInitializedRef.current = true;
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
    analytics.trackFeedPackSelect(feedType, packIds);
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

    const fetchStartTime = performance.now();
    const isInitialLoad = !newCursor;
    
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
      // Add curator filter and sort for curated feed
      if (feedType === "curated") {
        params.append("curatorFids", selectedCuratorFids.join(","));
        params.append("sortBy", sortBy);
        if (selectedCategory) {
          params.append("category", selectedCategory);
        }
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
        // Mark that we've fetched new casts, so restore effect won't overwrite them
        castsRestoredRef.current = true;
      }

      setCursor(data.next?.cursor || null);
      setHasMore(!!data.next?.cursor);
    } catch (err: unknown) {
      const error = err as { message?: string };
      console.error(`[Feed] Error:`, error.message || "Failed to load feed");
      setError(error.message || "Failed to load feed");
    } finally {
      setLoading(false);
    }
  }, [feedType, viewerFid, selectedCuratorFids, selectedCategory, my37PackId, my37HasUsers, sortBy]);

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
  const lastFetchedFeedTypeRef = useRef<string>(""); // Track what we actually fetched
  const prevSortByRef = useRef<string>("");
  const prevSelectedCategoryRef = useRef<string | null>(null);
  const prevMy37PackIdRef = useRef<string | null>(null);
  const prevSelectedCuratorFidsRef = useRef<number[]>([]);
  const fetchingRef = useRef<boolean>(false);
  const hasInitialFetchRef = useRef<boolean>(false);

  // Save scroll position and feed state (throttled)
  const saveScrollPosition = useCallback(() => {
    if (isRestoringScrollRef.current) return;
    
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    const castHashes = casts.map((cast) => cast.hash || "").filter(Boolean);
    
    saveFeedState(feedType, {
      scrollY,
      cursor,
      castHashes,
      casts: casts, // Save full cast objects for instant restoration
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
    if (prevFeedTypeRef.current && prevFeedTypeRef.current !== feedType) {
      // Save state for previous feed type before switching
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      const castHashes = casts.map((cast) => cast.hash || "").filter(Boolean);
      if (castHashes.length > 0 || scrollY > 0) {
        saveFeedState(prevFeedTypeRef.current, {
          scrollY,
          cursor,
          castHashes,
          casts: casts, // Save full cast objects
        });
      }
      
      // Reset restoration flag for new feed type
      scrollRestoredRef.current = false;
    }
    prevFeedTypeRef.current = feedType;
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

  // Restore casts from saved state when returning to feed (before fetching)
  useEffect(() => {
    // Only restore if we're on the home page and haven't restored casts yet
    if (pathname !== "/" || castsRestoredRef.current) return;
    
    // Don't restore if we're currently loading or if casts are empty (we're switching feeds)
    if (loading || casts.length === 0) {
      // If feed type changed, mark that we've checked and shouldn't restore
      const feedTypeChanged = prevFeedTypeRef.current !== feedType;
      const sortByChanged = prevSortByRef.current !== sortBy;
      if (feedTypeChanged || (sortByChanged && feedType === "curated")) {
        castsRestoredRef.current = false; // Reset for new feed type
      }
      return;
    }
    
    // Don't restore if feed type changed or sortBy changed (for curated)
    const feedTypeChanged = prevFeedTypeRef.current !== feedType;
    const sortByChanged = prevSortByRef.current !== sortBy;
    if (feedTypeChanged || (sortByChanged && feedType === "curated")) {
      castsRestoredRef.current = false; // Reset for new feed type
      return;
    }
    
    const savedState = getFeedState(feedType);
    if (savedState?.casts && savedState.casts.length > 0) {
      setCasts(savedState.casts);
      setCursor(savedState.cursor);
      setHasMore(!!savedState.cursor);
      setLoading(false);
      castsRestoredRef.current = true;
      // Reset scroll restoration flag so it can restore after casts are rendered
      scrollRestoredRef.current = false;
      
      // If state is stale, refresh in background
      if (isStateStale(feedType)) {
        // Refresh in background without showing loading state
        fetchFeed().catch(console.error);
      }
    } else {
      castsRestoredRef.current = true; // Mark as checked even if no saved state
    }
  }, [pathname, feedType, sortBy, fetchFeed, loading, casts.length]);

  // Separate effect for feed type changes and other dependencies
  useEffect(() => {
    const feedTypeChanged = prevFeedTypeRef.current !== feedType;
    const sortByChanged = prevSortByRef.current !== sortBy;
    // Check if curator FIDs changed by comparing arrays
    // Check if curator FIDs changed by comparing sorted arrays
    const prevFidsSorted = [...prevSelectedCuratorFidsRef.current].sort();
    const currentFidsSorted = [...selectedCuratorFids].sort();
    const curatorFidsChanged = JSON.stringify(prevFidsSorted) !== JSON.stringify(currentFidsSorted);
    const categoryChanged = prevSelectedCategoryRef.current !== selectedCategory;
    const isInitialMount = !hasInitialFetchRef.current;
    // Check if we need to fetch based on what we last fetched, not what we last saw
    const needsFetch = lastFetchedFeedTypeRef.current !== feedType || 
                      (sortByChanged && feedType === "curated" && !isInitialMount) ||
                      isInitialMount;
    
    // Load My 37 pack ID when switching to my-37 feed
    if (feedType === "my-37" && viewerFid && !my37PackId) {
      fetchMy37PackId();
      return;
    }
    
    // Handle feed type changes - clear state when switching
    // Check if feed type actually changed by comparing with lastFetchedFeedTypeRef instead of prevFeedTypeRef
    // This is more reliable because prevFeedTypeRef might be updated by other effects
    const actualFeedTypeChanged = lastFetchedFeedTypeRef.current !== feedType && lastFetchedFeedTypeRef.current !== "";
    
    if (feedTypeChanged || actualFeedTypeChanged) {
      setCasts([]);
      setCursor(null);
      setHasMore(false);
      setLoading(true); // Set loading immediately when switching feeds
      fetchingRef.current = false;
      scrollRestoredRef.current = false; // Allow restoration for new feed type
      castsRestoredRef.current = false; // Reset casts restoration for new feed type
      // Reset last fetched ref to ensure we fetch the new feed type
      lastFetchedFeedTypeRef.current = "";
      // Don't update prevFeedTypeRef here - update it after we've checked shouldFetch
    }
    
    // Clear feed when sortBy changes (for curated feed)
    if (sortByChanged && feedType === "curated" && !isInitialMount) {
      setCasts([]);
      setCursor(null);
      setHasMore(false);
      castsRestoredRef.current = false; // Reset casts restoration when sort changes
      prevSortByRef.current = sortBy;
    } else if (sortByChanged) {
      // Update sortBy ref even if not curated
      prevSortByRef.current = sortBy;
    }
    
    // Clear feed when curator FIDs change (for curated feed)
    if (curatorFidsChanged && feedType === "curated" && !isInitialMount) {
      setCasts([]);
      setCursor(null);
      setHasMore(false);
      castsRestoredRef.current = false; // Reset casts restoration when curator filter changes
      prevSelectedCuratorFidsRef.current = [...selectedCuratorFids];
    } else if (curatorFidsChanged) {
      // Update curator FIDs ref even if not curated
      prevSelectedCuratorFidsRef.current = [...selectedCuratorFids];
    }
    
    // Clear feed when category changes (for curated feed)
    if (categoryChanged && feedType === "curated" && !isInitialMount) {
      setCasts([]);
      setCursor(null);
      setHasMore(false);
      castsRestoredRef.current = false; // Reset casts restoration when category filter changes
      prevSelectedCategoryRef.current = selectedCategory;
    } else if (categoryChanged) {
      // Update category ref even if not curated
      prevSelectedCategoryRef.current = selectedCategory;
    }
    
    // Only fetch if not my-37 feed, or if my-37 feed has saved pack with users
    if (feedType !== "my-37" || (my37PackId && my37HasUsers)) {
      // Check if we already restored casts from saved state
      // If feed type changed, we should always fetch, so don't check hasRestoredCasts
      const hasRestoredCasts = castsRestoredRef.current && casts.length > 0;
      const isStateStaleResult = isStateStale(feedType);
      
      // Check if feed type actually changed by comparing with lastFetchedFeedTypeRef
      const actualFeedTypeChanged = lastFetchedFeedTypeRef.current !== feedType && lastFetchedFeedTypeRef.current !== "";
      
      // Always fetch when feed type changes, or on initial mount, or when sortBy changes for curated
      // or when curator FIDs change for curated feed, or when category changes for curated feed
      // Also check if we haven't fetched this feed type yet (defensive check)
      // Skip fetch if we just restored casts and state is not stale, BUT only if feed type hasn't changed
      const condition1 = isInitialMount;
      const condition2 = feedTypeChanged || actualFeedTypeChanged;
      const condition3 = (sortByChanged && feedType === "curated" && !isInitialMount);
      const condition4 = (curatorFidsChanged && feedType === "curated" && !isInitialMount);
      const condition5 = (categoryChanged && feedType === "curated" && !isInitialMount);
      const condition6 = (lastFetchedFeedTypeRef.current !== feedType && !fetchingRef.current);
      const fetchCondition = condition1 || condition2 || condition3 || condition4 || condition5 || condition6;
      // Only skip if we have restored casts AND state is not stale AND feed type hasn't actually changed
      const skipCondition = hasRestoredCasts && !isStateStaleResult && !actualFeedTypeChanged && !curatorFidsChanged && !categoryChanged;
      const shouldFetch = fetchCondition && !skipCondition;
      
      if (shouldFetch && !fetchingRef.current) {
        fetchingRef.current = true;
        hasInitialFetchRef.current = true;
        // Update the last fetched ref BEFORE fetching to prevent duplicate fetches
        lastFetchedFeedTypeRef.current = feedType;
        // Update prevFeedTypeRef after we've determined we need to fetch
        if (feedTypeChanged) {
          prevFeedTypeRef.current = feedType;
        }
        // Update curator FIDs ref when fetching due to curator change
        if (curatorFidsChanged && feedType === "curated") {
          prevSelectedCuratorFidsRef.current = [...selectedCuratorFids];
        }
        // Fetch the feed - fetchFeed already has the correct feedType in its closure
        fetchFeed();
        setTimeout(() => {
          fetchingRef.current = false;
        }, 1000);
      } else if (feedTypeChanged) {
        // If we didn't fetch but feed type changed, still update the ref
        prevFeedTypeRef.current = feedType;
      }
    } else if (feedTypeChanged) {
      // Update ref even if we can't fetch (e.g., my-37 without pack)
      prevFeedTypeRef.current = feedType;
    }
  }, [feedType, selectedCuratorFids, selectedCategory, preferencesVersion, fetchFeed, my37PackId, my37HasUsers, viewerFid, fetchMy37PackId, sortBy, casts.length]);
  
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
    analytics.trackFeedLoadMore(feedType);
    fetchFeed(cursor);
  }, [loading, hasMore, cursor, feedType, fetchFeed]);

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

  // Track feed view time
  useEffect(() => {
    // Helper to track feed view to database
    const trackFeedViewToDB = async (feedTypeToTrack: string, duration: number) => {
      try {
        await fetch("/api/analytics/feed-view", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            feedType: feedTypeToTrack,
            durationSeconds: duration,
            userFid: viewerFid || null,
            sortBy: sortBy || null,
            curatorFids: selectedCuratorFids.length > 0 ? selectedCuratorFids : null,
            packIds: selectedPackIds.length > 0 ? selectedPackIds : null,
          }),
        });
      } catch (error) {
        // Silently fail - analytics shouldn't break the app
        console.error("Failed to track feed view:", error);
      }
    };

    // End previous feed view if exists
    if (feedViewStartTimeRef.current !== null) {
      const duration = Math.floor((Date.now() - feedViewStartTimeRef.current) / 1000);
      if (duration > 0) {
        const prevFeedType = prevFeedTypeRef.current || feedType;
        analytics.trackFeedViewTime(
          prevFeedType,
          duration,
          sortBy,
          selectedCuratorFids,
          selectedPackIds
        );
        // Also track to database
        trackFeedViewToDB(prevFeedType, duration);
      }
    }

    // Clear previous interval
    if (feedViewIntervalRef.current) {
      clearInterval(feedViewIntervalRef.current);
    }

    // Start tracking new feed view
    feedViewStartTimeRef.current = Date.now();

    // Send periodic updates every 30 seconds
    feedViewIntervalRef.current = setInterval(() => {
      if (feedViewStartTimeRef.current !== null) {
        const duration = Math.floor((Date.now() - feedViewStartTimeRef.current) / 1000);
        if (duration > 0) {
          analytics.trackFeedViewTime(
            feedType,
            duration,
            sortBy,
            selectedCuratorFids,
            selectedPackIds
          );
          // Also track to database
          trackFeedViewToDB(feedType, duration);
        }
      }
    }, 30000);

    // Cleanup on unmount or feed change
    return () => {
      if (feedViewIntervalRef.current) {
        clearInterval(feedViewIntervalRef.current);
      }
      if (feedViewStartTimeRef.current !== null) {
        const duration = Math.floor((Date.now() - feedViewStartTimeRef.current) / 1000);
        if (duration > 0) {
          analytics.trackFeedViewTime(
            feedType,
            duration,
            sortBy,
            selectedCuratorFids,
            selectedPackIds
          );
          // Also track to database
          trackFeedViewToDB(feedType, duration);
        }
        feedViewStartTimeRef.current = null;
      }
    };
  }, [feedType, sortBy, selectedCuratorFids, selectedPackIds, viewerFid]);

  // Close login prompt when user logs in
  useEffect(() => {
    if (viewerFid && showLoginPrompt) {
      setShowLoginPrompt(false);
    }
  }, [viewerFid, showLoginPrompt]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    analytics.trackFeedScrollToTop(feedType);
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

  // Check for new curated casts without updating the UI
  const checkForNewCuratedCasts = useCallback(async () => {
    if (feedType !== "curated" || loading || casts.length === 0) {
      return;
    }

    try {
      const preferences = getFeedPreferences();
      const params = new URLSearchParams({
        feedType: "curated",
        limit: "30",
      });

      if (viewerFid) {
        params.append("viewerFid", viewerFid.toString());
      }

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

      params.append("curatorFids", selectedCuratorFids.join(","));
      params.append("sortBy", sortBy);

      const response = await fetch(`/api/feed?${params}`);
      if (!response.ok) {
        return;
      }

      const data = await response.json();
      const newCasts = data.casts || [];

      // Compare first cast hash to detect if feed has new content
      if (newCasts.length > 0 && casts.length > 0) {
        const currentFirstHash = casts[0]?.hash;
        const newFirstHash = newCasts[0]?.hash;
        
        // Check if there are any new casts (different first cast or new casts at the top)
        if (newFirstHash !== currentFirstHash) {
          // Check if any of the new top casts are not in current casts
          const currentHashes = new Set(casts.map(c => c.hash));
          const hasNewContent = newCasts.some((cast: Cast) => !currentHashes.has(cast.hash));
          
          if (hasNewContent) {
            setHasNewCuratedCasts(true);
          }
        } else {
          setHasNewCuratedCasts(false);
        }
      }
    } catch (err) {
      // Silently fail - don't show errors for background checks
      console.error("[Feed] Error checking for new curated casts:", err);
    }
  }, [feedType, loading, casts, viewerFid, selectedCuratorFids, sortBy]);

  // Activity-aware polling for curated feed
  const lastCheckTimeRef = useRef(0);
  const checkTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wasActiveRef = useRef(true);
  const wasVisibleRef = useRef(true);

  useEffect(() => {
    if (feedType !== "curated") {
      setHasNewCuratedCasts(false);
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
        checkTimeoutRef.current = null;
      }
      return;
    }

    const ACTIVE_POLL_INTERVAL = 60 * 1000; // 1 minute when active
    const INACTIVE_POLL_INTERVAL = 10 * 60 * 1000; // 10 minutes when inactive

    const scheduleNextCheck = () => {
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
      }

      // Determine poll interval based on activity state
      const pollInterval = isUserActive && isTabVisible 
        ? ACTIVE_POLL_INTERVAL 
        : INACTIVE_POLL_INTERVAL;

      checkTimeoutRef.current = setTimeout(() => {
        if (feedType === "curated" && !loading) {
          checkForNewCuratedCasts();
          scheduleNextCheck();
        }
      }, pollInterval);
    };

    // Initial check and schedule
    const now = Date.now();
    const timeSinceLastCheck = now - lastCheckTimeRef.current;
    
    // Check immediately if enough time has passed or on first check
    if (timeSinceLastCheck >= ACTIVE_POLL_INTERVAL || lastCheckTimeRef.current === 0) {
      checkForNewCuratedCasts();
      lastCheckTimeRef.current = now;
    }
    
    scheduleNextCheck();

    return () => {
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
      }
    };
  }, [feedType, isUserActive, isTabVisible, checkForNewCuratedCasts, loading]);

  // Handle activity changes - check immediately when user becomes active
  useEffect(() => {
    if (feedType !== "curated" || loading) return;

    if (isUserActive && !wasActiveRef.current && isTabVisible) {
      // User became active, check immediately
      checkForNewCuratedCasts();
      lastCheckTimeRef.current = Date.now();
    }
    wasActiveRef.current = isUserActive;
  }, [isUserActive, isTabVisible, feedType, checkForNewCuratedCasts, loading]);

  // Handle visibility changes - check immediately when tab becomes visible
  useEffect(() => {
    if (feedType !== "curated" || loading) return;

    if (isTabVisible && !wasVisibleRef.current && isUserActive) {
      // Tab became visible and user is active, check immediately
      checkForNewCuratedCasts();
      lastCheckTimeRef.current = Date.now();
    }
    wasVisibleRef.current = isTabVisible;
  }, [isTabVisible, isUserActive, feedType, checkForNewCuratedCasts, loading]);

  // Clear new casts indicator when feed is refreshed
  useEffect(() => {
    if (feedType === "curated" && casts.length > 0) {
      setHasNewCuratedCasts(false);
    }
  }, [casts, feedType]);

  // Listen for scroll-to-cast events (e.g., after successful curation)
  // Only handle this when on the home page (feed page)
  useEffect(() => {
    const handleScrollToCast = (event: Event) => {
      // Only handle scroll-to-cast when on the home page
      if (pathname !== "/") {
        return;
      }

      const customEvent = event as CustomEvent<string>;
      const castHash = customEvent.detail;
      if (!castHash) return;

      // Wait a bit for the feed to potentially refresh and include the new cast
      setTimeout(() => {
        // Try to find the cast element by data attribute
        const castElement = document.querySelector(`[data-cast-hash="${castHash}"]`);
        if (castElement) {
          castElement.scrollIntoView({ behavior: "smooth", block: "center" });
          // Add a highlight effect
          castElement.classList.add("ring-4", "ring-blue-500", "ring-opacity-50");
          setTimeout(() => {
            castElement.classList.remove("ring-4", "ring-blue-500", "ring-opacity-50");
          }, 2000);
        } else {
          // Cast might not be in feed yet, refresh feed and try again
          if (feedType === "curated") {
            fetchFeed().then(() => {
              setTimeout(() => {
                const castElement = document.querySelector(`[data-cast-hash="${castHash}"]`);
                if (castElement) {
                  castElement.scrollIntoView({ behavior: "smooth", block: "center" });
                  castElement.classList.add("ring-4", "ring-blue-500", "ring-opacity-50");
                  setTimeout(() => {
                    castElement.classList.remove("ring-4", "ring-blue-500", "ring-opacity-50");
                  }, 2000);
                }
              }, 500);
            });
          }
        }
      }, 300);
    };

    window.addEventListener("scrollToCast", handleScrollToCast);
    return () => {
      window.removeEventListener("scrollToCast", handleScrollToCast);
    };
  }, [feedType, fetchFeed, pathname]);

  return (
    <div className="w-full max-w-4xl mx-auto overflow-x-hidden">
      {/* Close Friends Prompt - shown at top of curated feed */}
      {feedType === "curated" && viewerFid && (
        <div className="mb-4">
          <CloseFriendsPrompt />
        </div>
      )}

      {/* New curated casts available banner */}
      {feedType === "curated" && hasNewCuratedCasts && (
        <div className="mb-4 mx-2 sm:mx-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg
                className="w-5 h-5 text-blue-600 dark:text-blue-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                New curated casts available
              </span>
            </div>
            <button
              onClick={() => {
                setHasNewCuratedCasts(false);
                fetchFeed();
              }}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-lg transition-colors"
            >
              Refresh
            </button>
          </div>
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
                  // Update state optimistically for immediate UI feedback
                  const normalized = normalizeFeedType(newType);
                  setFeedType(normalized);
                  // Update URL - this is the source of truth and will sync via useEffect
                  const params = new URLSearchParams(window.location.search);
                  params.set("feed", normalized);
                  router.replace(`/?${params.toString()}`, { scroll: false });
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
              
              // Track excluded curators (fetch all curators to determine which are excluded)
              fetch("/api/curators")
                .then(res => res.json())
                .then(data => {
                  const allCuratorFids = (data.curators || []).map((c: Curator) => c.fid);
                  const excludedFids = allCuratorFids.filter((fid: number) => !fids.includes(fid));
                  localStorage.setItem("excludedCuratorFids", JSON.stringify(excludedFids));
                })
                .catch(err => console.error("Failed to update excluded curators:", err));
              
              analytics.trackFeedCuratorFilter(feedType, fids);
            }}
          />
        )}
        
        {/* Category filter - shown only for curated feed */}
        {feedType === "curated" && (
          <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-black">
            <div className="px-3 sm:px-4 py-2 sm:py-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-600 dark:text-gray-400">Category:</span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory(null);
                    localStorage.removeItem("selectedCategory");
                  }}
                  className={`px-2.5 py-1 text-xs rounded transition-colors ${
                    !selectedCategory
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                  }`}
                >
                  All
                </button>
                {[
                  { value: "crypto-critique", label: "Crypto Critique" },
                  { value: "platform-analysis", label: "Platform Analysis" },
                  { value: "creator-economy", label: "Creator Economy" },
                  { value: "art-culture", label: "Art & Culture" },
                  { value: "ai-philosophy", label: "AI Philosophy" },
                  { value: "community-culture", label: "Community Culture" },
                  { value: "life-reflection", label: "Life Reflection" },
                  { value: "market-news", label: "Market News" },
                  { value: "playful", label: "Playful" },
                  { value: "other", label: "Other" },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setSelectedCategory(option.value);
                      localStorage.setItem("selectedCategory", option.value);
                    }}
                    className={`px-2.5 py-1 text-xs rounded transition-colors ${
                      selectedCategory === option.value
                        ? "bg-blue-600 text-white"
                        : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Sort options - shown only for curated feed */}
        {feedType === "curated" && (
          <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-black">
            <div className="px-3 sm:px-4 py-2 sm:py-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-600 dark:text-gray-400">Sort by:</span>
                {[
                  { value: "recently-curated", label: "Recently Curated" },
                  { value: "time-of-cast", label: "Time of Cast" },
                  { value: "recent-reply", label: "Recent Reply" },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      const newSortBy = option.value as typeof sortBy;
                      setSortBy(newSortBy);
                      localStorage.setItem("curatedFeedSortBy", option.value);
                      analytics.trackFeedSortChange(feedType, newSortBy);
                    }}
                    className={`px-2.5 py-1 text-xs rounded transition-colors ${
                      sortBy === option.value
                        ? "bg-blue-600 text-white"
                        : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
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
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-400"></div>
            <p>{feedType === "curated" ? "Building feed..." : "Loading feed..."}</p>
          </div>
        </div>
      ) : casts.length === 0 ? (
        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
          No casts found. Try a different feed type.
        </div>
      ) : (
        <>
          <div className="overflow-x-hidden relative min-h-[400px]">
            {loading && casts.length > 0 && (
              <div className="absolute inset-0 bg-white/90 dark:bg-black/90 backdrop-blur-sm z-10 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-400"></div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">{feedType === "curated" ? "Building feed..." : "Loading feed..."}</p>
                </div>
              </div>
            )}
            {casts
              .filter((cast) => feedType === "curated" || !shouldHideCast(cast))
              .map((cast) => (
                <CastCard
                  key={cast.hash}
                  cast={cast}
                  showThread
                  feedType={feedType}
                  sortBy={feedType === "curated" ? sortBy : undefined}
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
