"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { use } from "react";
import { CastCard } from "../../components/CastCard";
import { Cast } from "@neynar/nodejs-sdk/build/api";
import { useNeynarContext } from "@neynar/react";
import { getFeedBySlug, type DisplayMode } from "@/lib/customFeeds";

export default function CustomFeedPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const { user } = useNeynarContext();
  const [casts, setCasts] = useState<Cast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [feedName, setFeedName] = useState<string | null>(null);
  const [feedDescription, setFeedDescription] = useState<string | null>(null);
  const [channelName, setChannelName] = useState<string | null>(null);
  const [displayMode, setDisplayMode] = useState<DisplayMode | null>(null);
  const [showChannelHeader, setShowChannelHeader] = useState(false);
  const [headerImage, setHeaderImage] = useState<string | null>(null);
  const [customTitle, setCustomTitle] = useState<string | null>(null);
  
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const lastFetchTimeRef = useRef<number>(0);
  const MIN_FETCH_INTERVAL = 500; // Minimum time between fetches in ms

  // Get feed configuration
  const feedConfig = getFeedBySlug(slug);
  if (!feedConfig) {
    return (
      <div className="min-h-screen">
        <main className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-red-500 dark:text-red-400">
            Feed not found: {slug}
          </div>
        </main>
      </div>
    );
  }

  const fetchFeed = useCallback(async (newCursor?: string | null) => {
    const fetchStartTime = performance.now();
    const isInitialLoad = !newCursor;

    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        limit: "25",
      });

      if (user?.fid) {
        params.append("viewerFid", user.fid.toString());
      }

      if (newCursor) {
        params.append("cursor", newCursor);
      }

      const response = await fetch(`/api/feed/custom/${slug}?${params}`);

      if (!response.ok) {
        throw new Error("Failed to fetch feed");
      }

      const data = await response.json();

      if (newCursor) {
        setCasts((prev) => [...prev, ...data.casts]);
      } else {
        setCasts(data.casts);
        // Extract feed metadata
        if (data.feed) {
          setFeedName(data.feed.name);
          setFeedDescription(data.feed.description || null);
          setDisplayMode(data.feed.displayMode || null);
          if (data.feed.headerConfig) {
            setShowChannelHeader(data.feed.headerConfig.showChannelHeader || false);
            setCustomTitle(data.feed.headerConfig.customTitle || null);
            // Extract header image from headerConfig
            if (data.feed.headerConfig.headerImage) {
              setHeaderImage(data.feed.headerConfig.headerImage);
            }
          }
        }
        // Extract header image (can come directly from response, prioritize direct response)
        if (data.headerImage) {
          setHeaderImage(data.headerImage);
        }
        // Extract channel name from first cast if available
        if (data.channel) {
          setChannelName(data.channel.name);
        } else if (data.casts && data.casts.length > 0 && data.casts[0].channel) {
          setChannelName(data.casts[0].channel.name);
        }
      }

      setCursor(data.next?.cursor || null);
      setHasMore(!!data.next?.cursor);
    } catch (err: unknown) {
      const error = err as { message?: string };
      console.error(`[CustomFeed] Error:`, error.message || "Failed to load feed");
      setError(error.message || "Failed to load feed");
    } finally {
      setLoading(false);
      lastFetchTimeRef.current = Date.now();
    }
  }, [slug, user?.fid]);

  // Initial load
  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

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

  if (error) {
    return (
      <div className="min-h-screen">
        <main className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-red-500 dark:text-red-400">Error: {error}</div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Feed Header */}
        <div className="mb-6">
          {headerImage && (
            <div className="mb-4">
              <img 
                src={headerImage} 
                alt={customTitle || feedName || "Custom Feed"} 
                className="w-full max-w-4xl rounded-lg"
              />
            </div>
          )}
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {customTitle || (showChannelHeader && channelName ? `/${channelName}` : feedName || "Custom Feed")}
          </h1>
          {feedDescription && (
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              {feedDescription}
            </p>
          )}
        </div>

        {/* Casts Feed */}
        <div className="space-y-4">
          {casts.map((cast) => (
            <CastCard
              key={cast.hash}
              cast={cast}
              displayMode={displayMode || undefined}
            />
          ))}
        </div>

        {/* Loading indicator */}
        {loading && casts.length === 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            Loading feed...
          </div>
        )}

        {/* Load more trigger */}
        {hasMore && (
          <div ref={loadMoreRef} className="h-20 flex items-center justify-center">
            {loading && casts.length > 0 && (
              <div className="text-gray-500 dark:text-gray-400">Loading more...</div>
            )}
          </div>
        )}

        {/* End of feed message */}
        {!hasMore && casts.length > 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No more casts in this feed
          </div>
        )}
      </main>
    </div>
  );
}

