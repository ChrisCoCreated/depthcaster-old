"use client";

import { useState, useEffect, useCallback } from "react";
import { Cast } from "@neynar/nodejs-sdk/build/api";
import { CastCard } from "./CastCard";
import { useNeynarContext } from "@neynar/react";

interface CastThreadProps {
  castHash: string;
  viewerFid?: number;
}

// Helper function to check if a cast mentions @deepbot
function mentionsDeepbot(cast: Cast): boolean {
  if (cast.mentioned_profiles && Array.isArray(cast.mentioned_profiles)) {
    return cast.mentioned_profiles.some(
      (profile: any) => profile?.username?.toLowerCase() === "deepbot"
    );
  }
  return false;
}

export function CastThread({ castHash, viewerFid }: CastThreadProps) {
  const [conversation, setConversation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { user } = useNeynarContext();

  const fetchConversation = useCallback(async () => {
    if (!castHash) {
      setError("Cast hash is required");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        identifier: castHash,
        type: "hash",
        replyDepth: "5",
      });

      if (viewerFid || user?.fid) {
        params.append("viewerFid", (viewerFid || user?.fid)!.toString());
      }

      const response = await fetch(`/api/conversation?${params}`);
      if (!response.ok) {
        throw new Error("Failed to fetch conversation");
      }

      const data = await response.json();
      setConversation(data);
    } catch (err: any) {
      setError(err.message || "Failed to load conversation");
    } finally {
      setLoading(false);
    }
  }, [castHash, viewerFid, user?.fid]);

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
  const allReplies = mainCast.direct_replies || [];
  // Filter out replies that mention @deepbot
  const directReplies = allReplies.filter((reply: Cast) => !mentionsDeepbot(reply));
  const parentCasts = conversation.chronological_parent_casts || [];

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
      <div className="border-b-2 border-gray-300 dark:border-gray-700">
        <CastCard cast={mainCast} showThread={false} onUpdate={fetchConversation} />
      </div>

      {/* Replies */}
      {directReplies && directReplies.length > 0 && (
        <div className="mt-4">
          <h3 className="px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
            Replies ({directReplies.length}{allReplies.length !== directReplies.length ? ` (${allReplies.length - directReplies.length} hidden)` : ""})
          </h3>
          {directReplies.map((reply: Cast) => (
            <div key={reply.hash} className="pl-8 border-l-2 border-gray-200 dark:border-gray-800">
              <CastCard cast={reply} showThread onUpdate={fetchConversation} />
            </div>
          ))}
        </div>
      )}

      {(!directReplies || directReplies.length === 0) && (
        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
          No replies yet
        </div>
      )}
    </div>
  );
}

