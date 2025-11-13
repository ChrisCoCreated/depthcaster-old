"use client";

import { useState, useEffect, type ReactElement } from "react";
import { Cast } from "@neynar/nodejs-sdk/build/api";
import { useNeynarContext } from "@neynar/react";

// Helper function to convert URLs in text to clickable links
function renderTextWithLinks(text: string) {
  // URL regex pattern - matches http(s):// URLs, www. URLs, and domain-like patterns
  const urlRegex = /(https?:\/\/[^\s<>"']+)|(www\.[^\s<>"']+)|([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.(?:[a-zA-Z]{2,})(?:\/[^\s<>"']*)?)/g;
  
  const parts: (string | ReactElement)[] = [];
  let lastIndex = 0;
  let match;
  
  while ((match = urlRegex.exec(text)) !== null) {
    // Skip if it looks like an email address (has @ before it)
    const beforeMatch = text.substring(Math.max(0, match.index - 50), match.index);
    if (beforeMatch.includes('@') && !beforeMatch.match(/@[\s\n]/)) {
      continue;
    }
    
    // Add text before the URL
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    
    // Determine the full URL - use the first non-empty capture group
    let url = match[1] || match[2] || match[3];
    let displayText = match[0];
    
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    
    // Add the clickable link
    parts.push(
      <a
        key={match.index}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 dark:text-blue-400 hover:underline break-all"
        onClick={(e) => e.stopPropagation()}
      >
        {displayText}
      </a>
    );
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }
  
  return parts.length > 0 ? parts : text;
}

interface QuoteCastModalProps {
  cast: Cast;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function QuoteCastModal({ cast, isOpen, onClose, onSuccess }: QuoteCastModalProps) {
  const [text, setText] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useNeynarContext();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
      setText("");
      setError(null);
    }

    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      window.addEventListener("keydown", handleEscape);
    }

    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }

    if (!user?.signer_uuid) {
      setError("Please sign in to quote casts");
      return;
    }

    if (!text.trim()) {
      setError("Quote text cannot be empty");
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
          embeds: [
            {
              cast_id: {
                hash: cast.hash,
                fid: cast.author.fid,
              },
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to quote cast");
      }

      // Quote interaction is tracked automatically in the cast API

      setText("");
      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to quote cast");
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

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Quote Cast
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4">
          <div className="flex gap-3">
            <img
              src={user?.pfp_url || "/default-avatar.png"}
              alt={user?.username || "You"}
              className="w-10 h-10 rounded-full"
            />
            <div className="flex-1">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Add a comment..."
                className="w-full p-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-black text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 resize-none"
                rows={4}
                maxLength={320}
              />

              {/* Quoted cast preview - indented below comment */}
              <div className="mt-3 ml-0 pl-4 border-l-2 border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-r-lg py-3">
                <div className="flex gap-3">
                  <img
                    src={cast.author.pfp_url || "/default-avatar.png"}
                    alt={cast.author.username}
                    className="w-8 h-8 rounded-full"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                        {cast.author.display_name || cast.author.username}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        @{cast.author.username}
                      </span>
                    </div>
                    <div className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words">
                      {renderTextWithLinks(cast.text)}
                    </div>
                  </div>
                </div>
              </div>

              {error && (
                <div className="mt-2 text-sm text-red-600 dark:text-red-400">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-between mt-4">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {text.length}/320
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isPosting || !text.trim()}
                    className="px-6 py-2 text-sm font-medium text-white bg-blue-600 dark:bg-blue-500 rounded-full hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isPosting ? "Quoting..." : "Quote Cast"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

