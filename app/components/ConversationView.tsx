"use client";

import { useState, useEffect, useCallback } from "react";
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

export function ConversationView({ castHash, viewerFid, focusReplyHash, onFocusReply }: ConversationViewProps) {
  const [rootCast, setRootCast] = useState<any>(null);
  const [replies, setReplies] = useState<ThreadedReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conversationFetchedAt, setConversationFetchedAt] = useState<Date | null>(null);
  const [hideNoEngagement, setHideNoEngagement] = useState(false);
  const [sortBy, setSortBy] = useState<"newest" | "engagement" | "quality">("newest");
  const [fetchedParentCasts, setFetchedParentCasts] = useState<Map<string, ThreadedReply>>(new Map());
  const [fetchingParents, setFetchingParents] = useState<Set<string>>(new Set());
  const { user } = useNeynarContext();
  const router = useRouter();
  const [highlightedReply, setHighlightedReply] = useState<string | null>(null);
  const normalizedFocusHash = focusReplyHash?.toLowerCase() || null;

  // Check if a reply is a quote cast
  function isQuoteCast(reply: ThreadedReply): boolean {
    if (reply._isQuoteCast) return true;
    // Also check embeds for cast embeds
    if (reply.embeds && Array.isArray(reply.embeds)) {
      return reply.embeds.some((embed: any) => embed.cast_id || (embed.cast && embed.cast.hash));
    }
    return false;
  }

  // Check if a reply has any engagement
  function hasEngagement(reply: ThreadedReply): boolean {
    const likes = reply.reactions?.likes_count || reply.reactions?.likes?.length || 0;
    const recasts = reply.reactions?.recasts_count || reply.reactions?.recasts?.length || 0;
    const replyCount = reply.replies?.count || 0;
    return likes > 0 || recasts > 0 || replyCount > 0;
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

  // Recursively filter replies to hide those with no engagement (only when hideNoEngagement is true)
  function filterReplies(replies: ThreadedReply[], hideNoEngagement: boolean): { visible: ThreadedReply[]; hidden: number } {
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

      // If not hiding no-engagement replies, show everything
      if (!hideNoEngagement) {
        return {
          ...reply,
          children: filteredChildren.length > 0 ? filteredChildren : undefined,
        };
      }

      // When hiding no-engagement replies, filter based on engagement
      const hasEng = hasEngagement(reply);
      
      // If no engagement and no children with engagement, hide it
      if (!hasEng && filteredChildren.length === 0) {
        return null;
      }

      // Include if it has engagement or has children with engagement
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
        throw new Error(errorData.error || "Failed to fetch conversation");
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
      setError(err.message || "Failed to load conversation");
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
        console.log(`[ConversationView] Found cast in tree: hash=${reply.hash}, author=${reply.author?.username}`);
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
      
      console.log(`[ConversationView] Fetched parent cast from API for ${parentHash}:`, {
        hash: parentCastData?.hash,
        author: parentCastData?.author?.username,
        text: parentCastData?.text?.substring(0, 50),
      });
      
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
      
      console.log(`[ConversationView] Quote cast ${reply.hash}:`, {
        parent_hash: reply._parentCastHash,
        quotedCastHashes,
        author: reply.author?.username,
        text: reply.text?.substring(0, 50),
        hasParentCastFromAPI: !!(reply as any)._parentCast,
      });
      
      // Only use parent_hash if it's different from the quoted cast hash
      // parent_hash = cast being replied to (what we want to show)
      // quoted cast = cast being quoted (what's in embeds, NOT what we want to show)
      const parentHash = reply._parentCastHash;
      const isParentDifferentFromQuoted = !quotedCastHashes.includes(parentHash);
      
      console.log(`[ConversationView] Parent check for ${reply.hash}:`, {
        parentHash,
        isParentDifferentFromQuoted,
        quotedCastHashes,
      });
      
      if (isParentDifferentFromQuoted) {
        // First, check if parent cast was already attached by the database API
        if ((reply as any)._parentCast) {
          parentCast = (reply as any)._parentCast;
          if (parentCast) {
            console.log(`[ConversationView] Using parent cast from API for ${reply.hash}:`, {
              parentHash: parentCast.hash,
              parentAuthor: parentCast.author?.username,
              parentText: parentCast.text?.substring(0, 50),
            });
          }
        } else {
          // Fallback: check in replies tree (but this might find the wrong cast)
          parentCast = findCastByHash(replies, parentHash);
          
          console.log(`[ConversationView] Looking for parent ${parentHash} in replies tree:`, {
            foundInTree: !!parentCast,
            foundHash: parentCast?.hash,
            foundAuthor: parentCast?.author?.username,
            foundText: parentCast?.text?.substring(0, 50),
          });
          
          // If not found in tree, check fetched parent casts
          if (!parentCast) {
            parentCast = fetchedParentCasts.get(parentHash) || null;
            console.log(`[ConversationView] Checking fetchedParentCasts for ${parentHash}:`, {
              found: !!parentCast,
              foundAuthor: parentCast?.author?.username,
            });
          }
        }
        
        console.log(`[ConversationView] Final parent cast for ${reply.hash}:`, {
          found: !!parentCast,
          parentHash: parentCast?.hash,
          parentAuthor: parentCast?.author?.username,
          parentText: parentCast?.text?.substring(0, 50),
        });
      } else {
        console.log(`[ConversationView] Skipping parent cast for ${reply.hash} - parent_hash matches quoted cast`);
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
    
    // Log what we're passing to CastCard
    if (isQuote && parentCast) {
      console.log(`[ConversationView] Passing parent cast to CastCard for ${reply.hash}:`, {
        parentHash: parentCast.hash,
        parentAuthor: parentCast.author?.username,
        parentText: parentCast.text?.substring(0, 50),
      });
    }
    
    return (
      <div
        key={reply.hash}
        id={normalizedHash ? `reply-${normalizedHash}` : undefined}
        className={`relative ${isHighlighted ? "ring-2 ring-blue-400 dark:ring-blue-500 rounded-lg" : ""}`}
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

      {/* Sort options */}
      {replies.length > 0 && (
        <div className="mt-4 px-4 py-2 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">Sort replies:</span>
          <div className="flex gap-2">
            <button
              onClick={() => setSortBy("newest")}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                sortBy === "newest"
                  ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-medium"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              Newest
            </button>
            <button
              onClick={() => setSortBy("engagement")}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                sortBy === "engagement"
                  ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-medium"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              Most Engagement
            </button>
            <button
              onClick={() => setSortBy("quality")}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                sortBy === "quality"
                  ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-medium"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              Quality
            </button>
          </div>
        </div>
      )}

      {/* Replies */}
      {replies.length > 0 && (() => {
        const { visible, hidden } = filterReplies(replies, hideNoEngagement);
        // Calculate how many replies would be hidden if we filtered (for the button text)
        const { hidden: hiddenCountWhenFiltering } = filterReplies(replies, true);
        
        return (
          <>
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

            {/* Toggle button to hide/show no-engagement replies */}
            {hiddenCountWhenFiltering > 0 && (
              <div className="mt-6 px-4 py-3 text-center border-t border-gray-200 dark:border-gray-800">
                <button
                  onClick={() => setHideNoEngagement(!hideNoEngagement)}
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 underline transition-colors"
                >
                  {hideNoEngagement 
                    ? `Show ${hiddenCountWhenFiltering} ${hiddenCountWhenFiltering === 1 ? 'reply' : 'replies'} with no engagement`
                    : `Hide ${hiddenCountWhenFiltering} ${hiddenCountWhenFiltering === 1 ? 'reply' : 'replies'} with no engagement`
                  }
                </button>
              </div>
            )}
          </>
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
          className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline transition-colors"
        >
          View full thread in algo mode
        </button>
      </div>
    </div>
  );
}

