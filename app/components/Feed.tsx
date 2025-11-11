"use client";

import { useState, useEffect } from "react";
import { CastCard } from "./CastCard";
import { Cast } from "@neynar/nodejs-sdk/build/api";
import Link from "next/link";
import { CloseFriendsPrompt } from "./CloseFriendsPrompt";

type FeedType = "curated" | "deep-thoughts" | "conversations" | "art" | "following" | "trending" | "packs";

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
  const [feedType, setFeedType] = useState<FeedType>(initialFeedType);
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

  // Load selected packs from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("selectedPackIds");
    if (saved) {
      try {
        const ids = JSON.parse(saved);
        if (Array.isArray(ids) && ids.length > 0) {
          setSelectedPackIds(ids);
          setFeedType("packs");
          fetchSelectedPacks(ids);
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
  }, []);

  // Fetch favorite packs when viewerFid is available
  useEffect(() => {
    if (viewerFid && feedType === "packs") {
      fetchFavoritePacks();
    }
  }, [viewerFid, feedType]);

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
      setFeedType("packs");
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

  const fetchFeed = async (newCursor?: string | null) => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        feedType: feedType === "packs" ? "curated" : feedType,
        limit: "30",
      });

      if (viewerFid) {
        params.append("viewerFid", viewerFid.toString());
      }

      if (newCursor) {
        params.append("cursor", newCursor);
      }

      // Add packIds if packs feed type is selected
      if (feedType === "packs" && selectedPackIds.length > 0) {
        params.append("packIds", selectedPackIds.join(","));
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
  };

  useEffect(() => {
    setCasts([]);
    setCursor(null);
    fetchFeed();
  }, [feedType, selectedPackIds]);

  const loadMore = () => {
    if (!loading && hasMore && cursor) {
      fetchFeed(cursor);
    }
  };

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

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Close Friends Prompt - shown at top of curated feed */}
      {feedType === "curated" && viewerFid && (
        <div className="mb-4">
          <CloseFriendsPrompt />
        </div>
      )}

      {/* Feed type tabs */}
      <div className="sticky top-0 bg-white dark:bg-black border-b border-gray-200 dark:border-gray-800 z-40">
        <div className="flex gap-1 overflow-x-auto px-2 sm:px-4 scrollbar-hide">
          {[
            { id: "curated", label: "Curated" },
            { id: "deep-thoughts", label: "Deep Thoughts" },
            { id: "conversations", label: "Conversations" },
            { id: "art", label: "Art" },
            { id: "trending", label: "Trending" },
            { id: "packs", label: selectedPackIds.length > 0 ? `Packs (${selectedPackIds.length})` : "Packs" },
            ...(viewerFid ? [{ id: "following", label: "Following" }] : []),
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setFeedType(tab.id as FeedType);
                if (tab.id === "packs") {
                  setShowPackSelector(true);
                }
              }}
              className={`px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                feedType === tab.id
                  ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        
        {feedType === "packs" && (
          <div className="px-2 sm:px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-gray-200 dark:border-gray-800">
            <div className="flex items-start sm:items-center justify-between flex-col sm:flex-row gap-2">
              <div className="flex-1 min-w-0 w-full sm:w-auto">
                <div className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                  {selectedPackIds.length > 0 ? (
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                      <span className="hidden sm:inline">Showing content from:</span>
                      {loadingPacks ? (
                        <span className="text-gray-500">Loading...</span>
                      ) : (
                        selectedPacks.map((pack) => (
                          <span
                            key={pack.id}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-white dark:bg-gray-800 rounded-full text-xs border border-gray-200 dark:border-gray-700"
                          >
                            <Link
                              href={`/packs/${pack.id}`}
                              className="hover:text-blue-600 dark:hover:text-blue-400 truncate max-w-[120px] sm:max-w-none"
                            >
                              {pack.name}
                            </Link>
                            <button
                              onClick={() => handleRemovePack(pack.id)}
                              className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 flex-shrink-0"
                              aria-label="Remove pack"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </span>
                        ))
                      )}
                    </div>
                  ) : (
                    <span>No packs selected</span>
                  )}
                </div>
              </div>
              <div className="flex gap-2 sm:gap-2 items-center flex-wrap">
                {viewerFid && favoritePacks.length > 0 && (
                  <div className="relative favorite-dropdown">
                    <button
                      onClick={() => setShowFavoriteDropdown(!showFavoriteDropdown)}
                      className="text-xs sm:text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                    >
                      Select Favorite
                      <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {showFavoriteDropdown && (
                      <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 min-w-[200px] max-h-64 overflow-y-auto">
                        {favoritePacks
                          .filter((pack) => !selectedPackIds.includes(pack.id))
                          .map((pack) => (
                            <button
                              key={pack.id}
                              onClick={() => handleSelectFavoritePack(pack.id)}
                              className="w-full text-left px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                            >
                              <div className="font-medium">{pack.name}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">{pack.userCount} users</div>
                            </button>
                          ))}
                        {favoritePacks.filter((pack) => !selectedPackIds.includes(pack.id)).length === 0 && (
                          <div className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                            All favorites selected
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <button
                  onClick={() => setShowPackSelector(!showPackSelector)}
                  className="text-xs sm:text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {showPackSelector ? "Hide" : "Select Packs"}
                </button>
                {selectedPackIds.length > 0 && (
                  <Link
                    href="/packs"
                    className="text-xs sm:text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Manage
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Pack selector */}
      {showPackSelector && feedType === "packs" && (
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
          <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            Select curator packs to filter your feed:
          </div>
          <div className="max-h-64 overflow-y-auto">
            {/* Simple pack selector - can be enhanced with CuratorPackSelector component */}
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <Link href="/packs" className="text-blue-600 dark:text-blue-400 hover:underline">
                Go to Packs page to select packs →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Feed content */}
      {error && (
        <div className="p-4 text-red-600 dark:text-red-400">
          Error: {error}
        </div>
      )}

      {loading && casts.length === 0 ? (
        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
          Loading feed...
        </div>
      ) : casts.length === 0 ? (
        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
          {feedType === "packs" && selectedPackIds.length === 0 ? (
            <>
              No packs selected.{" "}
              <Link href="/packs" className="text-blue-600 dark:text-blue-400 hover:underline">
                Select packs to filter your feed
              </Link>
            </>
          ) : (
            "No casts found. Try a different feed type."
          )}
        </div>
      ) : (
        <>
          <div>
            {casts.map((cast) => (
              <CastCard
                key={cast.hash}
                cast={cast}
                showThread
                onUpdate={() => {
                  // Refresh the feed to get updated reaction counts
                  fetchFeed();
                }}
              />
            ))}
          </div>

          {/* Load more button */}
          {hasMore && (
            <div className="p-4 text-center">
              <button
                onClick={loadMore}
                disabled={loading}
                className="px-6 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Loading..." : "Load More"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
