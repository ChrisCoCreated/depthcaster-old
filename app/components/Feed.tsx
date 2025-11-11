"use client";

import { useState, useEffect } from "react";
import { CastCard } from "./CastCard";
import { Cast } from "@neynar/nodejs-sdk/build/api";

type FeedType = "curated" | "deep-thoughts" | "conversations" | "art" | "following" | "trending";

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

  const fetchFeed = async (newCursor?: string | null) => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        feedType,
        limit: "30",
      });

      if (viewerFid) {
        params.append("viewerFid", viewerFid.toString());
      }

      if (newCursor) {
        params.append("cursor", newCursor);
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
  }, [feedType]);

  const loadMore = () => {
    if (!loading && hasMore && cursor) {
      fetchFeed(cursor);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Feed type tabs */}
      <div className="sticky top-0 bg-white dark:bg-black border-b border-gray-200 dark:border-gray-800 z-10">
        <div className="flex gap-1 overflow-x-auto px-4">
          {[
            { id: "curated", label: "Curated" },
            { id: "deep-thoughts", label: "Deep Thoughts" },
            { id: "conversations", label: "Conversations" },
            { id: "art", label: "Art" },
            { id: "trending", label: "Trending" },
            ...(viewerFid ? [{ id: "following", label: "Following" }] : []),
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFeedType(tab.id as FeedType)}
              className={`px-4 py-3 text-sm font-medium transition-colors ${
                feedType === tab.id
                  ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

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
          No casts found. Try a different feed type.
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

