"use client";

import { useState, useEffect, useCallback } from "react";
import { Cast } from "@neynar/nodejs-sdk/build/api";
import { CastCard } from "./CastCard";
import { useNeynarContext } from "@neynar/react";
import { shouldHideBotCastClient } from "@/lib/bot-filter";
import { useRouter } from "next/navigation";

interface CastThreadProps {
  castHash: string;
  viewerFid?: number;
}

const DEFAULT_HIDDEN_BOTS = ["betonbangers", "deepbot", "bracky", "hunttown.eth"];

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
  const router = useRouter();

  const [hasConversation, setHasConversation] = useState<boolean | null>(null);

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

  const fetchConversation = useCallback(async (fold?: "above" | "below", isRefresh = false) => {
    if (!castHash) {
      setError("Cast hash is required");
      setLoading(false);
      return;
    }

    try {
      if (fold === "below") {
        setLoadingBelowFold(true);
      } else {
        // Only show loading state on initial load, not on refresh
        if (!isRefresh) {
          setLoading(true);
        }
        setError(null);
      }

      // Preserve scroll position during refresh
      const scrollY = isRefresh && !fold ? window.scrollY : 0;

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

        // Restore scroll position after refresh
        if (isRefresh && scrollY > 0) {
          requestAnimationFrame(() => {
            window.scrollTo({ top: scrollY, behavior: "auto" });
          });
        }
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

  // Check if a curated conversation exists for this cast
  useEffect(() => {
    let cancelled = false;

    const checkConversation = async () => {
      if (!castHash) return;
      try {
        const response = await fetch(`/api/conversation/database?castHash=${encodeURIComponent(castHash)}`);
        if (cancelled) return;
        if (response.ok) {
          setHasConversation(true);
        } else if (response.status === 404) {
          setHasConversation(false);
        } else {
          setHasConversation(false);
        }
      } catch {
        if (!cancelled) {
          setHasConversation(false);
        }
      }
    };

    checkConversation();

    return () => {
      cancelled = true;
    };
  }, [castHash]);

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
  
  // Calculate the actual root cast hash (first parent in chronological order, or mainCast if no parents)
  const actualRootCastHash = parentCasts.length > 0 ? parentCasts[0].hash : mainCast.hash;
  
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

  // Build threaded tree structure from replies
  interface ThreadedReply extends Cast {
    children?: ThreadedReply[];
    _replyDepth?: number;
    _parentCastHash?: string;
  }

  function buildThreadTree(replies: ThreadedReply[], rootHash: string): ThreadedReply[] {
    // Create a map of replies by hash
    const replyMap = new Map<string, ThreadedReply>();
    replies.forEach(reply => {
      replyMap.set(reply.hash, { ...reply, children: [] });
    });

    // Build tree structure
    const rootReplies: ThreadedReply[] = [];
    replies.forEach(reply => {
      const threadedReply = replyMap.get(reply.hash)!;
      const parentHash = reply._parentCastHash || reply.parent_hash;
      
      // Calculate depth if not provided
      if (threadedReply._replyDepth === undefined) {
        if (!parentHash || parentHash === rootHash) {
          threadedReply._replyDepth = 1;
        } else {
          // Try to find parent and calculate depth
          const parent = replyMap.get(parentHash);
          if (parent) {
            threadedReply._replyDepth = (parent._replyDepth || 1) + 1;
          } else {
            threadedReply._replyDepth = 1; // Default to depth 1 if parent not found
          }
        }
      }

      if (!parentHash || parentHash === rootHash) {
        // Root-level reply
        rootReplies.push(threadedReply);
      } else {
        // Nested reply - find parent and add as child
        const parent = replyMap.get(parentHash);
        if (parent) {
          if (!parent.children) {
            parent.children = [];
          }
          parent.children.push(threadedReply);
        } else {
          // Parent not in current set, treat as root-level
          rootReplies.push(threadedReply);
        }
      }
    });

    // Sort root replies by timestamp/created_at
    rootReplies.sort((a, b) => {
      const aTime = new Date(a.timestamp || (a as any).created_at || 0).getTime();
      const bTime = new Date(b.timestamp || (b as any).created_at || 0).getTime();
      return aTime - bTime;
    });

    // Sort children recursively
    function sortChildren(reply: ThreadedReply) {
      if (reply.children && reply.children.length > 0) {
        reply.children.sort((a, b) => {
          const aTime = new Date(a.timestamp || (a as any).created_at || 0).getTime();
          const bTime = new Date(b.timestamp || (b as any).created_at || 0).getTime();
          return aTime - bTime;
        });
        reply.children.forEach(sortChildren);
      }
    }
    rootReplies.forEach(sortChildren);

    return rootReplies;
  }

  const threadedReplies = buildThreadTree(aboveFoldReplies as ThreadedReply[], mainCast.hash);
  const threadedBelowFoldReplies = buildThreadTree(filteredBelowFoldReplies as ThreadedReply[], mainCast.hash);

  // Render threaded reply component
  function renderThreadedReply(reply: ThreadedReply, depth: number = 1, isLastChild: boolean = false, parentHasMore: boolean = false, hasChildren: boolean = false) {
    const indentPx = depth > 1 ? 48 : 0; // 48px indent for nested replies
    
    // Determine if we should show the vertical line
    // Show line if: not last child, or has children, or parent has more siblings
    const showVerticalLine = !isLastChild || hasChildren || parentHasMore;
    
    return (
      <div key={reply.hash} className="relative">
        <div className="flex relative">
          {/* Thread line area - vertical line on the left */}
          <div className="flex-shrink-0 relative" style={{ width: depth > 1 ? '24px' : '8px' }}>
            {/* Continuous vertical line */}
            {depth > 1 && showVerticalLine && (
              <div 
                className="absolute top-0 left-0 bottom-0 w-px bg-gray-300 dark:bg-gray-600"
              />
            )}
            {/* Vertical line for top-level replies */}
            {depth === 1 && showVerticalLine && (
              <div 
                className="absolute top-0 left-0 bottom-0 w-px bg-gray-300 dark:bg-gray-600"
              />
            )}
          </div>
          
          {/* Reply content */}
          <div className="flex-1 min-w-0" style={{ marginLeft: `${indentPx}px` }}>
            <CastCard cast={reply} showThread={false} onUpdate={() => fetchConversation(undefined, true)} isReply={true} rootCastHash={actualRootCastHash} />
          </div>
        </div>
        
        {/* Render children */}
        {reply.children && reply.children.length > 0 && (
          <div className="relative" style={{ marginLeft: depth > 1 ? '24px' : '8px' }}>
            {/* Vertical line connecting children */}
            {reply.children.length > 0 && (
              <div 
                className="absolute left-0 top-0 bottom-0 w-px bg-gray-300 dark:bg-gray-600"
              />
            )}
            <div style={{ marginLeft: '24px' }}>
              {reply.children.map((child, index) => 
                renderThreadedReply(
                  child, 
                  depth + 1, 
                  index === reply.children!.length - 1,
                  index < reply.children!.length - 1,
                  (child.children && child.children.length > 0) || false
                )
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Non-curated notice */}
      {hasConversation === false && (
        <div className="mb-4 px-4 py-3 border border-yellow-200 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/40 text-sm text-yellow-800 dark:text-yellow-100 rounded-md">
          This cast is not part of a curated conversation. You&apos;re viewing the full algo thread only.
        </div>
      )}

      {/* Parent casts (if any) */}
      {parentCasts.length > 0 && (
        <div className="border-b border-gray-200 dark:border-gray-800">
          {parentCasts.map((parentCast: Cast) => (
            <div key={parentCast.hash} className="opacity-75">
              <CastCard cast={parentCast} onUpdate={() => fetchConversation(undefined, true)} />
            </div>
          ))}
        </div>
      )}

      {/* Main cast */}
      <div className="border-b border-gray-100 dark:border-gray-800">
        <CastCard cast={mainCast} showThread={false} onUpdate={() => fetchConversation(undefined, true)} rootCastHash={actualRootCastHash} />
      </div>

      {/* Mode banner */}
      <div className="mt-4 px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/60 rounded-md flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-gray-700 dark:text-gray-300">
          You&apos;re viewing the full algo thread. Conversation view shows the best replies only.
        </p>
        {hasConversation && (
          <button
            type="button"
            onClick={() => router.push(`/conversation/${castHash}`)}
            className="inline-flex items-center justify-center px-3 py-1.5 text-sm font-medium rounded-full bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400 transition-colors whitespace-nowrap"
          >
            Go to conversation view
          </button>
        )}
      </div>

      {/* Replies */}
      {threadedReplies.length > 0 && (
        <div className="mt-6">
          {/* Above the fold - high quality replies */}
          {threadedReplies.map((reply, index) => 
            renderThreadedReply(
              reply, 
              1, 
              index === threadedReplies.length - 1, 
              index < threadedReplies.length - 1,
              (reply.children && reply.children.length > 0) || false
            )
          )}

          {/* Below the fold toggle */}
          {hasBelowFoldReplies && (
            <div className="px-4 py-3 mt-4">
              {!showBelowFold ? (
                <button
                  onClick={handleShowBelowFold}
                  disabled={loadingBelowFold}
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 underline disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loadingBelowFold 
                    ? "Loading..." 
                    : `Show ${totalRepliesCount - allAboveFoldReplies.length} lower quality ${totalRepliesCount - allAboveFoldReplies.length === 1 ? 'reply' : 'replies'}`
                  }
                </button>
              ) : (
                <>
                  <div className="border-t border-gray-200 dark:border-gray-800 my-3"></div>
                  <button
                    onClick={() => setShowBelowFold(false)}
                    className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 underline mb-3 transition-colors"
                  >
                    Hide lower quality replies
                  </button>
                  {loadingBelowFold ? (
                    <div className="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                      Loading lower quality replies...
                    </div>
                  ) : (
                    <div className="opacity-75">
                      {threadedBelowFoldReplies.map((reply, index) => 
                        renderThreadedReply(
                          reply, 
                          1, 
                          index === threadedBelowFoldReplies.length - 1, 
                          index < threadedBelowFoldReplies.length - 1,
                          (reply.children && reply.children.length > 0) || false
                        )
                      )}
                    </div>
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

