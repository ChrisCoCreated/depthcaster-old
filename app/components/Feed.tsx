"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { CastCard } from "./CastCard";
import { Cast } from "@neynar/nodejs-sdk/build/api";
import Link from "next/link";
import { CloseFriendsPrompt } from "./CloseFriendsPrompt";
import { My37Manager } from "./My37Manager";
import { shouldHideCast, getFeedPreferences, FeedSettingsInline, CuratorFilterInline } from "./FeedSettings";
import { AvatarImage } from "./AvatarImage";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { saveFeedState, getFeedState, isStateStale, throttle } from "@/lib/feedState";
import { getPreviousNavigation } from "@/lib/navigationHistory";
import { NeynarAuthButton } from "@neynar/react";
import { analytics } from "@/lib/analytics";
import { useActivityMonitor } from "@/lib/hooks/useActivityMonitor";
import { hasPlusRole } from "@/lib/roles-client";
import { getMaxMyUsers } from "@/lib/plus-features";
import { X } from "lucide-react";

interface Curator {
  fid: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
}

type FeedType = "curated" | "deep-thoughts" | "conversations" | "art" | "following" | "trending" | "packs" | "for-you" | "my-37" | "1500+";

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
  
  // Only allow visible feed types: "curated", "following", "for-you", "trending", "my-37", or "1500+"
  // When not logged in, only allow "curated" and "1500+" feeds
  const normalizeFeedType = useCallback((type: FeedType): "curated" | "following" | "for-you" | "trending" | "my-37" | "1500+" => {
    // Public feeds available without auth: "curated" and "1500+"
    if (!viewerFid) {
      if (type === "1500+") {
        return "1500+";
      }
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
    if (type === "1500+") {
      return "1500+";
    }
    // Default to curated for any unrecognized types
    return "curated";
  }, [viewerFid]);

  // Get feed type from URL or initial prop
  const urlFeedType = searchParams.get("feed") as FeedType | null;
  const effectiveInitialType = urlFeedType || initialFeedType;
  
  const [feedType, setFeedType] = useState<"curated" | "following" | "for-you" | "trending" | "my-37" | "1500+">(() => normalizeFeedType(effectiveInitialType));
  const [casts, setCasts] = useState<Cast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [showLoadMore, setShowLoadMore] = useState(false);
  const [selectedPackIds, setSelectedPackIds] = useState<string[]>([]);
  const [selectedPacks, setSelectedPacks] = useState<Pack[]>([]);
  const [favoritePacks, setFavoritePacks] = useState<Pack[]>([]);
  const [showPackSelector, setShowPackSelector] = useState(false);
  const [showFavoriteDropdown, setShowFavoriteDropdown] = useState(false);
  const [loadingPacks, setLoadingPacks] = useState(false);
  const [preferencesVersion, setPreferencesVersion] = useState(0);
  const [compressedView, setCompressedView] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("curatedFeedCompressedView");
      return saved === null ? true : saved === "true"; // Default to compact view
    }
    return true; // Default to compact view
  });
  const [selectedCategory, setSelectedCategory] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("selectedCategory");
      return saved || null;
    }
    return null;
  });
  const [minQualityScore, setMinQualityScore] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("minQualityScore");
      return saved ? parseInt(saved, 10) : 60; // Default to 60 (0.6 * 100)
    }
    return 60;
  });
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const [selectedCuratorFids, setSelectedCuratorFids] = useState<number[]>([]);
  const [my37PackId, setMy37PackId] = useState<string | null>(null);
  const [my37HasUsers, setMy37HasUsers] = useState<boolean>(false);
  const [myFeedLabel, setMyFeedLabel] = useState<string>("My 7"); // Default to "My 7", will be updated based on role
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  
  // Load enabled feeds from localStorage (default: curated and my-37)
  const loadEnabledFeeds = useCallback((): string[] => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("enabledFeeds");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // Ensure curated and my-37 are always included
          const feeds = Array.isArray(parsed) ? parsed : ["curated", "my-37"];
          if (!feeds.includes("curated")) feeds.unshift("curated");
          if (!feeds.includes("my-37")) feeds.push("my-37");
          return feeds;
        } catch (e) {
          console.error("Failed to parse enabled feeds", e);
        }
      }
    }
    return ["curated", "my-37"]; // Default enabled feeds
  }, []);

  const [enabledFeeds, setEnabledFeeds] = useState<string[]>(loadEnabledFeeds);
  const [showMoreFeeds, setShowMoreFeeds] = useState(false);

  // Save enabled feeds to localStorage
  const saveEnabledFeeds = useCallback((feeds: string[]) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("enabledFeeds", JSON.stringify(feeds));
    }
  }, []);

  // Add a feed to enabled feeds
  const addFeed = useCallback((feedId: string) => {
    setEnabledFeeds((prev) => {
      if (!prev.includes(feedId)) {
        const updated = [...prev, feedId];
        saveEnabledFeeds(updated);
        return updated;
      }
      return prev;
    });
  }, [saveEnabledFeeds]);

  // Remove a feed from enabled feeds (but not curated or my-37)
  const removeFeed = useCallback((feedId: string) => {
    if (feedId === "curated" || feedId === "my-37") {
      return; // Cannot remove default feeds
    }
    setEnabledFeeds((prev) => {
      const updated = prev.filter((id) => id !== feedId);
      saveEnabledFeeds(updated);
      return updated;
    });
    // If the removed feed is currently active, switch to curated
    if (feedType === feedId) {
      const normalized = normalizeFeedType("curated");
      setFeedType(normalized);
      const params = new URLSearchParams(window.location.search);
      params.set("feed", normalized);
      router.replace(`/?${params.toString()}`, { scroll: false });
    }
  }, [saveEnabledFeeds, feedType, normalizeFeedType, router]);
  const [sortBy, setSortBy] = useState<"recently-curated" | "time-of-cast" | "recent-reply" | "quality">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("curatedFeedSortBy");
      if (saved === "recently-curated" || saved === "time-of-cast" || saved === "recent-reply" || saved === "quality") {
        return saved;
      }
    }
    return "recent-reply"; // Default
  });
  const sortByInitializedRef = useRef(false);
  const [hasNewCuratedCasts, setHasNewCuratedCasts] = useState(false);
  const [latestNewCast, setLatestNewCast] = useState<Cast | null>(null);
  const curatorFilterInitializedRef = useRef(false);
  const [filtersExpanded, setFiltersExpanded] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("filtersExpanded");
      return saved === null ? false : saved === "true"; // Default to collapsed
    }
    return false;
  });
  const [allCurators, setAllCurators] = useState<Curator[]>([]);
  
  // Use shared activity monitor for curated feed refresh and session tracking
  const { isUserActive, isTabVisible, lastActiveAt } = useActivityMonitor({
    inactivityThreshold: 3 * 60 * 1000, // 3 minutes
  });
  
  // Note: sortBy is now initialized synchronously from localStorage above
  // This useEffect is kept as a safety net to handle external localStorage changes
  useEffect(() => {
    if (!sortByInitializedRef.current) {
      // Only update if localStorage has a different value than current state
      const saved = localStorage.getItem("curatedFeedSortBy");
      if (saved === "recently-curated" || saved === "time-of-cast" || saved === "recent-reply" || saved === "quality") {
        if (saved !== sortBy) {
          setSortBy(saved);
        }
      }
      sortByInitializedRef.current = true;
    }
  }, [sortBy]);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const lastFetchTimeRef = useRef<number>(0);
  const consecutiveLoadsRef = useRef<number>(0);
  const isRestoringScrollRef = useRef<boolean>(false);
  const scrollRestoredRef = useRef<boolean>(false);
  const castsRestoredRef = useRef<boolean>(false);
  const justSavedOnClickRef = useRef<number>(0); // Timestamp of last click save
  const feedViewStartTimeRef = useRef<number | null>(null);
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
    
    // Auto-enable feed if it's in URL but not in enabled feeds
    if (normalized && !enabledFeeds.includes(normalized)) {
      addFeed(normalized);
    }
  }, [searchParams, viewerFid, initialFeedType, normalizeFeedType, enabledFeeds, addFeed]);

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
          const curatorsList = (data.curators || []) as Curator[];
          setAllCurators(curatorsList);
          const allCuratorFids = curatorsList.map((c: Curator) => c.fid);
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
      // Use limit 3 for initial curated feed load, 10 for subsequent loads, 30 for other feeds
      const isCuratedFeed = feedType === "curated";
      const isInitialCuratedLoad = isCuratedFeed && isInitialLoad;
      const requestLimit = isInitialCuratedLoad ? "3" : (isCuratedFeed ? "10" : "30");
      
      const params = new URLSearchParams({
        feedType: feedType,
        limit: requestLimit,
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
        params.append("minQualityScore", minQualityScore.toString());
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
        // After loading more, hide Load More button and use infinite scroll
        setShowLoadMore(false);
      } else {
        setCasts(data.casts);
        // Mark that we've fetched new casts, so restore effect won't overwrite them
        castsRestoredRef.current = true;
        // Show Load More button for curated feed if we got 3 casts and there are more
        if (isCuratedFeed && isInitialLoad && data.casts.length === 3 && data.next?.cursor) {
          setShowLoadMore(true);
        } else {
          setShowLoadMore(false);
        }
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
  }, [feedType, viewerFid, selectedCuratorFids, selectedCategory, minQualityScore, my37PackId, my37HasUsers, sortBy]);

  // Fetch user's plus role status to set feed label
  useEffect(() => {
    const fetchUserRole = async () => {
      if (!viewerFid) {
        setMyFeedLabel("My 7");
        return;
      }

      try {
        const response = await fetch(`/api/admin/check?fid=${viewerFid}`);
        if (response.ok) {
          const data = await response.json();
          const roles = data.roles || [];
          const userHasPlus = hasPlusRole(roles);
          const max = getMaxMyUsers(userHasPlus);
          setMyFeedLabel(`My ${max}`);
        } else {
          setMyFeedLabel("My 7");
        }
      } catch (error) {
        console.error("Error fetching user role:", error);
        setMyFeedLabel("My 7");
      }
    };

    fetchUserRole();
  }, [viewerFid]);

  const fetchMy37PackId = useCallback(async () => {
    if (!viewerFid) return;
    try {
      const response = await fetch(`/api/curator-packs?creatorFid=${viewerFid}`);
      if (response.ok) {
        const data = await response.json();
        // Look for "My 37" or "My 7" pack (for backward compatibility)
        const my37Pack = data.packs?.find((p: Pack) => p.name === "My 37" || p.name === "My 7");
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
  const prevMinQualityScoreRef = useRef<number>(60);
  const prevMy37PackIdRef = useRef<string | null>(null);
  const prevSelectedCuratorFidsRef = useRef<number[]>([]);
  const fetchingRef = useRef<boolean>(false);
  const hasInitialFetchRef = useRef<boolean>(false);
  
  // Refs for click handler to avoid recreating it on every change
  const feedTypeRef = useRef(feedType);
  const cursorRef = useRef(cursor);
  const castsRef = useRef(casts);
  
  // Keep refs in sync
  useEffect(() => {
    feedTypeRef.current = feedType;
    cursorRef.current = cursor;
    castsRef.current = casts;
  }, [feedType, cursor, casts]);

  // Save scroll position and feed state (throttled)
  const saveScrollPosition = useCallback(() => {
    if (isRestoringScrollRef.current) return;
    
    // Prevent overwriting click-saved position for 500ms after click
    const now = Date.now();
    if (now - justSavedOnClickRef.current < 500) {
      return;
    }
    
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

  // Restore casts when returning to home page (runs early, before fetch)
  useEffect(() => {
    // Only restore if we're on the home page
    if (pathname !== "/") return;

    // Detect if we're returning to home (not initial mount)
    const previousNav = getPreviousNavigation();
    const isReturning = previousNav !== null && previousNav.pathname !== "/";

    // If returning and haven't restored casts yet, restore them immediately
    if (isReturning && !castsRestoredRef.current) {
      // Check if there's saved state for the current feed type
      // The saved state is already keyed by feed type, so if it exists, it's for this feed type
      const savedState = getFeedState(feedType);
      
      if (savedState?.casts && savedState.casts.length > 0) {
        
        // Mark as restored FIRST to prevent fetch from running
        castsRestoredRef.current = true;
        
        // Restore casts
        setCasts(savedState.casts);
        setCursor(savedState.cursor);
        setHasMore(!!savedState.cursor);
        setLoading(false);
        
        // Update refs to match current state
        prevFeedTypeRef.current = feedType;
        prevSortByRef.current = sortBy;
        
        // Trigger scroll restoration directly after casts are restored
        // Use setTimeout + requestAnimationFrame to ensure DOM is updated
        if (savedState.scrollY > 0) {
          isRestoringScrollRef.current = true;
          
          // Wait for React to update the DOM with the restored casts
          setTimeout(() => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                window.scrollTo({ top: savedState.scrollY, behavior: "auto" });
                isRestoringScrollRef.current = false;
                scrollRestoredRef.current = true;
              });
            });
          }, 150);
        } else {
          scrollRestoredRef.current = true;
        }
        
        // If state is stale, refresh in background
        if (isStateStale(feedType)) {
          fetchFeed().catch(console.error);
        }
      } else {
        castsRestoredRef.current = true; // Mark as checked
      }
    } else if (!isReturning && !castsRestoredRef.current) {
      // Not returning, so mark as checked to allow normal fetch
      castsRestoredRef.current = false;
    }
  }, [pathname, feedType, sortBy, fetchFeed]);

  // Restore scroll position after casts are loaded and rendered
  useEffect(() => {
    // Only restore if we're on the home page
    if (pathname !== "/") return;
    
    // Don't restore if already restored, still loading, or no casts
    if (scrollRestoredRef.current || loading || casts.length === 0) {
      return;
    }

    const savedState = getFeedState(feedType);
    if (savedState && savedState.scrollY > 0) {
      // Mark that we're restoring to prevent saving during restoration
      isRestoringScrollRef.current = true;
      scrollRestoredRef.current = true;
      
      // Wait for DOM to update after casts are rendered
      // Use setTimeout + requestAnimationFrame to ensure layout is complete
      setTimeout(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            // Double-check that casts are still there (in case component unmounted)
            if (casts.length > 0) {
              window.scrollTo({ top: savedState.scrollY, behavior: "auto" });
            }
            isRestoringScrollRef.current = false;
          });
        });
      }, 100); // Increased delay to ensure DOM is ready
    } else {
      scrollRestoredRef.current = true;
    }
  }, [feedType, pathname, loading, casts.length, casts]);

  // Save state when casts or cursor changes
  useEffect(() => {
    if (!scrollRestoredRef.current || isRestoringScrollRef.current) return;
    
    // Prevent overwriting click-saved position for 500ms after click
    const now = Date.now();
    if (now - justSavedOnClickRef.current < 500) {
      return;
    }
    
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

  // Save scroll position before navigation happens
  // Intercept clicks on links and buttons that trigger navigation
  useEffect(() => {
    if (pathname !== "/") return; // Only on home page
    
    const handleClick = (e: MouseEvent) => {
      // Save scroll position on ANY click in the feed area
      // This ensures we capture the position before any navigation happens
      // (whether via <a> tag or router.push)
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      
      // Use refs to get current values without recreating handler
      const currentCasts = castsRef.current;
      const currentFeedType = feedTypeRef.current;
      const currentCursor = cursorRef.current;
      const castHashes = currentCasts.map((cast) => cast.hash || "").filter(Boolean);
      
      // Only save if we have casts (to avoid saving on initial load)
      if (currentCasts.length > 0 && scrollY > 0) {
        // Save directly with captured value
        saveFeedState(currentFeedType, {
          scrollY,  // Use captured value, not window.scrollY
          cursor: currentCursor,
          castHashes,
          casts: currentCasts, // Save full cast objects for instant restoration
        });
        
        // Mark that we just saved on click to prevent scroll handler from overwriting
        justSavedOnClickRef.current = Date.now();
      }
    };
    
    // Use capture phase to catch clicks before they bubble
    document.addEventListener("click", handleClick, true);
    
    return () => {
      document.removeEventListener("click", handleClick, true);
    };
  }, [pathname]); // Only depend on pathname, use refs for other values

  // Save state before navigating away
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveScrollPosition();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      // Save on unmount as well
      saveScrollPosition();
    };
  }, [saveScrollPosition]);
  
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
    const sortByChanged = prevSortByRef.current !== sortBy;
    // Check if curator FIDs changed by comparing arrays
    // Check if curator FIDs changed by comparing sorted arrays
    const prevFidsSorted = [...prevSelectedCuratorFidsRef.current].sort();
    const currentFidsSorted = [...selectedCuratorFids].sort();
    const curatorFidsChanged = JSON.stringify(prevFidsSorted) !== JSON.stringify(currentFidsSorted);
    const categoryChanged = prevSelectedCategoryRef.current !== selectedCategory;
    const qualityScoreChanged = prevMinQualityScoreRef.current !== minQualityScore;
    
    // Simple initial mount check - just whether we've fetched before
    const isInitialMount = !hasInitialFetchRef.current;
    
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
      setShowLoadMore(false);
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
      setShowLoadMore(false);
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
      setShowLoadMore(false);
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
      setShowLoadMore(false);
      castsRestoredRef.current = false; // Reset casts restoration when category filter changes
      prevSelectedCategoryRef.current = selectedCategory;
    } else if (categoryChanged) {
      // Update category ref even if not curated
      prevSelectedCategoryRef.current = selectedCategory;
    }
    
    // Clear feed when quality score changes (for curated feed)
    if (qualityScoreChanged && feedType === "curated" && !isInitialMount) {
      setCasts([]);
      setCursor(null);
      setHasMore(false);
      setShowLoadMore(false);
      castsRestoredRef.current = false; // Reset casts restoration when quality filter changes
      prevMinQualityScoreRef.current = minQualityScore;
    } else if (qualityScoreChanged) {
      // Update quality score ref even if not curated
      prevMinQualityScoreRef.current = minQualityScore;
    }
    
    // Only fetch if not my-37 feed, or if my-37 feed has saved pack with users
    if (feedType !== "my-37" || (my37PackId && my37HasUsers)) {
      // Check if we already restored casts from saved state
      // This check happens early to prevent fetching when casts are restored
      const hasRestoredCasts = castsRestoredRef.current && casts.length > 0;
      const isStateStaleResult = isStateStale(feedType);
      
      // Check if feed type actually changed by comparing with lastFetchedFeedTypeRef
      const actualFeedTypeChanged = lastFetchedFeedTypeRef.current !== feedType && lastFetchedFeedTypeRef.current !== "";
      
      // If casts were restored and state is fresh, skip fetch entirely (unless feed type changed)
      if (hasRestoredCasts && !isStateStaleResult && !actualFeedTypeChanged && !feedTypeChanged && !curatorFidsChanged && !categoryChanged && !qualityScoreChanged && !(sortByChanged && feedType === "curated")) {
        return;
      }
      
      // Simple fetch conditions
      const condition1 = isInitialMount; // Always fetch on initial mount
      const condition2 = feedTypeChanged || actualFeedTypeChanged;
      const condition3 = (sortByChanged && feedType === "curated" && !isInitialMount);
      const condition4 = (curatorFidsChanged && feedType === "curated" && !isInitialMount);
      const condition5 = (categoryChanged && feedType === "curated" && !isInitialMount);
      const condition6 = (qualityScoreChanged && feedType === "curated" && !isInitialMount);
      const condition7 = (lastFetchedFeedTypeRef.current !== feedType && !fetchingRef.current && !isInitialMount);
      const fetchCondition = condition1 || condition2 || condition3 || condition4 || condition5 || condition6 || condition7;
      
      // Skip fetch if we restored casts and state is fresh
      // Always fetch on initial mount regardless
      const skipCondition = !isInitialMount && hasRestoredCasts && !isStateStaleResult && !actualFeedTypeChanged && !curatorFidsChanged && !categoryChanged && !qualityScoreChanged;
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
  }, [feedType, selectedCuratorFids, selectedCategory, minQualityScore, preferencesVersion, fetchFeed, my37PackId, my37HasUsers, viewerFid, fetchMy37PackId, sortBy, casts.length, pathname]);
  
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

  // Track feed view sessions - only create record when session ends
  // Session ends on: feed change, inactivity (5 min), tab hidden (5 min), unmount, beforeunload
  const sessionStartTimeRef = useRef<number | null>(null);
  const activeSessionFeedTypeRef = useRef<string | null>(null);
  const inactivityTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tabHiddenTimeRef = useRef<number | null>(null);
  const tabHiddenTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const MAX_SESSION_DURATION = 4 * 60 * 60 * 1000; // 4 hours max
  const INACTIVITY_THRESHOLD = 5 * 60 * 1000; // 5 minutes
  const TAB_HIDDEN_THRESHOLD = 5 * 60 * 1000; // 5 minutes

  // Helper to end current session and create record
  const endSession = useCallback((reason: string) => {
    if (sessionStartTimeRef.current === null || activeSessionFeedTypeRef.current === null) {
      return;
    }

    const sessionStartTime = sessionStartTimeRef.current;
    const feedTypeToTrack = activeSessionFeedTypeRef.current;
    const now = Date.now();
    const duration = Math.floor((now - sessionStartTime) / 1000);

    // Clear timeouts
    if (inactivityTimeoutRef.current) {
      clearTimeout(inactivityTimeoutRef.current);
      inactivityTimeoutRef.current = null;
    }
    if (tabHiddenTimeoutRef.current) {
      clearTimeout(tabHiddenTimeoutRef.current);
      tabHiddenTimeoutRef.current = null;
    }

    // Reset session tracking immediately
    sessionStartTimeRef.current = null;
    activeSessionFeedTypeRef.current = null;
    tabHiddenTimeRef.current = null;

    // Only track if duration is valid
    if (duration > 0 && duration < MAX_SESSION_DURATION / 1000) {
      // Track to analytics
      analytics.trackFeedViewTime(
        feedTypeToTrack,
        duration,
        sortBy,
        selectedCuratorFids,
        selectedPackIds
      );

      // Track to database with sessionStartTime for validation (fire and forget)
      const body = JSON.stringify({
        feedType: feedTypeToTrack,
        durationSeconds: duration,
        sessionStartTime: new Date(sessionStartTime).toISOString(),
        userFid: viewerFid || null,
        sortBy: sortBy || null,
        curatorFids: selectedCuratorFids.length > 0 ? selectedCuratorFids : null,
        packIds: selectedPackIds.length > 0 ? selectedPackIds : null,
      });

      // Use sendBeacon for beforeunload, regular fetch otherwise
      if (reason === 'beforeunload') {
        navigator.sendBeacon('/api/analytics/feed-view', body);
      } else {
        fetch("/api/analytics/feed-view", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        }).catch((error) => {
          // Silently fail - analytics shouldn't break the app
          console.error("Failed to track feed view:", error);
        });
      }
    }
  }, [sortBy, selectedCuratorFids, selectedPackIds, viewerFid]);

  // Start a new session
  const startSession = useCallback(() => {
    // End previous session if exists
    if (sessionStartTimeRef.current !== null && activeSessionFeedTypeRef.current !== null) {
      endSession('feed_change');
    }

    // Start new session
    sessionStartTimeRef.current = Date.now();
    activeSessionFeedTypeRef.current = feedType;
    tabHiddenTimeRef.current = null;

    // Set max duration timeout
    const maxDurationTimeout = setTimeout(() => {
      endSession('max_duration');
    }, MAX_SESSION_DURATION);

    // Monitor tab visibility
    const handleVisibilityChange = () => {
      if (document.hidden) {
        tabHiddenTimeRef.current = Date.now();
        if (tabHiddenTimeoutRef.current) {
          clearTimeout(tabHiddenTimeoutRef.current);
        }
        tabHiddenTimeoutRef.current = setTimeout(() => {
          if (tabHiddenTimeRef.current && Date.now() - tabHiddenTimeRef.current >= TAB_HIDDEN_THRESHOLD) {
            endSession('tab_hidden');
          }
        }, TAB_HIDDEN_THRESHOLD);
      } else {
        // Tab visible again - reset hidden time
        tabHiddenTimeRef.current = null;
        if (tabHiddenTimeoutRef.current) {
          clearTimeout(tabHiddenTimeoutRef.current);
          tabHiddenTimeoutRef.current = null;
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Handle beforeunload
    const handleBeforeUnload = () => {
      endSession('beforeunload');
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearTimeout(maxDurationTimeout);
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current);
      }
      if (tabHiddenTimeoutRef.current) {
        clearTimeout(tabHiddenTimeoutRef.current);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [feedType, endSession]);

  // Track session lifecycle - only depends on feedType and viewerFid
  useEffect(() => {
    // Start new session when feed type changes or component mounts
    const cleanup = startSession();

    // Cleanup on unmount
    return () => {
      if (cleanup) cleanup();
      endSession('unmount');
    };
  }, [feedType, viewerFid, startSession, endSession]);

  // Monitor activity changes for inactivity detection
  useEffect(() => {
    if (sessionStartTimeRef.current === null) return;

    if (!isUserActive) {
      const inactiveTime = lastActiveAt ? Date.now() - lastActiveAt : 0;
      if (inactiveTime >= INACTIVITY_THRESHOLD) {
        endSession('inactivity');
      } else if (inactivityTimeoutRef.current === null) {
        inactivityTimeoutRef.current = setTimeout(() => {
          endSession('inactivity');
        }, INACTIVITY_THRESHOLD - inactiveTime);
      }
    } else {
      // User active - clear inactivity timeout
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current);
        inactivityTimeoutRef.current = null;
      }
    }
  }, [isUserActive, lastActiveAt, endSession]);

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
      params.append("minQualityScore", minQualityScore.toString());

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
          const newCastsNotInCurrent = newCasts.filter((cast: Cast) => !currentHashes.has(cast.hash));
          
          // Find the first new cast that meets quality threshold
          const qualifyingNewCast = newCastsNotInCurrent.find((cast: Cast) => {
            const qualityScore = (cast as Cast & { _qualityScore?: number | null })._qualityScore;
            return qualityScore === null || qualityScore === undefined || qualityScore >= minQualityScore;
          });
          
          if (qualifyingNewCast) {
            setHasNewCuratedCasts(true);
            setLatestNewCast(qualifyingNewCast);
          } else {
            setHasNewCuratedCasts(false);
            setLatestNewCast(null);
          }
        } else {
          setHasNewCuratedCasts(false);
          setLatestNewCast(null);
        }
      }
    } catch (err) {
      // Silently fail - don't show errors for background checks
      console.error("[Feed] Error checking for new curated casts:", err);
    }
  }, [feedType, loading, casts, viewerFid, selectedCuratorFids, sortBy, minQualityScore]);

  // Activity-aware polling for curated feed
  const lastCheckTimeRef = useRef(0);
  const checkTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wasActiveRef = useRef(true);
  const wasVisibleRef = useRef(true);

  useEffect(() => {
    if (feedType !== "curated") {
      setHasNewCuratedCasts(false);
      setLatestNewCast(null);
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
      setLatestNewCast(null);
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
      {feedType === "curated" && hasNewCuratedCasts && latestNewCast && (
        <div className="mb-4 mx-2 sm:mx-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="flex items-center gap-2 flex-1">
                <svg
                  className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0"
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
                onClick={async () => {
                  setHasNewCuratedCasts(false);
                  setLatestNewCast(null);
                  const newSortBy = "recently-curated";
                  setSortBy(newSortBy);
                  localStorage.setItem("curatedFeedSortBy", newSortBy);
                  // Update the ref immediately
                  prevSortByRef.current = newSortBy;
                  // Clear casts to show loading state
                  setCasts([]);
                  setCursor(null);
                  setHasMore(false);
                  castsRestoredRef.current = false;
                  
                  // Fetch directly with the new sortBy value
                  try {
                    setLoading(true);
                    setError(null);
                    
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
                    params.append("sortBy", newSortBy);
                    if (selectedCategory) {
                      params.append("category", selectedCategory);
                    }
                    params.append("minQualityScore", minQualityScore.toString());

                    const response = await fetch(`/api/feed?${params}`);
                    
                    if (!response.ok) {
                      throw new Error("Failed to fetch feed");
                    }

                    const data = await response.json();
                    setCasts(data.casts);
                    castsRestoredRef.current = true;
                    setCursor(data.next?.cursor || null);
                    setHasMore(!!data.next?.cursor);
                  } catch (err: unknown) {
                    const error = err as { message?: string };
                    console.error(`[Feed] Error:`, error.message || "Failed to load feed");
                    setError(error.message || "Failed to load feed");
                  } finally {
                    setLoading(false);
                  }
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-lg transition-colors flex-shrink-0"
              >
                Reload feed with latest
              </button>
            </div>
            {/* Preview of latest new cast */}
            <div className="mt-3 pl-7 border-l-2 border-blue-200 dark:border-blue-700">
              <div className="flex gap-3">
                <AvatarImage
                  src={latestNewCast.author.pfp_url}
                  alt={latestNewCast.author.username}
                  size={32}
                  className="w-8 h-8 rounded-full flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm text-blue-900 dark:text-blue-100">
                      {latestNewCast.author.display_name || latestNewCast.author.username}
                    </span>
                    <span className="text-xs text-blue-600 dark:text-blue-400">
                      @{latestNewCast.author.username}
                    </span>
                  </div>
                  <div className="text-sm text-blue-800 dark:text-blue-200 line-clamp-2">
                    {latestNewCast.text}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Feed type tabs */}
      <div className="sticky top-0 bg-white dark:bg-black border-b border-gray-200 dark:border-gray-800 z-40">
        <div className="flex flex-col">
          <div className="flex items-center justify-between px-2 sm:px-4 py-2 border-b border-gray-200 dark:border-gray-800">
            <div className="flex gap-1 overflow-x-auto scrollbar-hide overscroll-x-contain flex-1">
              {/* All available feeds */}
              {[
                { id: "curated", label: "Curated", requiresAuth: false },
                { id: "my-37", label: myFeedLabel, requiresAuth: true },
                { id: "1500+", label: "1500+", requiresAuth: false },
                { id: "trending", label: "Trending", requiresAuth: true },
                { id: "for-you", label: "For You", requiresAuth: true },
                { id: "following", label: "Following", requiresAuth: true },
              ]
                .filter((tab) => enabledFeeds.includes(tab.id))
                .map((tab) => {
                  const isDisabled = tab.requiresAuth && !viewerFid;
                  const isActive = feedType === tab.id;
                  const isOptional = tab.id !== "curated" && tab.id !== "my-37";
                  
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        if (isDisabled) {
                          setShowLoginPrompt(true);
                          return;
                        }
                        const newType = tab.id as "curated" | "following" | "for-you" | "trending" | "my-37" | "1500+";
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
              
              {/* "More" button */}
              {[
                { id: "1500+", label: "1500+", requiresAuth: false },
                { id: "trending", label: "Trending", requiresAuth: true },
                { id: "for-you", label: "For You", requiresAuth: true },
                { id: "following", label: "Following", requiresAuth: true },
              ].some((tab) => !enabledFeeds.includes(tab.id) && (!tab.requiresAuth || viewerFid)) && (
                <button
                  onClick={() => setShowMoreFeeds(!showMoreFeeds)}
                  className="px-2 sm:px-3 py-2.5 sm:py-3 text-xs sm:text-sm font-medium text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors whitespace-nowrap"
                >
                  More
                </button>
              )}
            </div>
          
            {/* Compact view toggle - shown for all feeds */}
            <div className="flex items-center gap-2 px-2 sm:px-3 flex-shrink-0">
            <span className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">Compact</span>
            <button
              type="button"
              onClick={() => {
                const newValue = !compressedView;
                setCompressedView(newValue);
                localStorage.setItem("curatedFeedCompressedView", String(newValue));
                window.dispatchEvent(new CustomEvent("feedPreferencesChanged"));
              }}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                compressedView
                  ? "bg-blue-600"
                  : "bg-gray-200 dark:bg-gray-700"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  compressedView ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
          </div>
          
          {/* Inline expansion for hidden feeds */}
          {showMoreFeeds && (
            <div className="px-2 sm:px-4 py-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
              <div className="flex flex-wrap gap-2">
                {[
                  { id: "1500+", label: "1500+", requiresAuth: false },
                  { id: "trending", label: "Trending", requiresAuth: true },
                  { id: "for-you", label: "For You", requiresAuth: true },
                  { id: "following", label: "Following", requiresAuth: true },
                ]
                  .filter((tab) => !tab.requiresAuth || viewerFid)
                  .map((tab) => {
                    const isEnabled = enabledFeeds.includes(tab.id);
                    return (
                      <div key={tab.id} className="flex items-center gap-1 group">
                        {isEnabled ? (
                          <>
                            <span className="px-3 py-1.5 text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">
                              {tab.label}
                            </span>
                            <button
                              onClick={() => {
                                removeFeed(tab.id);
                              }}
                              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                              aria-label={`Remove ${tab.label} feed`}
                            >
                              <X className="w-3 h-3 text-gray-500 dark:text-gray-400" />
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => {
                              addFeed(tab.id);
                              setShowMoreFeeds(false);
                              // Switch to the newly added feed
                              const newType = tab.id as "curated" | "following" | "for-you" | "trending" | "my-37" | "1500+";
                              const normalized = normalizeFeedType(newType);
                              setFeedType(normalized);
                              const params = new URLSearchParams(window.location.search);
                              params.set("feed", normalized);
                              router.replace(`/?${params.toString()}`, { scroll: false });
                            }}
                            className="px-3 py-1.5 text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors"
                          >
                            + {tab.label}
                          </button>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
        
        {/* 1500+ Feed Description */}
        {feedType === "1500+" && (
          <div className="px-2 sm:px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Long-form casts over 1,500 characters from the past week
            </p>
          </div>
        )}
        
        {/* Filter settings - shown for all feeds except curated */}
        {feedType !== "curated" && <FeedSettingsInline feedType={feedType} />}
        
        {/* Filters section - shown only for curated feed */}
        {feedType === "curated" && (
          <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-black">
            {/* Filters header - always visible */}
            <button
              onClick={() => {
                const newValue = !filtersExpanded;
                setFiltersExpanded(newValue);
                localStorage.setItem("filtersExpanded", String(newValue));
              }}
              className="w-full px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Filters & Options
                </span>
                {!filtersExpanded && (
                  <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
                    {/* Curator avatars */}
                    {allCurators.length > 0 && (
                      <div className="flex items-center gap-1 -space-x-1 flex-shrink-0">
                        {selectedCuratorFids.length === 0 ? (
                          <span className="text-xs text-gray-500 dark:text-gray-400">None</span>
                        ) : selectedCuratorFids.length === allCurators.length ? (
                          <span className="text-xs text-gray-500 dark:text-gray-400">All</span>
                        ) : (
                          <>
                            {selectedCuratorFids.slice(0, 5).map((fid) => {
                              const curator = allCurators.find(c => c.fid === fid);
                              return (
                                <AvatarImage
                                  key={fid}
                                  src={curator?.pfpUrl || undefined}
                                  alt={curator?.displayName || curator?.username || `@user${fid}`}
                                  size={20}
                                  className="w-5 h-5 rounded-full border border-white dark:border-gray-800"
                                />
                              );
                            })}
                            {selectedCuratorFids.length > 5 && (
                              <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                                +{selectedCuratorFids.length - 5}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    )}
                    
                    {/* Category - always show */}
                    <div className="flex items-center gap-1.5 min-w-0">
                      {allCurators.length > 0 && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">•</span>
                      )}
                      <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {selectedCategory ? (() => {
                          const categoryLabel = [
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
                          ].find(c => c.value === selectedCategory)?.label || selectedCategory;
                          return categoryLabel;
                        })() : "All Categories"}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              <svg
                className={`w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform ${
                  filtersExpanded ? "rotate-180" : ""
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Filters content - collapsible */}
            {filtersExpanded && (
              <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-3 border-t border-gray-200 dark:border-gray-800">
                {/* Curator filter - inline - FIRST */}
                <div className="nested-curator-filter">
                  <CuratorFilterInline
                    selectedCuratorFids={selectedCuratorFids}
                    onCuratorFidsChange={(fids) => {
                      setSelectedCuratorFids(fids);
                      localStorage.setItem("selectedCuratorFids", JSON.stringify(fids));
                      
                      fetch("/api/curators")
                        .then(res => res.json())
                        .then(data => {
                          const curatorsList = (data.curators || []) as Curator[];
                          setAllCurators(curatorsList);
                          const allCuratorFids = curatorsList.map((c: Curator) => c.fid);
                          const excludedFids = allCuratorFids.filter((fid: number) => !fids.includes(fid));
                          localStorage.setItem("excludedCuratorFids", JSON.stringify(excludedFids));
                        })
                        .catch(err => console.error("Failed to update excluded curators:", err));
                      
                      analytics.trackFeedCuratorFilter(feedType, fids);
                    }}
                  />
                </div>

                {/* Category filter - compact - SECOND */}
                <div className="space-y-1.5">
                  <span className="text-xs text-gray-600 dark:text-gray-400">Category:</span>
                  <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCategory(null);
                        localStorage.removeItem("selectedCategory");
                      }}
                      className={`px-2 py-0.5 text-xs rounded transition-colors whitespace-nowrap shrink-0 ${
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
                        className={`px-2 py-0.5 text-xs rounded transition-colors whitespace-nowrap shrink-0 ${
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

                {/* Sort by - horizontal compact */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-600 dark:text-gray-400 min-w-16">Sort by:</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {[
                      { value: "recently-curated", label: "Recently Curated" },
                      { value: "time-of-cast", label: "Time of Cast" },
                      { value: "recent-reply", label: "Recent Reply" },
                      { value: "quality", label: "Quality" },
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
                        className={`px-2 py-0.5 text-xs rounded transition-colors ${
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

                {/* Min Quality - horizontal compact */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-600 dark:text-gray-400 min-w-16">Min Quality:</span>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={minQualityScore}
                      onChange={(e) => {
                        const newValue = parseInt(e.target.value, 10);
                        setMinQualityScore(newValue);
                        localStorage.setItem("minQualityScore", newValue.toString());
                      }}
                      className="flex-1 max-w-[120px]"
                    />
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300 min-w-10">
                      {minQualityScore}
                    </span>
                  </div>
                </div>

              </div>
            )}
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
            <div className="space-y-6">
              {casts
                .filter((cast) => feedType === "curated" || !shouldHideCast(cast))
                .map((cast) => (
                  <CastCard
                    key={cast.hash}
                    cast={cast}
                    showThread
                    feedType={feedType}
                    sortBy={feedType === "curated" ? sortBy : undefined}
                    compressedView={compressedView}
                    onUpdate={() => {
                      // Refresh the feed to get updated reaction counts
                      fetchFeed();
                    }}
                  />
                ))}
            </div>
          </div>

          {/* Load More button for curated feed (shown after initial 3 casts) */}
          {showLoadMore && feedType === "curated" && !loading && (
            <div className="flex justify-center py-6">
              <button
                onClick={() => {
                  setShowLoadMore(false);
                  fetchFeed(cursor);
                }}
                className="px-6 py-3 bg-blue-600 dark:bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Load More
              </button>
            </div>
          )}

          {/* Infinite scroll trigger (hidden when Load More button is shown) */}
          {hasMore && !showLoadMore && (
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
              <NeynarAuthButton label="Sign in" icon={null} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
