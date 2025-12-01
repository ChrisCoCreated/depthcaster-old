"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Notification } from "@neynar/nodejs-sdk/build/api";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { useNeynarContext } from "@neynar/react";
import { NotificationSettings } from "./NotificationSettings";
import { AvatarImage } from "./AvatarImage";

interface NotificationsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onNotificationsSeen?: () => void;
}

export function NotificationsPanel({ isOpen, onClose, onNotificationsSeen }: NotificationsPanelProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [expandedMuteIndex, setExpandedMuteIndex] = useState<number | null>(null);
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const [isCurator, setIsCurator] = useState<boolean | null>(null);
  const { user } = useNeynarContext();
  const isFetchingRef = useRef(false);

  const getNotificationPreferences = (): string[] => {
    const saved = localStorage.getItem("notificationPreferences");
    if (!saved) return ["follows", "recasts", "likes", "mentions", "replies", "quotes"];
    
    try {
      const prefs = JSON.parse(saved);
      return Object.entries(prefs)
        .filter(([_, enabled]) => enabled)
        .map(([key]) => {
          // Map to API format (API uses plural forms)
          if (key === "mentions") return "mentions";
          if (key === "replies") return "replies";
          if (key === "quotes") return "quotes";
          return key;
        });
    } catch (e) {
      return ["follows", "recasts", "likes", "mentions", "replies", "quotes"];
    }
  };

  const getNotificationUserScore = (notification: Notification): number | null => {
    const notif = notification as any;
    
    // For webhook notifications, check actor.score or castData.author.score
    if (notif.actor?.score !== undefined) {
      return notif.actor.score;
    }
    if (notif.castData?.author?.score !== undefined) {
      return notif.castData.author.score;
    }
    if (notif.castData?.author?.experimental?.neynar_user_score !== undefined) {
      return notif.castData.author.experimental.neynar_user_score;
    }
    
    // For Neynar notifications, check follows array
    if (notif.follows && notif.follows.length > 0) {
      const follower = notif.follows[0];
      const score = (follower as any).user?.score ?? 
                   (follower as any).score ?? 
                   (follower as any).user?.experimental?.neynar_user_score;
      if (score !== undefined) return score;
    }
    
    // For reactions (likes/recasts)
    if (notif.reactions && notif.reactions.length > 0) {
      const reaction = notif.reactions[0];
      const score = (reaction as any).user?.score ?? 
                   (reaction as any).score ?? 
                   (reaction as any).user?.experimental?.neynar_user_score;
      if (score !== undefined) return score;
    }
    
    // For replies
    if (notif.replies && notif.replies.length > 0) {
      const reply = notif.replies[0];
      const user = (reply as any).user || (reply as any).author;
      const score = user?.score ?? user?.experimental?.neynar_user_score;
      if (score !== undefined) return score;
    }
    
    // For curated cast notifications, check castData.author
    if (notif.castData?.author?.score !== undefined) {
      return notif.castData.author.score;
    }
    if (notif.castData?.author?.experimental?.neynar_user_score !== undefined) {
      return notif.castData.author.experimental.neynar_user_score;
    }
    
    // Fallback to cast author
    if (notification.cast?.author?.score !== undefined) {
      return notification.cast.author.score;
    }
    if (notification.cast?.author?.experimental?.neynar_user_score !== undefined) {
      return notification.cast.author.experimental.neynar_user_score;
    }
    
    return null;
  };

  const fetchNotifications = useCallback(async (newCursor?: string | null) => {
    if (!user?.fid) {
      setLoading(false);
      isFetchingRef.current = false;
      return;
    }

    // Prevent loading if already fetching (use ref to avoid dependency issues)
    if (isFetchingRef.current) {
      return;
    }

    try {
      isFetchingRef.current = true;
      setLoading(true);
      setError(null);

      const types = getNotificationPreferences();
      const params = new URLSearchParams({
        fid: user.fid.toString(),
        limit: "25",
      });

      if (types.length > 0) {
        params.append("types", types.join(","));
      }

      if (newCursor) {
        params.append("cursor", newCursor);
      }

      // Only add cache-busting on initial load if explicitly needed
      // Don't cache-bust on every fetch - let cache work
      if (!newCursor) {
        // Only cache-bust if we're explicitly refreshing (not initial load)
        // For now, let cache work normally
      }
      const response = await fetch(`/api/notifications?${params}`);
      if (!response.ok) {
        throw new Error("Failed to fetch notifications");
      }

      const data = await response.json();
      
      // Filter out notifications from users with score < 0.55
      const MIN_SCORE_THRESHOLD = 0.55;
      const filteredNotifications = (data.notifications || []).filter((notification: Notification) => {
        const userScore = getNotificationUserScore(notification);
        // If score is null/undefined, include the notification (don't filter out unknown scores)
        // Only filter out if score exists and is below threshold
        return userScore === null || userScore === undefined || userScore >= MIN_SCORE_THRESHOLD;
      });
      
      if (newCursor) {
        // Deduplicate when appending: check by castHash + type + timestamp
        setNotifications((prev) => {
          const existingKeys = new Set(
            prev.map((n: Notification) => {
              const notif = n as any;
              const hash = notif.castHash || n.cast?.hash || '';
              const type = String(n.type);
              const timestamp = notif.most_recent_timestamp || notif.timestamp || notif.created_at || '';
              return `${hash}:${type}:${timestamp}`;
            })
          );
          
          const newNotifications = filteredNotifications.filter((n: Notification) => {
            const notif = n as any;
            const hash = notif.castHash || n.cast?.hash || '';
            const type = String(n.type);
            const timestamp = notif.most_recent_timestamp || notif.timestamp || notif.created_at || '';
            const key = `${hash}:${type}:${timestamp}`;
            return !existingKeys.has(key);
          });
          
          return [...prev, ...newNotifications];
        });
      } else {
        setNotifications(filteredNotifications);
      }

      setCursor(data.next?.cursor || null);
      setHasMore(!!data.next?.cursor);
    } catch (err: any) {
      setError(err.message || "Failed to load notifications");
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [user?.fid]);

  const markAsSeen = useCallback(async (notificationType?: string, castHash?: string) => {
    if (!user?.signer_uuid) return;

    try {
      await fetch("/api/notifications/seen", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          signerUuid: user.signer_uuid,
          fid: user.fid, // Include FID for cache invalidation
          notificationType,
          castHash, // Include castHash for curated notifications
        }),
      });
      
      // Notify parent component to refresh unread count
      if (onNotificationsSeen) {
        onNotificationsSeen();
      }
    } catch (err) {
      console.error("Failed to mark notifications as seen", err);
    }
  }, [user?.signer_uuid, user?.fid, onNotificationsSeen]);

  useEffect(() => {
    if (isOpen && user?.fid) {
      // Check unread count first to avoid unnecessary API calls
      const checkAndMarkAsSeen = async () => {
        try {
          const countResponse = await fetch(`/api/notifications/count?fid=${user.fid}`);
          if (countResponse.ok) {
            const countData = await countResponse.json();
            const unreadCount = countData.unreadCount || 0;
            
            // Only mark as seen if there are unread notifications
            if (unreadCount > 0) {
              await markAsSeen();
            }
          }
        } catch (err) {
          console.error("Failed to check unread count", err);
          // If count check fails, still try to mark as seen (fallback)
          await markAsSeen();
        }
        
        // Fetch notifications regardless
        fetchNotifications();
      };
      
      checkAndMarkAsSeen();
    } else {
      // Reset fetching state when panel closes
      isFetchingRef.current = false;
      setLoading(false);
    }
  }, [isOpen, user?.fid, fetchNotifications, markAsSeen]);

  // Check if user has curator role
  useEffect(() => {
    const checkCuratorStatus = async () => {
      if (!user?.fid) {
        setIsCurator(false);
        return;
      }

      try {
        const response = await fetch(`/api/admin/check?fid=${user.fid}`);
        if (response.ok) {
          const data = await response.json();
          // Check if user has curator role (admin/superadmin don't automatically confer curator)
          const roles = data.roles || [];
          setIsCurator(roles.includes("curator"));
        } else {
          setIsCurator(false);
        }
      } catch (error) {
        console.error("Failed to check curator status:", error);
        setIsCurator(false);
      }
    };

    if (isOpen && user?.fid) {
      checkCuratorStatus();
    }
  }, [isOpen, user?.fid]);

  const getNotificationPfpUrl = (notification: Notification): string | null => {
    const notif = notification as any;
    const type = String(notification.type).toLowerCase().trim();
    const castDataType = notif.castData?.type?.toLowerCase()?.trim();
    
    // App update notifications use the app logo (check first, before any other logic)
    // Check both notification.type and castData.type for app.update
    if (type === "app.update" || castDataType === "app.update") {
      return "/icon-192x192.webp";
    }
    
    // For webhook notifications, check actor.pfp_url first (but skip for app.update)
    if (notif.actor?.pfp_url) {
      return notif.actor.pfp_url;
    }
    
    // For Neynar notifications, check follows array
    if (notif.follows && notif.follows.length > 0) {
      const follower = notif.follows[0];
      const pfp = (follower as any).user?.pfp_url || (follower as any).pfp_url;
      if (pfp) return pfp;
    }
    
    // For reactions (likes/recasts)
    if (notif.reactions && notif.reactions.length > 0) {
      const reaction = notif.reactions[0];
      const pfp = (reaction as any).user?.pfp_url || (reaction as any).pfp_url;
      if (pfp) return pfp;
    }
    
    // For replies
    if (notif.replies && notif.replies.length > 0) {
      const reply = notif.replies[0];
      const user = (reply as any).user || (reply as any).author;
      const pfp = user?.pfp_url;
      if (pfp) return pfp;
    }
    
    // For curated cast notifications, check castData.author
    if (notif.castData?.author?.pfp_url) {
      return notif.castData.author.pfp_url;
    }
    
    // Fallback to cast author
    if (notification.cast?.author?.pfp_url) {
      return notification.cast.author.pfp_url;
    }
    
    return null;
  };


  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "follows":
        return "👥";
      case "recasts":
        return "🔄";
      case "likes":
        return "❤️";
      case "mention":
      case "mentions":
        return "@";
      case "reply":
      case "replies":
        return "💬";
      case "quote":
      case "quotes":
        return "💭";
      case "cast.created":
        return "👀";
      case "curated.quality_reply":
        return "⭐";
      case "curated.curated":
        return "✨";
      case "curated.liked":
        return "❤️";
      case "curated.recast":
        return "🔄";
      case "app.update":
        return "📢";
      default:
        return "🔔";
    }
  };

  const getNotificationLink = (notification: Notification): string | null => {
    const notif = notification as any;

    const type = String(notification.type);

    // App update notifications use URL from castData
    if (type === "app.update") {
      const url = notif.castData?.url || notif.cast?.data?.url;
      if (url) {
        // If URL is relative, return as-is; if absolute, return full URL
        return url.startsWith("http") ? url : url;
      }
      return "/updates";
    }

    // Curated notifications should prefer conversation view when possible
    if (type === "curated.quality_reply") {
      const replyHash: string | undefined =
        notif.castHash || notification.cast?.hash;

      // Try to infer curated/root cast hash from parent_hash or stored metadata
      const curatedHash: string | undefined =
        notification.cast?.parent_hash ||
        notif.castData?._rootCastHash ||
        notif.castData?._curatedCastHash;

      if (curatedHash && replyHash) {
        return `/conversation/${curatedHash}?replyHash=${replyHash}`;
      }

      // Fallback: open reply in conversation view directly
      if (replyHash) {
        return `/conversation/${replyHash}`;
      }
    }

    if (
      type === "curated.curated" ||
      type === "curated.liked" ||
      type === "curated.recast"
    ) {
      // For these types, castHash should be the curated/root cast hash
      const curatedHash: string | undefined =
        notif.castHash || notification.cast?.hash;
      if (curatedHash) {
        return `/conversation/${curatedHash}`;
      }
    }

    // Default behavior – fall back to cast/profile routes
    if (notif.castHash) {
      return `/cast/${notif.castHash}`;
    }

    if (notification.cast?.hash) {
      return `/cast/${notification.cast.hash}`;
    }
    if (notification.follows && notification.follows.length > 0) {
      const follower = notification.follows[0];
      const fid = (follower as any).fid || (follower as any).user?.fid;
      if (fid) return `/profile/${fid}`;
    }
    return null;
  };

  const isNeynarNotification = (notification: Notification): boolean => {
    const type = String(notification.type).toLowerCase();
    // Handle both singular and plural forms, and enum values
    const neynarTypes = ["follows", "recasts", "likes", "mentions", "replies", "quotes", "follow", "recast", "like", "mention", "reply", "quote"];
    return neynarTypes.includes(type);
  };

  const getNotificationActorFid = (notification: Notification): number | null => {
    const notif = notification as any;
    const type = String(notification.type).toLowerCase();

    // Match the exact pattern from getNotificationText for consistency
    
    // For follows
    if (notif.follows && notif.follows.length > 0) {
      const follower = notif.follows[0];
      return (follower as any).fid || (follower as any).user?.fid || null;
    }

    // For reactions (likes/recasts) - check reactions array
    if (notif.reactions && notif.reactions.length > 0) {
      const reaction = notif.reactions[0];
      const user = (reaction as any).user;
      if (user?.fid) return user.fid;
    }

    // For replies - check replies array (matches getNotificationText pattern)
    if (notif.replies && notif.replies.length > 0) {
      const reply = notif.replies[0];
      const user = (reply as any).user || (reply as any).author;
      if (user?.fid) return user.fid;
    }

    // For mentions/quotes - use cast author (matches getNotificationText pattern)
    // This is the fallback in getNotificationText for replies/quotes/mentions
    if (notification.cast?.author?.fid) {
      return notification.cast.author.fid;
    }

    // Additional fallback: check if cast exists at all
    if (notif.cast?.author?.fid) {
      return notif.cast.author.fid;
    }

    return null;
  };

  const handleMuteUser = async (targetFid: number) => {
    if (!user?.signer_uuid) {
      alert("Please sign in to mute users");
      return;
    }

    try {
      const response = await fetch("/api/user/mute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          signerUuid: user.signer_uuid,
          targetFid,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to mute user");
      }

      // Close the expanded menu
      setExpandedMuteIndex(null);
      
      // Optionally refresh notifications to remove muted user's notifications
      // For now, just show success feedback
      alert("User muted successfully");
    } catch (error: any) {
      console.error("Mute error:", error);
      alert(error.message || "Failed to mute user");
    }
  };

  const getNotificationText = (notification: Notification): string => {
    const count = notification.count || 1;
    const type = String(notification.type).toLowerCase();
    const notif = notification as any;
    
    // App update notifications use title and body from castData
    if (type === "app.update") {
      const title = notif.castData?.title || notif.cast?.data?.title || "App Update";
      return title;
    }
    
    // Get users based on notification type
    let users: any[] = [];
    if (notif.follows) {
      users = notif.follows;
    } else if (notif.reactions) {
      users = notif.reactions.map((r: any) => r.user);
    } else if (notif.replies) {
      users = notif.replies.map((r: any) => r.user || r.author);
    } else if (notification.cast?.author) {
      // Fallback to cast author for replies/quotes/mentions
      users = [notification.cast.author];
    } else if (notif.actor) {
      // For webhook notifications (cast.created), use actor field
      users = [notif.actor];
    } else if (notif.castData?.author) {
      // For curated cast notifications, use castData.author
      users = [notif.castData.author];
    }
    
    const firstUser = users[0];
    const firstName = (firstUser as any)?.username || 
                     (firstUser as any)?.user?.username || 
                     (firstUser as any)?.display_name ||
                     (firstUser as any)?.displayName ||
                     "Someone";

    switch (type) {
      case "follows":
        if (count === 1) return `${firstName} followed you`;
        return `${firstName} and ${count - 1} others followed you`;
      case "recasts":
        if (count === 1) return `${firstName} recast your cast`;
        return `${firstName} and ${count - 1} others recast your cast`;
      case "likes":
        if (count === 1) return `${firstName} liked your cast`;
        return `${firstName} and ${count - 1} others liked your cast`;
      case "mention":
      case "mentions":
        return `${firstName} mentioned you`;
      case "reply":
      case "replies":
        if (count === 1) return `${firstName} replied to your cast`;
        return `${firstName} and ${count - 1} others replied to your cast`;
      case "quote":
      case "quotes":
        if (count === 1) return `${firstName} quoted your cast`;
        return `${firstName} and ${count - 1} others quoted your cast`;
      case "cast.created":
        return `${firstName} posted a new cast`;
      case "curated.quality_reply":
        return `${firstName} posted a quality reply to your curated cast`;
      case "curated.curated":
        return `${firstName} also curated this cast`;
      case "curated.liked":
        return `${firstName} liked your curated cast`;
      case "curated.recast":
        return `${firstName} recast your curated cast`;
      default:
        return "New notification";
    }
  };

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close expanded mute menu when clicking outside
  useEffect(() => {
    if (expandedMuteIndex === null) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.mute-menu-container')) {
        setExpandedMuteIndex(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [expandedMuteIndex]);

  if (!isOpen || !mounted) return null;

  const content = (
    <div className="fixed inset-0 z-[250]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-md"
        style={{ WebkitBackdropFilter: 'blur(12px)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div 
        className="absolute inset-y-0 right-0 bg-white dark:bg-gray-900 w-full max-w-md h-full shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Notifications
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Notification Settings Accordion */}
          <div className="border-b border-gray-200 dark:border-gray-800">
            <button
              onClick={() => setSettingsExpanded(!settingsExpanded)}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
            >
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Notification Settings
              </span>
              <svg
                className={`w-5 h-5 text-gray-500 dark:text-gray-400 transition-transform ${
                  settingsExpanded ? "rotate-180" : ""
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
            {settingsExpanded && (
              <div className="border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                <NotificationSettings />
              </div>
            )}
          </div>

          {/* Informational note for non-curator users */}
          {isCurator === false && (
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800">
              <div className="flex items-start gap-2">
                <svg
                  className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <div className="flex-1">
                  <p className="text-sm text-blue-900 dark:text-blue-100 font-medium">
                    Curated Notifications
                  </p>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                    You won't see curated notifications (notifications about casts you've curated) since you don't have a curator role. You will still see regular notifications (follows, likes, recasts, mentions, replies, quotes) if you have a plus role.
                  </p>
                </div>
              </div>
            </div>
          )}

          {loading && notifications.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              Loading notifications...
            </div>
          ) : error ? (
            <div className="p-4 text-red-600 dark:text-red-400">
              Error: {error}
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              No notifications yet
            </div>
          ) : (
            <div>
              {notifications.map((notification, index) => {
                const link = getNotificationLink(notification);
                const isNeynar = isNeynarNotification(notification);
                const actorFid = isNeynar ? getNotificationActorFid(notification) : null;
                const isMuteExpanded = expandedMuteIndex === index;

                // Debug logging (can be removed later)
                if (isNeynar && !actorFid) {
                  console.log("Neynar notification without actor FID:", {
                    type: notification.type,
                    notification: notification,
                  });
                }

                const content = (
                  <div
                    className={`p-4 border-b border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors relative ${
                      !notification.seen ? "bg-blue-50 dark:bg-blue-900/20" : ""
                    }`}
                  >
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 relative w-10 h-10">
                        <AvatarImage
                          src={getNotificationPfpUrl(notification)}
                          alt={String(notification.type).toLowerCase().trim() === "app.update" || (notification as any).castData?.type?.toLowerCase()?.trim() === "app.update" ? "App logo" : "User avatar"}
                          size={40}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                        <div className="absolute bg-white dark:bg-gray-800 rounded-full p-0.5 border border-gray-300 dark:border-gray-600 flex items-center justify-center" style={{ bottom: '0%', right: '0%', width: '40%', height: '40%', minWidth: '16px', minHeight: '16px', transform: 'translate(25%, 25%)' }}>
                          <span className="text-[10px] leading-none">
                            {getNotificationIcon(String(notification.type))}
                          </span>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-900 dark:text-gray-100">
                          {getNotificationText(notification)}
                        </div>
                        {(() => {
                          const notif = notification as any;
                          const type = String(notification.type);
                          
                          // For app.update, show body from castData
                          if (type === "app.update") {
                            const body = notif.castData?.body || notif.cast?.data?.body;
                            if (body) {
                              return (
                                <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                                  {body}
                                </div>
                              );
                            }
                            return null;
                          }
                          
                          // For other notifications, show cast text
                          if (notification.cast) {
                            return (
                              <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                                {notification.cast.text}
                              </div>
                            );
                          }
                          return null;
                        })()}
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-500">
                          {formatDistanceToNow(
                            new Date((notification as any).most_recent_timestamp || (notification as any).timestamp || (notification as any).created_at || Date.now()),
                            { addSuffix: true }
                          )}
                        </div>
                      </div>
                      {isNeynar && actorFid && (
                        <div className="relative mute-menu-container">
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setExpandedMuteIndex(isMuteExpanded ? null : index);
                            }}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                            title="Mute options"
                          >
                            <svg
                              className="w-5 h-5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                              />
                            </svg>
                          </button>
                          {isMuteExpanded && (
                            <div className="absolute right-0 top-8 z-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg min-w-[200px]">
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleMuteUser(actorFid);
                                }}
                                className="w-full text-left px-4 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                              >
                                Mute user everywhere on Farcaster
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );

                return link ? (
                  <Link
                    key={index}
                    href={link}
                    onClick={async (e) => {
                      const notif = notification as any;
                      const type = String(notification.type);
                      // For curated notifications and webhook notifications (cast.created), pass castHash to mark as read in database
                      const castHash = 
                        (type.startsWith("curated.") && (notif.castHash || notification.cast?.hash)) ||
                        (type === "cast.created" && (notif.castHash || notification.cast?.hash)) ||
                        undefined;
                      await markAsSeen(type, castHash);
                      onClose();
                    }}
                  >
                    {content}
                  </Link>
                ) : (
                  <div key={index}>{content}</div>
                );
              })}

              {/* Load more */}
              {hasMore && (
                <div className="p-4 text-center">
                  <button
                    onClick={() => fetchNotifications(cursor)}
                    disabled={loading}
                    className="px-4 py-2 text-sm text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                  >
                    {loading ? "Loading..." : "Load More"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

