"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { CastCard } from "../components/CastCard";
import { Cast } from "@neynar/nodejs-sdk/build/api";
import { useNeynarContext } from "@neynar/react";
import { CastComposer } from "../components/CastComposer";

export default function ThinkingPage() {
  const { user } = useNeynarContext();
  const [casts, setCasts] = useState<Cast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const lastFetchTimeRef = useRef<number>(0);
  const MIN_FETCH_INTERVAL = 500; // Minimum time between fetches in ms

  const fetchThinkingFeed = useCallback(async (newCursor?: string | null) => {
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

      const response = await fetch(`/api/thinking?${params}`);

      if (!response.ok) {
        throw new Error("Failed to fetch thinking feed");
      }

      const data = await response.json();

      if (newCursor) {
        setCasts((prev) => [...prev, ...data.casts]);
      } else {
        setCasts(data.casts);
      }

      setCursor(data.next?.cursor || null);
      setHasMore(!!data.next?.cursor);
    } catch (err: unknown) {
      const error = err as { message?: string };
      console.error(`[Thinking] Error:`, error.message || "Failed to load thinking feed");
      setError(error.message || "Failed to load thinking feed");
    } finally {
      setLoading(false);
      lastFetchTimeRef.current = Date.now();
    }
  }, [user?.fid]);

  // Initial load
  useEffect(() => {
    fetchThinkingFeed();
  }, [fetchThinkingFeed]);

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
    fetchThinkingFeed(cursor);
  }, [loading, hasMore, cursor, fetchThinkingFeed]);

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

  const handleCastSuccess = useCallback((newCast?: any) => {
    // Refresh the feed after a new cast is posted
    fetchThinkingFeed();
  }, [fetchThinkingFeed]);

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
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            /thinking
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            A space for deep thoughts and reflections
          </p>
        </div>

        {/* Cast Composer */}
        {user && (
          <div className="mb-6 border-b border-gray-200 dark:border-gray-800 pb-4">
            <CastComposer onSuccess={handleCastSuccess} />
          </div>
        )}

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
            Loading thinking feed...
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
