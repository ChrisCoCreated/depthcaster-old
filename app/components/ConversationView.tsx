"use client";

import React, { useState, useEffect, useCallback } from "react";
import { CastCard } from "./CastCard";
import { useNeynarContext } from "@neynar/react";
import { formatDistanceToNow } from "date-fns";
import { Cast } from "@neynar/nodejs-sdk/build/api";
import { useRouter } from "next/navigation";

interface ConversationViewProps {
  castHash: string;
  viewerFid?: number;
  focusReplyHash?: string;
  onFocusReply?: () => void;
  customContentAfterRoot?: React.ReactNode;
}

interface ThreadedReply {
  hash: string;
  parent_hash?: string;
  _parentCastHash?: string;
  _replyDepth?: number;
  _isQuoteCast?: boolean;
  children?: ThreadedReply[];
  [key: string]: any;
}

export function ConversationView({ castHash, viewerFid, focusReplyHash, onFocusReply, customContentAfterRoot }: ConversationViewProps) {
  const [rootCast, setRootCast] = useState<any>(null);
  const [replies, setReplies] = useState<ThreadedReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conversationFetchedAt, setConversationFetchedAt] = useState<Date | null>(null);
  const [sortBy, setSortBy] = useState<"newest" | "engagement" | "quality">("newest");
  const [fetchedParentCasts, setFetchedParentCasts] = useState<Map<string, ThreadedReply>>(new Map());
  const [fetchingParents, setFetchingParents] = useState<Set<string>>(new Set());
  const { user } = useNeynarContext();
  const router = useRouter();
  const [highlightedReply, setHighlightedReply] = useState<string | null>(null);
  const normalizedFocusHash = focusReplyHash?.toLowerCase() || null;
  
  // Quality filter state
  const [minQualityScore, setMinQualityScore] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("minQualityScore");
      return saved ? parseInt(saved, 10) : 60;
    }
    return 60;
  });
  const [qualityFilterEnabled, setQualityFilterEnabled] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("qualityFilterEnabled");
      return saved !== null ? saved === "true" : true;
    }
    return true;
  });
  const [showQualitySettings, setShowQualitySettings] = useState(false);

  // Check if a reply is a quote cast
  function isQuoteCast(reply: ThreadedReply): boolean {
    if (reply._isQuoteCast) return true;
    // Also check embeds for cast embeds
    if (reply.embeds && Array.isArray(reply.embeds)) {
      return reply.embeds.some((embed: any) => embed.cast_id || (embed.cast && embed.cast.hash));
    }
    return false;
  }

  // Check if a reply meets quality threshold
  function meetsQualityThreshold(reply: ThreadedReply): boolean {
    if (!qualityFilterEnabled) return true;
    const qualityScore = (reply as any)._qualityScore;
    if (qualityScore === null || qualityScore === undefined) return false;
    return qualityScore >= minQualityScore;
  }

  // Count all replies recursively (including nested)
  function countAllReplies(replies: ThreadedReply[]): number {
    let count = 0;
    function countRecursive(reply: ThreadedReply) {
      count++;
      if (reply.children && reply.children.length > 0) {
        reply.children.forEach(countRecursive);
      }
    }
    replies.forEach(countRecursive);
    return count;
  }

  // Recursively filter replies to hide those with low quality
  function filterReplies(replies: ThreadedReply[]): { visible: ThreadedReply[]; hidden: number } {
    const totalCount = countAllReplies(replies);

    function filterRecursive(reply: ThreadedReply): ThreadedReply | null {
      // Filter children first
      const filteredChildren: ThreadedReply[] = [];
      
      if (reply.children && reply.children.length > 0) {
        reply.children.forEach((child) => {
          const filteredChild = filterRecursive(child);
          if (filteredChild) {
            filteredChildren.push(filteredChild);
          }
        });
      }

      // Check quality threshold
      const meetsQuality = meetsQualityThreshold(reply);
      
      // Determine if this reply should be shown
      let shouldShow = true;
      
      // If quality filter is enabled, reply must meet quality threshold (unless it has children that do)
      if (qualityFilterEnabled && !meetsQuality && filteredChildren.length === 0) {
        shouldShow = false;
      }
      
      // If reply doesn't meet criteria but has children that do, show it to preserve the thread
      if (!shouldShow && filteredChildren.length > 0) {
        shouldShow = true;
      }

      if (!shouldShow) {
        return null;
      }

      return {
        ...reply,
        children: filteredChildren.length > 0 ? filteredChildren : undefined,
      };
    }

    const visible: ThreadedReply[] = [];
    
    replies.forEach((reply) => {
      const filtered = filterRecursive(reply);
      if (filtered) {
        visible.push(filtered);
      }
    });

    const visibleCount = countAllReplies(visible);
    const hiddenCount = totalCount - visibleCount;

    return { visible, hidden: hiddenCount };
  }

  const fetchConversation = useCallback(async (isRefresh = false) => {
    if (!castHash) {
      setError("Cast hash is required");
      setLoading(false);
      return;
    }

    try {
      // Only show loading state on initial load, not on refresh
      if (!isRefresh) {
        setLoading(true);
      }
      setError(null);

      // Preserve scroll position during refresh
      const scrollY = isRefresh ? window.scrollY : 0;

      const params = new URLSearchParams({ castHash });
      if (sortBy) {
        params.append("sortBy", sortBy);
      }
      const response = await fetch(`/api/conversation/database?${params}`);
      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.error || "Failed to fetch conversation";
        // Store status code in error for fallback detection
        const error = new Error(errorMessage);
        (error as any).status = response.status;
        throw error;
      }

      const data = await response.json();
      setRootCast(data.rootCast);
      setReplies(data.replies || []);
      setConversationFetchedAt(data.conversationFetchedAt ? new Date(data.conversationFetchedAt) : null);
      setLoading(false);

      // Restore scroll position after refresh
      if (isRefresh && scrollY > 0) {
        requestAnimationFrame(() => {
          window.scrollTo({ top: scrollY, behavior: "auto" });
        });
      }
    } catch (err: any) {
      const errorMessage = err.message || "Failed to load conversation";
      setError(errorMessage);
      // Store status code if available for fallback detection
      if (err.status) {
        (err as any).status = err.status;
      }
      setLoading(false);
    }
  }, [castHash, sortBy]);

  useEffect(() => {
    fetchConversation();
  }, [fetchConversation]);

  useEffect(() => {
    if (!normalizedFocusHash || replies.length === 0) return;
    const element = document.getElementById(`reply-${normalizedFocusHash}`);
    if (!element) return;
    const headerOffset = 120;
    const elementTop = element.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({
      top: Math.max(elementTop - headerOffset, 0),
      behavior: "smooth",
    });
    setHighlightedReply(normalizedFocusHash);
    const timer = window.setTimeout(() => {
      setHighlightedReply((current) => (current === normalizedFocusHash ? null : current));
    }, 2000);
    return () => {
      clearTimeout(timer);
    };
  }, [normalizedFocusHash, replies]);

  // Find a cast by hash in the replies tree
  function findCastByHash(replies: ThreadedReply[], hash: string): ThreadedReply | null {
    for (const reply of replies) {
      // Case-insensitive comparison
      if (reply.hash?.toLowerCase() === hash.toLowerCase()) {
        return reply;
      }
      if (reply.children && reply.children.length > 0) {
        const found = findCastByHash(reply.children, hash);
        if (found) return found;
      }
    }
    return null;
  }

  // Fetch a parent cast by hash
  const fetchParentCast = useCallback(async (parentHash: string) => {
    // Mark as fetching
    setFetchingParents(prev => {
      if (prev.has(parentHash)) {
        return prev; // Already fetching
      }
      return new Set(prev).add(parentHash);
    });

    try {
      const response = await fetch(
        `/api/conversation?identifier=${encodeURIComponent(parentHash)}&type=hash&replyDepth=0`
      );
      
      if (!response.ok) {
        throw new Error("Failed to fetch parent cast");
      }

      const data = await response.json();
      const parentCastData = data?.conversation?.cast;
      
      if (parentCastData) {
        // Save parent cast to database
        try {
          const saveResponse = await fetch("/api/conversation/parent-cast", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              parentCastHash: parentHash,
              parentCastData: parentCastData,
              rootCastHash: castHash,
            }),
          });

          if (!saveResponse.ok) {
            const errorData = await saveResponse.json();
            console.error(`Error saving parent cast ${parentHash}:`, errorData.error);
          }
        } catch (saveErr) {
          console.error(`Error saving parent cast ${parentHash}:`, saveErr);
        }

        const parentCast: ThreadedReply = {
          ...parentCastData,
          _parentCastHash: parentCastData.parent_hash,
          _isQuoteCast: false,
          children: [],
        };
        
        setFetchedParentCasts(prev => {
          // Only add if not already present
          if (prev.has(parentHash)) {
            return prev;
          }
          const newMap = new Map(prev);
          newMap.set(parentHash, parentCast);
          return newMap;
        });
      }
    } catch (err) {
      console.error(`Error fetching parent cast ${parentHash}:`, err);
    } finally {
      setFetchingParents(prev => {
        const newSet = new Set(prev);
        newSet.delete(parentHash);
        return newSet;
      });
    }
  }, [castHash]);

  // Collect all parent hashes that need to be fetched
  useEffect(() => {
    if (replies.length === 0) return;
    
    const parentHashesToFetch: string[] = [];
    
    function collectParentHashes(replies: ThreadedReply[]) {
      for (const reply of replies) {
        if (isQuoteCast(reply) && reply._parentCastHash && reply._parentCastHash !== castHash) {
          const parentInTree = findCastByHash(replies, reply._parentCastHash);
          
          // If not in tree, check if we need to fetch it
          if (!parentInTree) {
            const parentHash = reply._parentCastHash;
            
            // Check if already fetched or currently fetching
            const alreadyFetched = fetchedParentCasts.has(parentHash);
            const currentlyFetching = fetchingParents.has(parentHash);
            
            if (!alreadyFetched && !currentlyFetching && !parentHashesToFetch.includes(parentHash)) {
              parentHashesToFetch.push(parentHash);
            }
          }
        }
        
        if (reply.children && reply.children.length > 0) {
          collectParentHashes(reply.children);
        }
      }
    }
    
    collectParentHashes(replies);
    
    // Fetch all missing parent casts
    parentHashesToFetch.forEach(parentHash => {
      fetchParentCast(parentHash);
    });
  }, [replies, castHash, fetchedParentCasts, fetchingParents, fetchParentCast]);

  // Render threaded reply component
  function renderThreadedReply(reply: ThreadedReply, depth: number = 1, isLastChild: boolean = false, parentHasMore: boolean = false, hasChildren: boolean = false) {
    const indentPx = depth > 1 ? 48 : 0;
    const showVerticalLine = !isLastChild || hasChildren || parentHasMore;
    const isQuote = isQuoteCast(reply);
    const normalizedHash = reply.hash?.toLowerCase?.();
    const isHighlighted = normalizedHash && highlightedReply === normalizedHash;
    
    // Find parent cast if this is a quote cast with a parent (not root)
    // IMPORTANT: parent_hash is the cast being replied to, NOT the quoted cast in embeds
    // The database API should already attach _parentCast to quote casts, so use that first
    let parentCast: ThreadedReply | null = null;
    if (isQuote && reply._parentCastHash && reply._parentCastHash !== castHash) {
      // Get quoted cast hash from embeds to ensure we're not confusing it with parent_hash
      const quotedCastHashes: string[] = [];
      if (reply.embeds && Array.isArray(reply.embeds)) {
        reply.embeds.forEach((embed: any) => {
          if (embed.cast_id?.hash) {
            quotedCastHashes.push(embed.cast_id.hash);
          } else if (embed.cast?.hash) {
            quotedCastHashes.push(embed.cast.hash);
          }
        });
      }
      
      // Only use parent_hash if it's different from the quoted cast hash
      // parent_hash = cast being replied to (what we want to show)
      // quoted cast = cast being quoted (what's in embeds, NOT what we want to show)
      const parentHash = reply._parentCastHash;
      const isParentDifferentFromQuoted = !quotedCastHashes.includes(parentHash);
      
      if (isParentDifferentFromQuoted) {
        // First, check if parent cast was already attached by the database API
        if ((reply as any)._parentCast) {
          parentCast = (reply as any)._parentCast;
        } else {
          // Fallback: check in replies tree (but this might find the wrong cast)
          parentCast = findCastByHash(replies, parentHash);
          
          // If not found in tree, check fetched parent casts
          if (!parentCast) {
            parentCast = fetchedParentCasts.get(parentHash) || null;
          }
        }
      }
    }
    
    // Create a modified cast object with embeds filtered out (hide quoted cast embed)
    const castWithoutQuotedEmbed = isQuote && reply.embeds ? {
      ...reply,
      embeds: reply.embeds.filter((embed: any) => {
        // Filter out cast embeds (the quoted cast)
        return !embed.cast_id && !(embed.cast && embed.cast.hash);
      }),
      _isQuoteCast: true, // Keep flag for indicator
      _parentCast: parentCast ? parentCast as Cast : undefined, // Pass parent cast data
    } : reply;
    
    return (
      <div
        key={reply.hash}
        id={normalizedHash ? `reply-${normalizedHash}` : undefined}
        className={`relative ${isHighlighted ? "ring-2 ring-accent dark:ring-accent rounded-lg" : ""}`}
      >
        <div className="flex relative">
          {/* Thread line area */}
          <div className="flex-shrink-0 relative" style={{ width: depth > 1 ? '24px' : '8px' }}>
            {depth > 1 && showVerticalLine && (
              <div className="absolute top-0 left-0 bottom-0 w-px bg-gray-300 dark:bg-gray-600" />
            )}
            {depth === 1 && showVerticalLine && (
              <div className="absolute top-0 left-0 bottom-0 w-px bg-gray-300 dark:bg-gray-600" />
            )}
          </div>
          
          {/* Reply content */}
          <div className="flex-1 min-w-0" style={{ marginLeft: `${indentPx}px` }}>
            <CastCard cast={castWithoutQuotedEmbed as Cast} showThread={false} onUpdate={() => fetchConversation(true)} isReply={true} rootCastHash={rootCast?.hash || castHash} />
          </div>
        </div>
        
        {/* Render children */}
        {reply.children && reply.children.length > 0 && (
          <div className="relative" style={{ marginLeft: depth > 1 ? '24px' : '8px' }}>
            {reply.children.length > 0 && (
              <div className="absolute left-0 top-0 bottom-0 w-px bg-gray-300 dark:bg-gray-600" />
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

  if (!rootCast) {
    return (
      <div className="p-8 text-center text-gray-500 dark:text-gray-400">
        Conversation not found
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Main cast */}
      <div className="border-b border-gray-100 dark:border-gray-800">
        <CastCard cast={rootCast} showThread={false} onUpdate={() => fetchConversation(true)} disableClick={true} rootCastHash={rootCast?.hash || castHash} />
      </div>

      {/* Custom content after root cast (e.g., poll) */}
      {customContentAfterRoot && (
        <div className="mt-4 px-4">
          {customContentAfterRoot}
        </div>
      )}

      {/* Sort options and quality filter */}
      {replies.length > 0 && (
        <div className="mt-4 px-4 py-2 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600 dark:text-gray-400">Sort replies:</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    const newValue = !qualityFilterEnabled;
                    setQualityFilterEnabled(newValue);
                    localStorage.setItem("qualityFilterEnabled", newValue.toString());
                  }}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${
                    qualityFilterEnabled
                      ? "bg-accent/40 dark:bg-accent-dark/90 text-accent-dark dark:text-accent font-medium"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                  }`}
                >
                  {qualityFilterEnabled ? `Q: ${minQualityScore}+` : "Q: 0"}
                </button>
                {qualityFilterEnabled && (
                  <button
                    onClick={() => setShowQualitySettings(!showQualitySettings)}
                    className="p-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                    title="Quality settings"
                  >
                    <svg
                      className={`w-4 h-4 transition-transform ${showQualitySettings ? "rotate-180" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setSortBy("newest")}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  sortBy === "newest"
                    ? "bg-accent/40 dark:bg-accent-dark/90 text-accent-dark dark:text-accent font-medium"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
              >
                Newest
              </button>
              <button
                onClick={() => setSortBy("engagement")}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  sortBy === "engagement"
                    ? "bg-accent/40 dark:bg-accent-dark/90 text-accent-dark dark:text-accent font-medium"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
              >
                Most Engagement
              </button>
              <button
                onClick={() => setSortBy("quality")}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  sortBy === "quality"
                    ? "bg-accent/40 dark:bg-accent-dark/90 text-accent-dark dark:text-accent font-medium"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
              >
                Quality
              </button>
            </div>
          </div>
          
          {/* Quality settings (expandable) */}
          {showQualitySettings && (
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">Min Quality:</span>
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
                  className="flex-1 max-w-[200px]"
                />
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300 min-w-10">
                  {minQualityScore}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Replies */}
      {replies.length > 0 && (() => {
        const { visible } = filterReplies(replies);
        
        return (
          <div className="mt-6">
            {visible.map((reply, index) => 
              renderThreadedReply(
                reply, 
                1, 
                index === visible.length - 1, 
                index < visible.length - 1,
                (reply.children && reply.children.length > 0) || false
              )
            )}
          </div>
        );
      })()}

      {replies.length === 0 && (
        <div className="p-8 text-center">
          {onFocusReply ? (
            <button
              onClick={onFocusReply}
              className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline transition-colors cursor-pointer"
            >
              No quality replies detected yet. Start the conversation.
            </button>
          ) : (
            <span className="text-gray-500 dark:text-gray-400">
              No quality replies detected yet. Start the conversation.
            </span>
          )}
        </div>
      )}

      {/* View full thread in algo mode button */}
      <div className="mt-6 px-4 py-3 border-t border-gray-200 dark:border-gray-800">
        <button
          onClick={() => router.push(`/cast/${castHash}`)}
          className="text-sm text-accent-dark dark:text-accent hover:text-accent-dark dark:hover:text-accent hover:underline transition-colors"
        >
          View full thread in algo mode
        </button>
      </div>
    </div>
  );
}

