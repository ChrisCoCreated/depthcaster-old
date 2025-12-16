"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useNeynarContext } from "@neynar/react";
import { AvatarImage } from "./AvatarImage";
import { analytics } from "@/lib/analytics";
import {
  PRO_CAST_BYTE_LIMIT,
  ProSubscriptionLike,
  getMaxCastBytes,
  getUtf8ByteLength,
  hasActiveProSubscription,
} from "@/lib/castLimits";
import { isSuperAdmin } from "@/lib/roles-client";

interface CastComposerProps {
  parentHash?: string;
  onSuccess?: (newCast?: any) => void;
}

export function CastComposer({ parentHash, onSuccess }: CastComposerProps) {
  const [text, setText] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isSuperAdminUser, setIsSuperAdminUser] = useState(false);
  const [useThinkingParent, setUseThinkingParent] = useState(false);
  const { user } = useNeynarContext();

  const userWithPro = user as (typeof user) & ProSubscriptionLike;
  const isProUser = hasActiveProSubscription(userWithPro);
  const maxBytes = getMaxCastBytes(isProUser);
  const byteLength = useMemo(() => getUtf8ByteLength(text), [text]);
  const isHomeComposer = !parentHash;
  const isOverLimit = byteLength > maxBytes;
  const draftStorageKey = useMemo(() => {
    if (!user?.fid) return null;
    return parentHash
      ? `dc_cast_draft_${user.fid}_reply_${parentHash}`
      : `dc_cast_draft_${user.fid}_root`;
  }, [user?.fid, parentHash]);
  const hasLoadedDraftRef = useRef(false);

  // Check if user is superadmin
  useEffect(() => {
    const checkSuperAdmin = async () => {
      if (!user?.fid) {
        setIsSuperAdminUser(false);
        return;
      }

      try {
        const response = await fetch(`/api/admin/check?fid=${user.fid}`);
        if (response.ok) {
          const data = await response.json();
          const roles = data.roles || [];
          setIsSuperAdminUser(isSuperAdmin(roles));
        } else {
          setIsSuperAdminUser(false);
        }
      } catch (error) {
        console.error("Failed to check superadmin status:", error);
        setIsSuperAdminUser(false);
      }
    };

    checkSuperAdmin();
  }, [user?.fid]);

  useEffect(() => {
    if (!draftStorageKey || typeof window === "undefined") {
      hasLoadedDraftRef.current = false;
      return;
    }

    try {
      const savedDraft = window.localStorage.getItem(draftStorageKey);
      if (savedDraft) {
        setText(savedDraft);
        if (isHomeComposer) {
          setIsFocused(true);
        }
      } else if (isHomeComposer) {
        setText("");
        setIsFocused(false);
      } else {
        setText("");
      }
    } catch (error) {
      console.error("Failed to load cast draft:", error);
    } finally {
      hasLoadedDraftRef.current = true;
    }
  }, [draftStorageKey, isHomeComposer]);

  useEffect(() => {
    if (!draftStorageKey || typeof window === "undefined" || !hasLoadedDraftRef.current) {
      return;
    }

    try {
      if (text) {
        window.localStorage.setItem(draftStorageKey, text);
      } else {
        window.localStorage.removeItem(draftStorageKey);
      }
    } catch (error) {
      console.error("Failed to save cast draft:", error);
    }
  }, [draftStorageKey, text]);

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

      // Determine parent: use thinking URL if superadmin enabled it, otherwise use parentHash
      const finalParent = useThinkingParent && isSuperAdminUser && !parentHash
        ? "https://www.sopha.social/thinking"
        : parentHash;

      const response = await fetch("/api/cast", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          signerUuid: user.signer_uuid,
          text: text.trim(),
          parent: finalParent,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to post cast");
      }

      const data = await response.json();
      const castHash = data.cast?.hash || data.hash;
      const newCast = data.cast || data;

      // Track analytics
      if (castHash) {
        if (parentHash) {
          analytics.trackCastReplyPost(castHash, parentHash);
        } else {
          analytics.trackCastPost(castHash);
        }
      }

      setText("");
      if (draftStorageKey && typeof window !== "undefined") {
        window.localStorage.removeItem(draftStorageKey);
      }
      if (isHomeComposer) {
        setIsFocused(false);
      }
      if (onSuccess) {
        onSuccess(newCast);
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

  const handleTextChange = (value: string) => {
    setText(value);
    if (error) {
      setError(null);
    }
  };

  const handleFocus = () => {
    if (!isFocused) {
      setIsFocused(true);
    }
  };

  const handleBlur = () => {
    if (!text.trim()) {
      setIsFocused(false);
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

  const textareaRows = parentHash ? 3 : isHomeComposer && !isFocused ? 1 : 4;
  const homeCollapsedHeight = "2.75rem";
  const homeExpandedStandardHeight = "10rem";
  const homeExpandedProHeight = "calc(100vh - 240px)";
  const textareaStyle = isHomeComposer
    ? {
        minHeight: isFocused
          ? isProUser
            ? homeExpandedProHeight
            : homeExpandedStandardHeight
          : homeCollapsedHeight,
      }
    : undefined;

  const proLimitLabel = PRO_CAST_BYTE_LIMIT.toLocaleString();
  const lengthWarning = isOverLimit
    ? `Cast exceeds the ${maxBytes} byte limit${isProUser ? "" : `. Upgrade to Pro for up to ${proLimitLabel} bytes.`}`
    : null;
  const showControls = isFocused || Boolean(text.trim()) || isPosting;

  return (
    <form onSubmit={handleSubmit} className={`${parentHash ? '' : 'border-b border-gray-200 dark:border-gray-800'} p-2 sm:p-4`}>
      <div className="flex gap-2 sm:gap-3">
        {/* Avatar */}
        <AvatarImage
          src={user.pfp_url}
          alt={user.username}
          size={48}
          className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex-shrink-0"
        />

        {/* Input area */}
        <div className="flex-1 min-w-0">
          <textarea
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={parentHash ? "Write a reply..." : "What's on your mind?"}
            className={`w-full p-2 sm:p-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-black text-sm sm:text-base text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 resize-none transition-all duration-200 ${
              isHomeComposer ? "min-h-[2.75rem]" : ""
            } ${isHomeComposer && isFocused ? "shadow-lg" : ""}`}
            rows={textareaRows}
            style={textareaStyle}
          />

          {lengthWarning && (
            <div className="mt-2 text-xs sm:text-sm text-red-600 dark:text-red-400">
              {lengthWarning}
            </div>
          )}

          {error && (
            <div className="mt-2 text-xs sm:text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {showControls && (
            <div className="flex flex-col gap-2 mt-2">
              {isSuperAdminUser && !parentHash && (
                <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useThinkingParent}
                    onChange={(e) => setUseThinkingParent(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 dark:border-gray-700 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Cast as reply to /thinking</span>
                </label>
              )}
              <div className="flex items-center justify-between">
                <span className={`text-xs ${isOverLimit ? "text-red-600 dark:text-red-400" : "text-gray-500 dark:text-gray-400"}`}>
                  {byteLength}/{maxBytes}
                </span>
                <button
                  type="submit"
                  disabled={isPosting || !text.trim() || isOverLimit}
                  className="px-4 sm:px-6 py-1.5 sm:py-2 bg-blue-600 dark:bg-blue-500 text-white text-sm sm:text-base rounded-full font-medium hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isPosting ? "Posting..." : parentHash || useThinkingParent ? "Reply" : "Cast"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </form>
  );
}

