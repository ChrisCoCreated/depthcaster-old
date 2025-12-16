"use client";

import { useState, useEffect } from "react";
import { CastCard } from "./CastCard";

interface UserActivitySectionProps {
  fid: number;
  viewerFid?: number;
  type: "casts" | "replies-recasts" | "popular-casts" | "interactions" | "curated-casts";
  title: string;
  icon?: string;
  autoExpand?: boolean;
}

export function UserActivitySection({
  fid,
  viewerFid,
  type,
  title,
  icon,
  autoExpand = false,
}: UserActivitySectionProps) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const fetchData = async (newCursor?: string | null) => {
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        limit: "25",
      });

      if (viewerFid) {
        params.append("viewerFid", viewerFid.toString());
      }

      if (newCursor) {
        params.append("cursor", newCursor);
      }

      const endpoint = `/api/user/${fid}/${type}?${params}`;
      const response = await fetch(endpoint);

      if (!response.ok) {
        throw new Error("Failed to fetch data");
      }

      const data = await response.json();

      if (type === "interactions") {
        const newItems = data.interactions || [];
        if (newCursor) {
          setItems((prev) => [...prev, ...newItems]);
        } else {
          setItems(newItems);
        }
      } else if (type === "replies-recasts") {
        const newItems = data.items || [];
        if (newCursor) {
          setItems((prev) => [...prev, ...newItems]);
        } else {
          setItems(newItems);
        }
      } else {
        const newItems = data.casts || [];
        if (newCursor) {
          setItems((prev) => [...prev, ...newItems]);
        } else {
          setItems(newItems);
        }
      }

      setCursor(data.next?.cursor || null);
      setHasMore(!!data.next?.cursor);
    } catch (err: any) {
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (autoExpand && items.length === 0 && !loading) {
      fetchData();
    }
  }, [autoExpand]);

  const handleLoadMore = () => {
    if (cursor && !loading) {
      fetchData(cursor);
    }
  };

  const renderItem = (item: any, index: number) => {
    if (type === "interactions") {
      // For interactions, the cast is nested in the item
      const cast = item.cast;
      if (!cast) return null;
      return (
        <CastCard
          key={cast.hash || `interaction-${index}`}
          cast={cast}
          feedType="curated"
        />
      );
    }

    // For casts, replies-recasts, popular-casts, and curated-casts, item is the cast
    return (
      <CastCard
        key={item.hash || `item-${index}`}
        cast={item}
        feedType="curated"
      />
    );
  };

  return (
    <div>
      {loading && items.length === 0 ? (
        <div className="py-8 text-center text-gray-500 dark:text-gray-400">
          Loading...
        </div>
      ) : error ? (
        <div className="py-4 text-red-600 dark:text-red-400">
          Error: {error}
        </div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-gray-500 dark:text-gray-400">
          No {title.toLowerCase()} yet
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {items.map((item, index) => renderItem(item, index))}
          </div>

          {hasMore && (
            <div className="mt-4 text-center">
              <button
                onClick={handleLoadMore}
                disabled={loading}
                className="px-4 py-2 text-sm text-accent-dark dark:text-accent hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
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

