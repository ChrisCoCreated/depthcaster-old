"use client";

import { useState, useRef, useEffect } from "react";
import { useXmtp } from "../contexts/XmtpContext";

interface MessageComposerProps {
  conversationId: string;
  walletAddress: string;
  userFid: number;
  onMessageSent?: () => void;
}

export function MessageComposer({
  conversationId,
  walletAddress,
  userFid,
  onMessageSent,
}: MessageComposerProps) {
  const { client } = useXmtp();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!message.trim() || sending || !client || typeof window === "undefined") return;

    setSending(true);

    try {
      // Get all conversations and find the one we want
      const allConversations = await client.conversations.list();
      const conversation = allConversations.find((c: any) => {
        const id = 'inboxId' in c ? c.inboxId : ('topic' in c ? c.topic : '');
        return id === conversationId;
      });

      if (!conversation) {
        throw new Error("Conversation not found");
      }

      // Send message directly
      await conversation.send(message.trim());

      setMessage("");
      onMessageSent?.();

      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } catch (error: any) {
      console.error("Error sending message:", error);
      alert(error.message || "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border-t border-gray-200 dark:border-gray-800 p-4">
      <div className="flex gap-2">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
          className="flex-1 resize-none rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent dark:focus:ring-accent"
          disabled={sending}
        />
        <button
          type="submit"
          disabled={!message.trim() || sending}
          className="px-6 py-2 bg-accent hover:bg-accent-dark text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          {sending ? "Sending..." : "Send"}
        </button>
      </div>
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        Press Enter to send, Shift+Enter for new line
      </p>
    </form>
  );
}


