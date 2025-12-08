"use client";

import { ConversationView } from "../../components/ConversationView";
import { CastComposer } from "../../components/CastComposer";
import { OpenInAppBanner } from "../../components/OpenInAppBanner";
import { useNeynarContext } from "@neynar/react";
import { use, useEffect, useRef, useCallback, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export default function ConversationPage({
  params,
}: {
  params: Promise<{ hash: string }>;
}) {
  const { hash } = use(params);
  const { user } = useNeynarContext();
  const searchParams = useSearchParams();
  const router = useRouter();
  const composerRef = useRef<HTMLDivElement>(null);
  const shouldAutoFocus = searchParams.get("reply") === "true";
  const searchParamsFocusReplyHash = searchParams.get("replyHash") || undefined;
  
  // State for checking if hash is a reply
  const [isCheckingReply, setIsCheckingReply] = useState(true);
  const [actualCastHash, setActualCastHash] = useState<string>(hash);
  const [focusReplyHash, setFocusReplyHash] = useState<string | undefined>(searchParamsFocusReplyHash);
  const [isCheckingConversation, setIsCheckingConversation] = useState(false);
  const [conversationExists, setConversationExists] = useState<boolean | null>(null);

  // Check if the hash is a reply in a curated thread
  useEffect(() => {
    const checkIfReply = async () => {
      try {
        const response = await fetch(`/api/conversation/check-reply?hash=${encodeURIComponent(hash)}`);
        if (!response.ok) {
          // If check fails, use hash as-is
          setActualCastHash(hash);
          setIsCheckingReply(false);
          return;
        }

        const data = await response.json();
        if (data.isReply && data.rootCastHash) {
          // It's a reply - use root cast hash and focus on the original reply
          setActualCastHash(data.rootCastHash);
          setFocusReplyHash(data.originalHash);
        } else {
          // Not a reply, use hash as-is
          setActualCastHash(hash);
        }
      } catch (error) {
        console.error("Error checking if hash is reply:", error);
        // On error, use hash as-is
        setActualCastHash(hash);
      } finally {
        setIsCheckingReply(false);
      }
    };

    checkIfReply();
  }, [hash]);

  // Check if conversation exists and redirect if it doesn't
  useEffect(() => {
    if (isCheckingReply || !actualCastHash) return;

    const checkConversation = async () => {
      setIsCheckingConversation(true);
      try {
        const response = await fetch(`/api/conversation/database?castHash=${encodeURIComponent(actualCastHash)}`);
        if (!response.ok) {
          // Any failure (404, network error, etc.) - redirect to cast view
          router.replace(`/cast/${actualCastHash}`);
          return;
        }
        // Conversation exists
        setConversationExists(true);
      } catch (error) {
        // Any error - redirect to cast view
        router.replace(`/cast/${actualCastHash}`);
      } finally {
        setIsCheckingConversation(false);
      }
    };

    checkConversation();
  }, [actualCastHash, isCheckingReply, router]);

  const focusReplyBox = useCallback(() => {
    if (composerRef.current && user) {
      // Scroll to composer and focus the textarea
      setTimeout(() => {
        composerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        const textarea = composerRef.current?.querySelector("textarea");
        if (textarea) {
          textarea.focus();
        }
      }, 300); // Small delay to ensure component is rendered
    }
  }, [user]);

  useEffect(() => {
    if (shouldAutoFocus) {
      focusReplyBox();
    }
  }, [shouldAutoFocus, focusReplyBox]);

  // Show loading state while checking if hash is a reply or if conversation exists
  if (isCheckingReply || isCheckingConversation) {
    return (
      <div className="min-h-screen">
        <main className="max-w-7xl mx-auto px-4 py-8">
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            Loading conversation...
          </div>
        </main>
      </div>
    );
  }

  // Only render ConversationView if conversation exists
  // (If it doesn't exist, we'll have redirected by now)
  if (conversationExists) {
    return (
      <div className="min-h-screen">
        <OpenInAppBanner />
        <main className="max-w-7xl mx-auto px-4 py-8">
          <ConversationView castHash={actualCastHash} viewerFid={user?.fid} focusReplyHash={focusReplyHash} onFocusReply={focusReplyBox} />
          
          {user && (
            <div ref={composerRef} className="mt-8">
              <CastComposer parentHash={actualCastHash} />
            </div>
          )}
        </main>
      </div>
    );
  }

  // Fallback: show loading while redirect happens
  return (
    <div className="min-h-screen">
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
          Redirecting...
        </div>
      </main>
    </div>
  );
}

