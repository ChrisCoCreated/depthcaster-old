"use client";

import { useState } from "react";
import { useNeynarContext } from "@neynar/react";

interface CastComposerProps {
  parentHash?: string;
  onSuccess?: () => void;
}

export function CastComposer({ parentHash, onSuccess }: CastComposerProps) {
  const [text, setText] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useNeynarContext();

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    
    if (!user?.signer_uuid) {
      setError("Please sign in to post casts");
      return;
    }

    if (!text.trim()) {
      setError("Cast text cannot be empty");
      return;
    }

    if (isPosting) {
      return; // Prevent double submission
    }

    try {
      setIsPosting(true);
      setError(null);

      const response = await fetch("/api/cast", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          signerUuid: user.signer_uuid,
          text: text.trim(),
          parent: parentHash,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to post cast");
      }

      setText("");
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      setError(err.message || "Failed to post cast");
    } finally {
      setIsPosting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Command+Return (Mac) or Ctrl+Return (Windows/Linux)
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (!user) {
    return (
      <div className="p-4 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Please sign in to post casts
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={`${parentHash ? '' : 'border-b border-gray-200 dark:border-gray-800'} p-2 sm:p-4`}>
      <div className="flex gap-2 sm:gap-3">
        {/* Avatar */}
        <img
          src={user.pfp_url || "/default-avatar.png"}
          alt={user.username}
          className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex-shrink-0"
        />

        {/* Input area */}
        <div className="flex-1 min-w-0">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={parentHash ? "Write a reply..." : "What's on your mind?"}
            className="w-full p-2 sm:p-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-black text-sm sm:text-base text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 resize-none"
            rows={parentHash ? 3 : 4}
            maxLength={320}
          />
          
          {error && (
            <div className="mt-2 text-xs sm:text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {text.length}/320
            </span>
            <button
              type="submit"
              disabled={isPosting || !text.trim()}
              className="px-4 sm:px-6 py-1.5 sm:py-2 bg-blue-600 dark:bg-blue-500 text-white text-sm sm:text-base rounded-full font-medium hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isPosting ? "Posting..." : parentHash ? "Reply" : "Cast"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

