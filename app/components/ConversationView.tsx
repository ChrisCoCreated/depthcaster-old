"use client";

import { useState, useEffect, useCallback } from "react";
import { CastCard } from "./CastCard";
import { useNeynarContext } from "@neynar/react";
import { formatDistanceToNow } from "date-fns";
import { Cast } from "@neynar/nodejs-sdk/build/api";

interface ConversationViewProps {
  castHash: string;
  viewerFid?: number;
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

export function ConversationView({ castHash, viewerFid }: ConversationViewProps) {
  const [rootCast, setRootCast] = useState<any>(null);
  const [replies, setReplies] = useState<ThreadedReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conversationFetchedAt, setConversationFetchedAt] = useState<Date | null>(null);
  const [showNoEngagement, setShowNoEngagement] = useState(false);
  const { user } = useNeynarContext();

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

  // Recursively filter replies to hide those with no engagement
  function filterReplies(replies: ThreadedReply[], showAll: boolean): { visible: ThreadedReply[]; hidden: number } {
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

      // Check if this reply has engagement
      const hasEng = hasEngagement(reply);
      
      // If showing all, include everything
      if (showAll) {
        return {
          ...reply,
          children: filteredChildren.length > 0 ? filteredChildren : undefined,
        };
      }

      // If no engagement and no children with engagement, hide it
      // (including quote casts with no engagement)
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

  const fetchConversation = useCallback(async () => {
    if (!castHash) {
      setError("Cast hash is required");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/conversation/database?castHash=${castHash}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch conversation");
      }

      const data = await response.json();
      setRootCast(data.rootCast);
      setReplies(data.replies || []);
      setConversationFetchedAt(data.conversationFetchedAt ? new Date(data.conversationFetchedAt) : null);
      setLoading(false);
    } catch (err: any) {
      setError(err.message || "Failed to load conversation");
      setLoading(false);
    }
  }, [castHash]);

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

  if (!rootCast) {
    return (
      <div className="p-8 text-center text-gray-500 dark:text-gray-400">
        Conversation not found
      </div>
    );
  }

  // Render threaded reply component
  function renderThreadedReply(reply: ThreadedReply, depth: number = 1, isLastChild: boolean = false, parentHasMore: boolean = false, hasChildren: boolean = false) {
    const indentPx = depth > 1 ? 48 : 0;
    const showVerticalLine = !isLastChild || hasChildren || parentHasMore;
    const isQuote = isQuoteCast(reply);
    
    // Create a modified cast object with embeds filtered out (hide quoted cast embed)
    const castWithoutQuotedEmbed = isQuote && reply.embeds ? {
      ...reply,
      embeds: reply.embeds.filter((embed: any) => {
        // Filter out cast embeds (the quoted cast)
        return !embed.cast_id && !(embed.cast && embed.cast.hash);
      }),
      _isQuoteCast: true, // Keep flag for indicator
    } : reply;
    
    return (
      <div key={reply.hash} className="relative">
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
            <CastCard cast={castWithoutQuotedEmbed as Cast} showThread={false} onUpdate={fetchConversation} />
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

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Main cast */}
      <div className="border-b border-gray-100 dark:border-gray-800">
        <CastCard cast={rootCast} showThread={false} onUpdate={fetchConversation} />
      </div>

      {/* Replies */}
      {replies.length > 0 && (() => {
        const { visible, hidden } = filterReplies(replies, showNoEngagement);
        // Calculate hidden count when showing all (for the hide button)
        const hiddenCountWhenShowingAll = showNoEngagement ? filterReplies(replies, false).hidden : hidden;
        
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

            {/* Show hidden replies button */}
            {hidden > 0 && !showNoEngagement && (
              <div className="mt-6 px-4 py-3 text-center border-t border-gray-200 dark:border-gray-800">
                <button
                  onClick={() => setShowNoEngagement(true)}
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 underline transition-colors"
                >
                  Show {hidden} {hidden === 1 ? 'reply' : 'replies'} with no engagement
                </button>
              </div>
            )}

            {/* Hide button when showing all */}
            {showNoEngagement && hiddenCountWhenShowingAll > 0 && (
              <div className="mt-6 px-4 py-3 text-center border-t border-gray-200 dark:border-gray-800">
                <button
                  onClick={() => setShowNoEngagement(false)}
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 underline transition-colors"
                >
                  Hide {hiddenCountWhenShowingAll} {hiddenCountWhenShowingAll === 1 ? 'reply' : 'replies'} with no engagement
                </button>
              </div>
            )}
          </>
        );
      })()}

      {replies.length === 0 && (
        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
          No replies stored in database yet
        </div>
      )}
    </div>
  );
}

