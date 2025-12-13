"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { useXmtp } from "../contexts/XmtpContext";
import { ConsentState } from "@xmtp/browser-sdk";

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
  const { client, isInitialized } = useXmtp();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (client && isInitialized) {
      fetchConversations();
    } else {
      setLoading(false);
    }
  }, [client, isInitialized]);

  const fetchConversations = async () => {
    if (!client) return;

    setLoading(true);
    setError(null);

    try {
      // List conversations directly from XMTP client
      const allConversations = await client.conversations.list({
        consentStates: [ConsentState.Allowed],
      });

      // Transform to our format
      const transformed = await Promise.all(
        allConversations.map(async (conv) => {
          // Get last message
          const messages = await conv.messages({ limit: BigInt(1) });
          const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;

          // Browser SDK uses inboxId instead of topic
          const conversationId = ('inboxId' in conv ? String(conv.inboxId) : ('topic' in conv ? String(conv.topic) : ''));
          const peerAddress = 'peerAddress' in conv ? (conv.peerAddress as string | null) : null;
          const isGroup = !peerAddress;

          return {
            conversationId: conversationId || '',
            peerAddress: peerAddress || null,
            type: (isGroup ? "group" : "1:1") as "1:1" | "group",
            lastMessage: lastMessage
              ? {
                  content: typeof lastMessage.content === "string" 
                    ? lastMessage.content 
                    : JSON.stringify(lastMessage.content),
                  senderAddress: (lastMessage as any).senderAddress || (lastMessage as any).sender || '',
                  sentAt: (lastMessage as any).sent || (lastMessage as any).sentAt || new Date(),
                }
              : null,
            lastMessageAt: lastMessage ? ((lastMessage as any).sent?.toISOString() || (lastMessage as any).sentAt?.toISOString() || null) : null,
            createdAt: null,
          };
        })
      );

      // Sort by last message time
      transformed.sort((a, b) => {
        const timeA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const timeB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return timeB - timeA;
      });

      setConversations(transformed);
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


