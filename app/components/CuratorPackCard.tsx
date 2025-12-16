"use client";

import Link from "next/link";
import { useState } from "react";
import { analytics } from "@/lib/analytics";

interface CuratorPackCardProps {
  pack: {
    id: string;
    name: string;
    description?: string | null;
    creatorFid: number;
    creator?: {
      fid: number;
      username?: string | null;
      displayName?: string | null;
      pfpUrl?: string | null;
    } | null;
    isPublic: boolean;
    usageCount: number;
    userCount: number;
    createdAt: Date | string;
    isFavorited?: boolean;
  };
  viewerFid?: number;
  onSubscribe?: (packId: string) => void;
  onUse?: (packId: string) => void;
  onFavoriteChange?: (packId: string, favorited: boolean) => void;
  showActions?: boolean;
}

export function CuratorPackCard({
  pack,
  viewerFid,
  onSubscribe,
  onUse,
  onFavoriteChange,
  showActions = true,
}: CuratorPackCardProps) {
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [isFavoriting, setIsFavoriting] = useState(false);
  const [isFavorited, setIsFavorited] = useState(pack.isFavorited || false);

  const handleSubscribe = async () => {
    if (!viewerFid || !onSubscribe) return;
    
    setIsSubscribing(true);
    try {
      await fetch(`/api/curator-packs/${pack.id}/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userFid: viewerFid }),
      });
      
      // Track analytics
      analytics.trackPackSubscribe(pack.id, pack.name);
      
      onSubscribe(pack.id);
    } catch (error) {
      console.error("Failed to subscribe:", error);
    } finally {
      setIsSubscribing(false);
    }
  };

  const handleFavorite = async () => {
    if (!viewerFid) return;
    
    setIsFavoriting(true);
    try {
      if (isFavorited) {
        await fetch(`/api/curator-packs/${pack.id}/favorite?userFid=${viewerFid}`, {
          method: "DELETE",
        });
        setIsFavorited(false);
        onFavoriteChange?.(pack.id, false);
        
        // Track analytics
        analytics.trackPackUnfavorite(pack.id, pack.name);
      } else {
        await fetch(`/api/curator-packs/${pack.id}/favorite`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userFid: viewerFid }),
        });
        setIsFavorited(true);
        onFavoriteChange?.(pack.id, true);
        
        // Track analytics
        analytics.trackPackFavorite(pack.id, pack.name);
      }
    } catch (error) {
      console.error("Failed to toggle favorite:", error);
    } finally {
      setIsFavoriting(false);
    }
  };

  const isCreator = viewerFid === pack.creatorFid;

  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <Link href={`/packs/${pack.id}`}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400">
              {pack.name}
            </h3>
          </Link>
          
          {pack.description && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {pack.description}
            </p>
          )}

          <div className="flex items-center gap-4 mt-3 text-sm text-gray-500 dark:text-gray-500">
            {pack.creator && (
              <Link href={`/profile/${pack.creator.fid}`} className="hover:text-gray-900 dark:hover:text-gray-100">
                {pack.creator.displayName || pack.creator.username || `@user_${pack.creator.fid}`}
                {pack.creator.username && (
                  <span className="text-gray-400 dark:text-gray-500 ml-1">@{pack.creator.username}</span>
                )}
              </Link>
            )}
            <span>{pack.userCount} users</span>
            <span>{pack.usageCount} uses</span>
            {!pack.isPublic && (
              <span className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded">
                Private
              </span>
            )}
          </div>
        </div>

        <div className="flex gap-2 ml-4">
          {/* Favorite button - always visible if viewer exists */}
          {viewerFid && (
            <button
              onClick={handleFavorite}
              disabled={isFavoriting}
              className={`p-1.5 rounded-full transition-colors disabled:opacity-50 ${
                isFavorited
                  ? "text-yellow-500 hover:text-yellow-600"
                  : "text-gray-400 hover:text-yellow-500"
              }`}
              aria-label={isFavorited ? "Unfavorite" : "Favorite"}
            >
              <svg className="w-5 h-5" fill={isFavorited ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </button>
          )}
          
          {/* Other actions - only shown when showActions is true */}
          {showActions && (
            <>
              {onUse && (
                <button
                  onClick={() => {
                    analytics.trackPackUse(pack.id, pack.name);
                    onUse(pack.id);
                  }}
                  className="px-3 py-1.5 text-sm bg-accent text-white rounded-full hover:bg-accent-dark transition-colors"
                >
                  Use
                </button>
              )}
              {!isCreator && onSubscribe && viewerFid && (
                <button
                  onClick={handleSubscribe}
                  disabled={isSubscribing}
                  className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                  {isSubscribing ? "..." : "Subscribe"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

