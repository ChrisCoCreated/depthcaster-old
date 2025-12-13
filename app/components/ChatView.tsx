"use client";

import { useState, useEffect, useRef } from "react";
import { formatDistanceToNow } from "date-fns";
import { MessageComposer } from "./MessageComposer";
import { useXmtp } from "../contexts/XmtpContext";

interface Message {
  messageId: string;
  conversationId: string;
  senderAddress: string;
  content: string;
  sentAt: Date;
}

interface ChatViewProps {
  conversationId: string;
  walletAddress: string;
  userFid: number;
}

export function ChatView({ conversationId, walletAddress, userFid }: ChatViewProps) {
  const { client, isInitialized } = useXmtp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (client && isInitialized) {
      fetchMessages();
      // Poll for new messages every 5 seconds
      const interval = setInterval(fetchMessages, 5000);
      return () => clearInterval(interval);
    } else {
      setLoading(false);
    }
  }, [conversationId, client, isInitialized]);

  const fetchMessages = async () => {
    if (!client || typeof window === "undefined") return;

    try {
      // Get all conversations and find the one we want
      const allConversations = await client.conversations.list();
      const conversation = allConversations.find((c: any) => {
        const id = 'inboxId' in c ? c.inboxId : ('topic' in c ? c.topic : '');
        return id === conversationId;
      });

      if (!conversation) {
        setError("Conversation not found");
        setLoading(false);
        return;
      }

      // Get messages from the conversation
      const xmtpMessages = await conversation.messages({ limit: BigInt(100) });

      // Transform to our format
      const transformed = xmtpMessages.map((msg: any) => ({
        messageId: msg.id,
        conversationId,
        senderAddress: (msg as any).senderAddress || (msg as any).sender || '',
        content: typeof msg.content === "string" 
          ? msg.content 
          : JSON.stringify(msg.content),
        sentAt: (msg as any).sent || (msg as any).sentAt || new Date(),
      }));

      setMessages(transformed);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load messages");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Scroll to bottom when messages change
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleMessageSent = () => {
    // Refresh messages after sending
    setTimeout(fetchMessages, 500);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading messages...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-red-600 dark:text-red-400 mb-2">{error}</p>
          <button
            onClick={fetchMessages}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 dark:text-gray-400 py-8">
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((message) => {
            const isOwn = message.senderAddress.toLowerCase() === walletAddress.toLowerCase();
            return (
              <div
                key={message.messageId}
                className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[70%] rounded-lg px-4 py-2 ${
                    isOwn
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  }`}
                >
                  <div className="text-sm mb-1">
                    {typeof message.content === "string"
                      ? message.content
                      : JSON.stringify(message.content)}
                  </div>
                  <div
                    className={`text-xs ${
                      isOwn
                        ? "text-blue-100"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    {formatDistanceToNow(new Date(message.sentAt), { addSuffix: true })}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>
      <MessageComposer
        conversationId={conversationId}
        walletAddress={walletAddress}
        userFid={userFid}
        onMessageSent={handleMessageSent}
      />
    </div>
  );
}


