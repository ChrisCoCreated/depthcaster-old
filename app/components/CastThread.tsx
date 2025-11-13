"use client";

import { useState, useEffect, useCallback } from "react";
import { Cast } from "@neynar/nodejs-sdk/build/api";
import { CastCard } from "./CastCard";
import { useNeynarContext } from "@neynar/react";
import { shouldHideBotCastClient } from "@/lib/bot-filter";

interface CastThreadProps {
  castHash: string;
  viewerFid?: number;
}

const DEFAULT_HIDDEN_BOTS = ["betonbangers", "deepbot", "bracky"];

export function CastThread({ castHash, viewerFid }: CastThreadProps) {
  const [conversation, setConversation] = useState<any>(null);
  const [belowFoldReplies, setBelowFoldReplies] = useState<Cast[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingBelowFold, setLoadingBelowFold] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBelowFold, setShowBelowFold] = useState(false);
  const [botPreferences, setBotPreferences] = useState<{
    hideBots?: boolean;
    hiddenBots?: string[];
  }>({
    hideBots: true,
    hiddenBots: DEFAULT_HIDDEN_BOTS,
  });

  const { user } = useNeynarContext();

  // Fetch user bot preferences
  useEffect(() => {
    if (!user?.fid || !user?.signer_uuid) {
      setBotPreferences({
        hideBots: true,
        hiddenBots: DEFAULT_HIDDEN_BOTS,
      });
      return;
    }

    const fetchPreferences = async () => {
      try {
        const response = await fetch(
          `/api/user/preferences?fid=${user.fid}&signerUuid=${user.signer_uuid}`
        );
        if (response.ok) {
          const data = await response.json();
          setBotPreferences({
            hideBots: data.hideBots !== undefined ? data.hideBots : true,
            hiddenBots: data.hiddenBots || DEFAULT_HIDDEN_BOTS,
          });
        }
      } catch (error) {
        console.error("Failed to fetch bot preferences:", error);
        // Use defaults on error
        setBotPreferences({
          hideBots: true,
          hiddenBots: DEFAULT_HIDDEN_BOTS,
        });
      }
    };

    fetchPreferences();
  }, [user]);

  const fetchConversation = useCallback(async (fold?: "above" | "below") => {
    if (!castHash) {
      setError("Cast hash is required");
      setLoading(false);
      return;
    }

    try {
      if (fold === "below") {
        setLoadingBelowFold(true);
      } else {
        setLoading(true);
        setError(null);
      }

      const params = new URLSearchParams({
        identifier: castHash,
        type: "hash",
        replyDepth: "5",
        fold: fold || "above",
      });

      if (viewerFid || user?.fid) {
        params.append("viewerFid", (viewerFid || user?.fid)!.toString());
      }

      const response = await fetch(`/api/conversation?${params}`);
      if (!response.ok) {
        throw new Error("Failed to fetch conversation");
      }

      const data = await response.json();
      
      if (fold === "below") {
        // Store below-fold replies
        const belowFold = data?.conversation?.cast?.direct_replies || [];
        setBelowFoldReplies(belowFold);
        setLoadingBelowFold(false);
      } else {
        // Store above-fold conversation
        setConversation(data);
        // Reset below-fold state when fetching new conversation
        setBelowFoldReplies([]);
        setShowBelowFold(false);
        setLoading(false);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load conversation");
      if (fold === "below") {
        setLoadingBelowFold(false);
      } else {
        setLoading(false);
      }
    }
  }, [castHash, viewerFid, user?.fid]);

  const handleShowBelowFold = useCallback(() => {
    setShowBelowFold(true);
    // Only fetch if we haven't fetched below-fold replies yet
    if (belowFoldReplies.length === 0 && !loadingBelowFold) {
      fetchConversation("below");
    }
  }, [belowFoldReplies.length, loadingBelowFold, fetchConversation]);

  useEffect(() => {
    fetchConversation();
  }, [fetchConversation]);

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-500 dark:text-gray-400">
        Loading conversation...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-red-600 dark:text-red-400">
        Error: {error}
      </div>
    );
  }

  if (!conversation?.conversation) {
    return (
      <div className="p-8 text-center text-gray-500 dark:text-gray-400">
        Conversation not found
      </div>
    );
  }

  const mainCast = conversation.conversation.cast;
  const parentCasts = conversation.chronological_parent_casts || [];
  
  // Above-fold replies are in direct_replies when fold=Above
  const allAboveFoldReplies = mainCast.direct_replies || [];
  const totalRepliesCount = mainCast.replies?.count || 0;
  
  // Filter out bot casts based on user preferences
  const aboveFoldReplies = allAboveFoldReplies.filter((reply: Cast) => 
    !shouldHideBotCastClient(reply, botPreferences.hiddenBots, botPreferences.hideBots)
  );
  
  // Filter below-fold replies
  const filteredBelowFoldReplies = belowFoldReplies.filter((reply: Cast) => 
    !shouldHideBotCastClient(reply, botPreferences.hiddenBots, botPreferences.hideBots)
  );
  
  // Check if there are below-fold replies (total count > above-fold count)
  const hasBelowFoldReplies = totalRepliesCount > allAboveFoldReplies.length;

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Parent casts (if any) */}
      {parentCasts.length > 0 && (
        <div className="border-b border-gray-200 dark:border-gray-800">
          {parentCasts.map((parentCast: Cast) => (
            <div key={parentCast.hash} className="opacity-75">
              <CastCard cast={parentCast} onUpdate={fetchConversation} />
            </div>
          ))}
        </div>
      )}

      {/* Main cast */}
      <div className="border-b border-gray-100 dark:border-gray-800">
        <CastCard cast={mainCast} showThread={false} onUpdate={fetchConversation} />
      </div>

      {/* Replies */}
      {aboveFoldReplies.length > 0 && (
        <div className="mt-6">
          {/* Above the fold - high quality replies */}
          {aboveFoldReplies.map((reply: Cast) => (
            <div key={reply.hash} className="pl-8 border-l-2 border-gray-200 dark:border-gray-800">
              <CastCard cast={reply} showThread onUpdate={() => fetchConversation()} />
            </div>
          ))}

          {/* Below the fold toggle */}
          {hasBelowFoldReplies && (
            <div className="px-4 py-3">
              {!showBelowFold ? (
                <button
                  onClick={handleShowBelowFold}
                  disabled={loadingBelowFold}
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 underline disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingBelowFold 
                    ? "Loading..." 
                    : `Show ${totalRepliesCount - allAboveFoldReplies.length} lower quality ${totalRepliesCount - allAboveFoldReplies.length === 1 ? 'reply' : 'replies'}`
                  }
                </button>
              ) : (
                <>
                  <div className="border-t border-gray-200 dark:border-gray-800 my-2"></div>
                  <button
                    onClick={() => setShowBelowFold(false)}
                    className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 underline mb-2"
                  >
                    Hide lower quality replies
                  </button>
                  {loadingBelowFold ? (
                    <div className="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                      Loading lower quality replies...
                    </div>
                  ) : (
                    filteredBelowFoldReplies.map((reply: Cast) => (
                      <div key={reply.hash} className="pl-8 border-l-2 border-gray-200 dark:border-gray-800 opacity-75">
                        <CastCard cast={reply} showThread onUpdate={() => fetchConversation()} />
                      </div>
                    ))
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {aboveFoldReplies.length === 0 && belowFoldReplies.length === 0 && totalRepliesCount === 0 && (
        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
          No replies yet
        </div>
      )}
    </div>
  );
}

