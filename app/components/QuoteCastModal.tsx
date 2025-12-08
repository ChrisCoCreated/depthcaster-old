"use client";

import { useState, useEffect, useMemo, type ReactElement } from "react";
import { Cast } from "@neynar/nodejs-sdk/build/api";
import { useNeynarContext } from "@neynar/react";
import { convertBaseAppLinksInline, isFarcasterLink, extractCastHashFromUrl } from "@/lib/link-converter";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AvatarImage } from "./AvatarImage";
import { analytics } from "@/lib/analytics";
import {
  PRO_CAST_BYTE_LIMIT,
  ProSubscriptionLike,
  getMaxCastBytes,
  getUtf8ByteLength,
  hasActiveProSubscription,
} from "@/lib/castLimits";

// Helper function to convert URLs in text to clickable links
function renderTextWithLinks(text: string, router: ReturnType<typeof useRouter>) {
  // First, convert base.app links inline
  const textWithConvertedBaseLinks = convertBaseAppLinksInline(text);
  
  // Mention regex pattern - matches @{username} format
  const mentionRegex = /@\{([a-zA-Z0-9_-]+)\}/g;
  
  // URL regex pattern - matches http(s):// URLs, www. URLs, domain-like patterns, and /cast/ paths
  const urlRegex = /(https?:\/\/[^\s<>"']+)|(www\.[^\s<>"']+)|(\/cast\/0x[a-fA-F0-9]{8,})|([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.(?:[a-zA-Z]{2,})(?:\/[^\s<>"']*)?)/g;
  
  const parts: (string | ReactElement)[] = [];
  let lastIndex = 0;
  
  // First, process mentions
  const mentionMatches: Array<{ index: number; length: number; username: string }> = [];
  let mentionMatch;
  while ((mentionMatch = mentionRegex.exec(textWithConvertedBaseLinks)) !== null) {
    mentionMatches.push({
      index: mentionMatch.index,
      length: mentionMatch[0].length,
      username: mentionMatch[1],
    });
  }
  
  // Then process URLs
  const urlMatches: Array<{ index: number; length: number; url: string; displayText: string }> = [];
  let urlMatch;
  while ((urlMatch = urlRegex.exec(textWithConvertedBaseLinks)) !== null) {
    // Skip if it looks like an email address (has @ before it) or if it overlaps with a mention
    const beforeMatch = textWithConvertedBaseLinks.substring(Math.max(0, urlMatch.index - 50), urlMatch.index);
    if (beforeMatch.includes('@') && !beforeMatch.match(/@[\s\n]/)) {
      continue;
    }
    
    // Check if this URL overlaps with any mention
    const overlapsMention = mentionMatches.some(m => {
      const mentionEnd = m.index + m.length;
      const urlEnd = urlMatch.index + urlMatch[0].length;
      return (urlMatch.index >= m.index && urlMatch.index < mentionEnd) ||
             (m.index >= urlMatch.index && m.index < urlEnd);
    });
    
    if (overlapsMention) {
      continue;
    }
    
    let url = urlMatch[1] || urlMatch[2] || urlMatch[3] || urlMatch[4];
    urlMatches.push({
      index: urlMatch.index,
      length: urlMatch[0].length,
      url: url,
      displayText: urlMatch[0],
    });
  }
  
  // Merge and sort all matches by index
  const allMatches = [
    ...mentionMatches.map(m => ({ ...m, type: 'mention' as const })),
    ...urlMatches.map(m => ({ ...m, type: 'url' as const })),
  ].sort((a, b) => a.index - b.index);
  
  // Process all matches in order
  for (const match of allMatches) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(textWithConvertedBaseLinks.substring(lastIndex, match.index));
    }
    
    if (match.type === 'mention') {
      const mentionMatch = match as typeof match & { username: string };
      const username = mentionMatch.username;
      const displayText = `@{${username}}`;
      
      parts.push(
        <Link
          key={match.index}
          href={`/profile/${encodeURIComponent(username)}`}
          className="text-blue-600 dark:text-blue-400 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {displayText}
        </Link>
      );
    } else {
      const urlMatch = match as typeof match & { url: string; displayText: string };
      let url = urlMatch.url;
      let displayText = urlMatch.displayText;
    
    // Check if it's a Depthcaster link (already converted base.app link)
    if (url && url.startsWith('/cast/')) {
      parts.push(
        <Link
          key={match.index}
          href={url}
          className="text-blue-600 dark:text-blue-400 hover:underline break-all"
          onClick={(e) => e.stopPropagation()}
        >
          {displayText}
        </Link>
      );
    }
    // Handle external URLs
    else {
      // Ensure URL is absolute for external links
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      
      // Check if it's a Farcaster link (farcaster.xyz, warpcast.com) - convert on click
      if (isFarcasterLink(url)) {
        const hash = extractCastHashFromUrl(url);
        // Full cast hash is 0x + 64 hex chars = 66 chars total
        if (hash && hash.length === 66) {
          // Full hash found - convert directly
          parts.push(
            <a
              key={match.index}
              href={`/cast/${hash}`}
              className="text-blue-600 dark:text-blue-400 hover:underline break-all"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                router.push(`/cast/${hash}`);
              }}
            >
              {displayText}
            </a>
          );
        } else {
          // Hash not found or truncated - resolve via API on click
          parts.push(
            <a
              key={match.index}
              href={url}
              className="text-blue-600 dark:text-blue-400 hover:underline break-all"
              onClick={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                try {
                  // Resolve the URL to get the cast hash
                  const response = await fetch(`/api/conversation?identifier=${encodeURIComponent(url)}&type=url&replyDepth=0`);
                  if (response.ok) {
                    const data = await response.json();
                    const castHash = data?.conversation?.cast?.hash;
                    if (castHash) {
                      router.push(`/cast/${castHash}`);
                    } else {
                      // Fallback to external link
                      window.open(url, '_blank');
                    }
                  } else {
                    // Fallback to external link on error
                    window.open(url, '_blank');
                  }
                } catch (error) {
                  console.error('Failed to resolve Farcaster link:', error);
                  // Fallback to external link
                  window.open(url, '_blank');
                }
              }}
            >
              {displayText}
            </a>
          );
        }
      }
      // Regular external link
      else {
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
      }
    }
    
    lastIndex = match.index + match.length;
  }
  
  // Add remaining text
  if (lastIndex < textWithConvertedBaseLinks.length) {
    parts.push(textWithConvertedBaseLinks.substring(lastIndex));
  }
  
  return parts.length > 0 ? parts : textWithConvertedBaseLinks;
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
  const router = useRouter();
  const userWithPro = user as (typeof user) & ProSubscriptionLike;
  const isProUser = hasActiveProSubscription(userWithPro);
  const maxBytes = getMaxCastBytes(isProUser);
  const byteLength = useMemo(() => getUtf8ByteLength(text), [text]);
  const isOverLimit = byteLength > maxBytes;
  const proLimitLabel = PRO_CAST_BYTE_LIMIT.toLocaleString();
  const lengthWarning = isOverLimit
    ? `Cast exceeds the ${maxBytes} byte limit${isProUser ? "" : `. Upgrade to Pro for up to ${proLimitLabel} bytes.`}`
    : null;

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

    if (isOverLimit) {
      setError(
        `Cast exceeds the ${maxBytes} byte limit${isProUser ? "" : ". Upgrade to Pro for longer casts."}`
      );
      return;
    }

    if (isPosting) {
      return; // Prevent double submission
    }

    try {
      setIsPosting(true);
      setError(null);

      // Validate cast hash and FID
      if (!cast.hash || !cast.author?.fid) {
        setError("Invalid cast data. Please try again.");
        return;
      }

      // Verbose log the cast data being quoted
      console.log("[QuoteCastModal] Cast data being quoted:", {
        hash: cast.hash,
        hashLength: cast.hash?.length,
        hashFormat: cast.hash?.startsWith('0x') ? 'with 0x prefix' : 'without 0x prefix',
        author: {
          fid: cast.author.fid,
          username: cast.author.username,
          displayName: cast.author.display_name,
        },
        text: cast.text?.substring(0, 100),
        textLength: cast.text?.length,
        timestamp: cast.timestamp,
        embeds: cast.embeds,
        parentHash: cast.parent_hash,
        fullCast: JSON.stringify(cast, null, 2),
      });

      const requestBody = {
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
      };

      // Verbose log the request being sent
      console.log("[QuoteCastModal] Sending quote cast request:", {
        url: "/api/cast",
        method: "POST",
        body: JSON.stringify(requestBody, null, 2),
        embedHash: cast.hash,
        embedHashLength: cast.hash?.length,
        embedFid: cast.author.fid,
      });

      const response = await fetch("/api/cast", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to quote cast");
      }

      const data = await response.json();
      const castHash = data.cast?.hash || data.hash;

      // Track analytics
      if (castHash) {
        analytics.trackCastQuotePost(castHash, cast.hash);
      }

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

  const handleTextChange = (value: string) => {
    setText(value);
    if (error) {
      setError(null);
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
            <AvatarImage
              src={user?.pfp_url}
              alt={user?.username || "You"}
              size={40}
              className="w-10 h-10 rounded-full"
            />
            <div className="flex-1">
              <textarea
                value={text}
                onChange={(e) => handleTextChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Add a comment..."
                className="w-full p-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-black text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 resize-none"
                rows={4}
              />

              {/* Quoted cast preview - indented below comment */}
              <div className="mt-3 ml-0 pl-4 border-l-2 border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-r-lg py-3">
                <div className="flex gap-3">
                  <AvatarImage
                    src={cast.author.pfp_url}
                    alt={cast.author.username}
                    size={32}
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
                      {renderTextWithLinks(cast.text, router)}
                    </div>
                  </div>
                </div>
              </div>

              {lengthWarning && (
                <div className="mt-2 text-sm text-red-600 dark:text-red-400">
                  {lengthWarning}
                </div>
              )}

              {error && (
                <div className="mt-2 text-sm text-red-600 dark:text-red-400">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-between mt-4">
                <span className={`text-xs ${isOverLimit ? "text-red-600 dark:text-red-400" : "text-gray-500 dark:text-gray-400"}`}>
                  {byteLength}/{maxBytes}
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
                    disabled={isPosting || !text.trim() || isOverLimit}
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

