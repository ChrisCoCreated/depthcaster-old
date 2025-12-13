"use client";

import { useState, useEffect, useRef } from "react";
import { formatDistanceToNow } from "date-fns";
import { MessageComposer } from "./MessageComposer";

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isUserAddress, setIsUserAddress] = useState(false);

  useEffect(() => {
    if (walletAddress) {
      setIsUserAddress(true);
    }
  }, [walletAddress]);

  useEffect(() => {
    fetchMessages();
    // Poll for new messages every 5 seconds
    const interval = setInterval(fetchMessages, 5000);
    return () => clearInterval(interval);
  }, [conversationId, walletAddress, userFid]);

  const fetchMessages = async () => {
    if (!userFid || !walletAddress) return;

    try {
      const response = await fetch(
        `/api/xmtp/conversations/${conversationId}/messages?userFid=${userFid}&walletAddress=${walletAddress}&limit=100`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch messages");
      }

      const data = await response.json();
      setMessages(data.messages || []);
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

