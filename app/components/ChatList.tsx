"use client";

import { useState, useEffect } from "react";
import { useNeynarContext } from "@neynar/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

interface Conversation {
  conversationId: string;
  peerAddress: string | null;
  type: "1:1" | "group";
  lastMessage: {
    content: string;
    senderAddress: string;
    sentAt: Date;
  } | null;
  lastMessageAt: string | null;
  createdAt: string | null;
}

interface ChatListProps {
  walletAddress: string;
  onSelectConversation?: (conversationId: string) => void;
}

export function ChatList({ walletAddress, onSelectConversation }: ChatListProps) {
  const { user } = useNeynarContext();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.fid && walletAddress) {
      fetchConversations();
    }
  }, [user?.fid, walletAddress]);

  const fetchConversations = async () => {
    if (!user?.fid) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/xmtp/conversations?userFid=${user.fid}&walletAddress=${walletAddress}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch conversations");
      }

      const data = await response.json();
      setConversations(data.conversations || []);
    } catch (err: any) {
      setError(err.message || "Failed to load conversations");
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (conversationId: string) => {
    onSelectConversation?.(conversationId);
    router.push(`/chat/${conversationId}`);
  };

  if (loading) {
    return (
      <div className="p-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading conversations...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        <button
          onClick={fetchConversations}
          className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="p-4 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No conversations yet. Start a new chat!
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        {conversations.map((conv) => (
          <button
            key={conv.conversationId}
            onClick={() => handleSelect(conv.conversationId)}
            className="w-full p-4 hover:bg-gray-50 dark:hover:bg-gray-900 border-b border-gray-200 dark:border-gray-800 text-left"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-sm">
                    {conv.type === "group" ? "Group Chat" : conv.peerAddress?.slice(0, 6) + "..." + conv.peerAddress?.slice(-4)}
                  </span>
                  {conv.type === "group" && (
                    <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded">
                      Group
                    </span>
                  )}
                </div>
                {conv.lastMessage && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                    {typeof conv.lastMessage.content === "string"
                      ? conv.lastMessage.content
                      : JSON.stringify(conv.lastMessage.content)}
                  </p>
                )}
              </div>
              {conv.lastMessageAt && (
                <span className="text-xs text-gray-500 dark:text-gray-500 ml-2 flex-shrink-0">
                  {formatDistanceToNow(new Date(conv.lastMessageAt), { addSuffix: true })}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}


