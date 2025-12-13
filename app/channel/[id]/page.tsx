"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { use } from "react";
import { CastCard } from "../../components/CastCard";
import { Cast } from "@neynar/nodejs-sdk/build/api";
import { useNeynarContext } from "@neynar/react";

export default function ChannelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: channelId } = use(params);
  const { user } = useNeynarContext();
  const [casts, setCasts] = useState<Cast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [channelName, setChannelName] = useState<string | null>(null);
  
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const lastFetchTimeRef = useRef<number>(0);
  const MIN_FETCH_INTERVAL = 500; // Minimum time between fetches in ms

  const fetchChannelFeed = useCallback(async (newCursor?: string | null) => {
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

      const response = await fetch(`/api/channel/${channelId}?${params}`);

      if (!response.ok) {
        throw new Error("Failed to fetch channel feed");
      }

      const data = await response.json();

      if (newCursor) {
        setCasts((prev) => [...prev, ...data.casts]);
      } else {
        setCasts(data.casts);
        // Extract channel name from first cast if available
        if (data.casts && data.casts.length > 0 && data.casts[0].channel) {
          setChannelName(data.casts[0].channel.name);
        }
      }

      setCursor(data.next?.cursor || null);
      setHasMore(!!data.next?.cursor);
    } catch (err: unknown) {
      const error = err as { message?: string };
      console.error(`[Channel] Error:`, error.message || "Failed to load channel feed");
      setError(error.message || "Failed to load channel feed");
    } finally {
      setLoading(false);
      lastFetchTimeRef.current = Date.now();
    }
  }, [channelId, user?.fid]);

  // Initial load
  useEffect(() => {
    fetchChannelFeed();
  }, [fetchChannelFeed]);

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
    fetchChannelFeed(cursor);
  }, [loading, hasMore, cursor, fetchChannelFeed]);

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
        {/* Channel Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {channelName ? `/${channelName}` : `Channel: ${channelId}`}
          </h1>
        </div>

        {/* Casts Feed */}
        <div className="space-y-4">
          {casts.map((cast) => (
            <CastCard
              key={cast.hash}
              cast={cast}
            />
          ))}
        </div>

        {/* Loading indicator */}
        {loading && casts.length === 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            Loading channel feed...
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
            No more casts in this channel
          </div>
        )}
      </main>
    </div>
  );
}




















