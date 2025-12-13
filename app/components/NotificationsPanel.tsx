"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Notification } from "@neynar/nodejs-sdk/build/api";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { useNeynarContext } from "@neynar/react";
import { NotificationSettings } from "./NotificationSettings";
import { AvatarImage } from "./AvatarImage";
import { hasPlusRole } from "@/lib/roles-client";

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
  const [hasPlus, setHasPlus] = useState<boolean | null>(null);
  const [debugMessage, setDebugMessage] = useState<string | null>(null);
  const [isForceFetching, setIsForceFetching] = useState(false);
  const { user } = useNeynarContext();
  const isFetchingRef = useRef(false);
  const hasInitialFetchRef = useRef(false);
  const fetchNotificationsRef = useRef<((newCursor?: string | null) => Promise<void>) | null>(null);
  const markAsSeenRef = useRef<((notificationType?: string, castHash?: string) => Promise<void>) | null>(null);
  const onNotificationsSeenRef = useRef(onNotificationsSeen);
  const canRenderPortalRef = useRef(false);

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
    
    // For curated cast notifications, check actor first (person who performed action)
    if (notif.actor?.score !== undefined) {
      return notif.actor.score;
    }
    if (notif.actor?.experimental?.neynar_user_score !== undefined) {
      return notif.actor.experimental.neynar_user_score;
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

      const newCursorValue = data.next?.cursor || null;
      const newHasMore = !!data.next?.cursor;
      setCursor(newCursorValue);
      setHasMore(newHasMore);
    } catch (err: any) {
      console.error('[NotificationsPanel] Fetch error', {
        error: err.message || "Failed to load notifications",
        newCursor: newCursor ? `${newCursor.substring(0, 20)}...` : null,
      });
      setError(err.message || "Failed to load notifications");
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [user?.fid]);

  // Keep refs updated with latest functions
  useEffect(() => {
    fetchNotificationsRef.current = fetchNotifications;
  }, [fetchNotifications]);
  
  useEffect(() => {
    onNotificationsSeenRef.current = onNotificationsSeen;
  }, [onNotificationsSeen]);

  const forceFetchNotifications = useCallback(async () => {
    if (!user?.fid) {
      setDebugMessage("Error: No user FID available");
      return;
    }

    setIsForceFetching(true);
    setDebugMessage("Force fetching notifications from database...");

    try {
      // Get notification preferences
      const saved = localStorage.getItem("notificationPreferences");
      let types: string[] = [];
      if (saved) {
        try {
          const prefs = JSON.parse(saved);
          types = Object.entries(prefs)
            .filter(([_, enabled]) => enabled)
            .map(([key]) => {
              if (key === "mentions") return "mentions";
              if (key === "replies") return "replies";
              if (key === "quotes") return "quotes";
              return key;
            });
        } catch (e) {
          types = ["follows", "recasts", "likes", "mentions", "replies", "quotes"];
        }
      } else {
        types = ["follows", "recasts", "likes", "mentions", "replies", "quotes"];
      }

      const params = new URLSearchParams({
        fid: user.fid.toString(),
        limit: "25",
        _t: Date.now().toString(), // Force cache-bust
      });

      if (types.length > 0) {
        params.append("types", types.join(","));
      }

      const response = await fetch(`/api/notifications?${params}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const notificationCount = data.notifications?.length || 0;
      
      // Filter out notifications from users with score < 0.55
      const MIN_SCORE_THRESHOLD = 0.55;
      const filteredNotifications = (data.notifications || []).filter((notification: Notification) => {
        const userScore = getNotificationUserScore(notification);
        return userScore === null || userScore === undefined || userScore >= MIN_SCORE_THRESHOLD;
      });

      const filteredCount = filteredNotifications.length;
      const filteredOut = notificationCount - filteredCount;

      if (filteredNotifications.length > 0) {
        setNotifications(filteredNotifications);
        setCursor(data.next?.cursor || null);
        setHasMore(!!data.next?.cursor);
        setError(null);
        setDebugMessage(
          `✓ Success! Found ${notificationCount} notification(s) in database. ` +
          `${filteredCount} displayed${filteredOut > 0 ? ` (${filteredOut} filtered out due to low user score < 0.55)` : ""}.`
        );
      } else {
        // Provide more detailed debugging information
        if (notificationCount > 0) {
          setDebugMessage(
            `Found ${notificationCount} notification(s) in database, but all were filtered out (user score < 0.55). ` +
            `This means notifications exist but the users who created them have low reputation scores.`
          );
        } else {
          // Check if API returned empty array (might indicate blocking or no notifications)
          const isEmptyResponse = JSON.stringify(data) === '{"notifications":[],"next":null}';
          
          setDebugMessage(
            `No notifications found in database for user ${user.fid}. ` +
            `${isEmptyResponse ? "API returned empty array - if notifications exist in the database, this may indicate a blocking issue was recently removed. Try refreshing." : "Check database directly to verify notifications exist."}`
          );
        }
      }
    } catch (err: any) {
      console.error("Force fetch error:", err);
      setDebugMessage(`Error: ${err.message || "Failed to fetch notifications"}`);
    } finally {
      setIsForceFetching(false);
    }
  }, [user?.fid]);

  const markAsSeen = useCallback(async (notificationType?: string, castHash?: string) => {
    if (!user?.signer_uuid) return;
    
    try {
      const response = await fetch("/api/notifications/seen", {
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
      
      if (response.ok) {
        // Only notify parent component to refresh unread count if the API call succeeded
        if (onNotificationsSeenRef.current) {
          // Delay to ensure database update and cache invalidation complete
          setTimeout(() => {
            onNotificationsSeenRef.current?.();
          }, 250);
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('[NotificationsPanel] markAsSeen API call failed', { status: response.status, error: errorData });
      }
    } catch (err) {
      console.error('[NotificationsPanel] Failed to mark notifications as seen', err);
    }
  }, [user?.signer_uuid, user?.fid]);
  
  // Keep ref updated with latest markAsSeen function
  useEffect(() => {
    markAsSeenRef.current = markAsSeen;
  }, [markAsSeen]);

  useEffect(() => {
    if (isOpen && user?.fid && !hasInitialFetchRef.current) {
      // Always mark as seen when panel opens (badge is already cleared in parent)
      const markAsSeenAndFetch = async () => {
        hasInitialFetchRef.current = true;
        // Mark notifications as seen in background
        if (markAsSeenRef.current) {
          await markAsSeenRef.current();
        }
        
        // Notify parent to refresh count after marking as seen
        if (onNotificationsSeenRef.current) {
          // Delay to ensure database update completes
          setTimeout(() => {
            onNotificationsSeenRef.current?.();
          }, 250);
        }
        
        // Fetch notifications regardless
        if (fetchNotificationsRef.current) {
          fetchNotificationsRef.current();
        }
      };
      
      markAsSeenAndFetch();
    } else if (!isOpen) {
      // Reset fetching state when panel closes
      hasInitialFetchRef.current = false;
      isFetchingRef.current = false;
      setLoading(false);
      setDebugMessage(null); // Clear debug message when panel closes
    }
  }, [isOpen, user?.fid]);

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

  // Check if user has plus role
  useEffect(() => {
    const checkPlusStatus = async () => {
      if (!user?.fid) {
        setHasPlus(false);
        return;
      }

      try {
        const response = await fetch(`/api/admin/check?fid=${user.fid}`);
        if (response.ok) {
          const data = await response.json();
          const roles = data.roles || [];
          setHasPlus(hasPlusRole(roles));
        } else {
          setHasPlus(false);
        }
      } catch (error) {
        console.error("Failed to check plus status:", error);
        setHasPlus(false);
      }
    };

    if (isOpen && user?.fid) {
      checkPlusStatus();
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
    
    // Feedback notifications use submitter's profile picture
    if (type === "feedback.new") {
      const submitterPfp = notif.castData?.submitter?.pfpUrl;
      if (submitterPfp) {
        return submitterPfp;
      }
      // Fallback to app logo if no submitter pfp
      return "/icon-192x192.webp";
    }
    
    // For webhook notifications, check actor.pfp_url first (but skip for app.update)
    if (notif.actor?.pfp_url) {
      return notif.actor.pfp_url;
    }
    
    // For curated notifications, check castData._actor (stored when creating notification)
    if (notif.castData?._actor?.pfp_url) {
      return notif.castData._actor.pfp_url;
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
    
    // For curated cast notifications, check actor first (person who performed action)
    if (notif.actor?.pfp_url) {
      return notif.actor.pfp_url;
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
      case "curated.quality_score":
        return "📊";
      case "curated.curated":
        return "✨";
      case "curated.liked":
        return "❤️";
      case "curated.recast":
        return "🔄";
      case "curated.thanked":
        return "🙏";
      case "app.update":
        return "📢";
      case "feedback.new":
        return "💡";
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

    // Feedback notifications use URL from castData
    if (type === "feedback.new") {
      const url = notif.castData?.url;
      if (url) {
        // If URL is relative, return as-is; if absolute, return full URL
        return url.startsWith("http") ? url : url;
      }
      return "/admin/build-ideas?type=feedback";
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
      type === "curated.quality_score" ||
      type === "curated.curated" ||
      type === "curated.liked" ||
      type === "curated.recast" ||
      type === "curated.thanked"
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

    // For curated notifications, check actor field (person who performed action)
    if (notif.actor?.fid) {
      return notif.actor.fid;
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

  const handleDeleteNotification = async (notificationId: string) => {
    if (!user?.fid) {
      console.error("Cannot delete notification: user not logged in");
      return;
    }

    try {
      const response = await fetch("/api/notifications/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: notificationId,
          fid: user.fid,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete notification");
      }

      // Remove notification from local state by ID
      setNotifications((prev) => prev.filter((n) => {
        const notif = n as any;
        return notif.id !== notificationId;
      }));

      // Refresh unread count
      if (onNotificationsSeenRef.current) {
        setTimeout(() => {
          onNotificationsSeenRef.current?.();
        }, 250);
      }
    } catch (error: any) {
      console.error("Delete notification error:", error);
      // Don't show alert for delete failures to avoid interrupting UX
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
    
    // Feedback notifications show submitter name and feedback type
    if (type === "feedback.new") {
      const submitter = notif.castData?.submitter;
      const submitterName = submitter?.displayName || submitter?.username || "Someone";
      const feedbackType = notif.castData?.feedbackType || "feedback";
      const feedbackTypeLabel = feedbackType === "bug" ? "Bug Report" : feedbackType === "feature" ? "Feature Request" : "Feedback";
      return `${submitterName} submitted ${feedbackTypeLabel}`;
    }
    
    // Get users based on notification type
    let users: any[] = [];
    if (notif.follows) {
      users = notif.follows;
    } else if (notif.reactions) {
      users = notif.reactions.map((r: any) => r.user);
    } else if (notif.replies) {
      users = notif.replies.map((r: any) => r.user || r.author);
    } else if (notif.actor) {
      // For webhook notifications and curated notifications, use actor field
      // Actor contains the person who performed the action (curator, liker, recaster)
      users = [notif.actor];
    } else if (notification.cast?.author) {
      // Fallback to cast author for replies/quotes/mentions
      users = [notification.cast.author];
    } else if (notif.castData?.author) {
      // Final fallback to castData.author
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
      case "curated.quality_score":
        const qualityScore = (notification as any).castData?._qualityScore;
        if (qualityScore !== undefined) {
          return `Cast you curated received a quality score of ${qualityScore}`;
        }
        return "Cast you curated received a quality score";
      case "curated.curated":
        return `${firstName} also curated this cast`;
      case "curated.liked":
        return `${firstName} liked your curated cast`;
      case "curated.recast":
        return `${firstName} recast your curated cast`;
      case "curated.thanked":
        return `${firstName} said thank you for curating`;
      default:
        return "New notification";
    }
  };

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Only allow portal rendering after mount and when document.body exists
    if (typeof document !== "undefined" && document.body) {
      canRenderPortalRef.current = true;
    }
    
    return () => {
      // Cleanup: prevent portal rendering during unmount
      canRenderPortalRef.current = false;
    };
  }, []);

  // State change logging removed - was causing excessive logs

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

          {/* Informational note for users without plus role */}
          {hasPlus === false && (
            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800">
              <div className="flex items-start gap-2">
                <svg
                  className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5"
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
                  <p className="text-sm text-yellow-900 dark:text-yellow-100 font-medium">
                    Neynar Notifications
                  </p>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                    You don't have a plus role, so you won't see Neynar notifications (follows, likes, recasts, mentions, replies, quotes). You will still see app updates and other notifications stored in the database.
                  </p>
                </div>
              </div>
            </div>
          )}

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
            <div className="p-8 text-center space-y-4">
              <div className="text-gray-500 dark:text-gray-400">
                No notifications yet
              </div>
              <div className="space-y-2">
                <button
                  onClick={forceFetchNotifications}
                  disabled={isForceFetching || !user?.fid}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                >
                  {isForceFetching ? "Fetching..." : "Force Fetch from Database"}
                </button>
                {debugMessage && (
                  <div className={`text-xs mt-2 p-3 rounded-lg ${
                    debugMessage.startsWith("Error") || debugMessage.includes("No notifications")
                      ? "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300"
                      : "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300"
                  }`}>
                    {debugMessage}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div>
              {notifications.map((notification, index) => {
                const link = getNotificationLink(notification);
                const isNeynar = isNeynarNotification(notification);
                const actorFid = isNeynar ? getNotificationActorFid(notification) : null;
                const isMuteExpanded = expandedMuteIndex === index;


                const notif = notification as any;
                const notificationId = notif.id;
                const isDatabaseNotification = notificationId && !isNeynar;

                const content = (
                  <div
                    className={`p-4 border-b border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors relative ${
                      !notification.seen ? "bg-blue-50 dark:bg-blue-900/20" : ""
                    }`}
                  >
                    {/* Delete button - only for database-stored notifications */}
                    {isDatabaseNotification && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDeleteNotification(notificationId);
                        }}
                        className="absolute top-2 right-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors z-10"
                        title="Delete notification"
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
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    )}
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 relative w-10 h-10">
                        <AvatarImage
                          src={getNotificationPfpUrl(notification)}
                          alt={
                            (() => {
                              const type = String(notification.type).toLowerCase().trim();
                              const castDataType = (notification as any).castData?.type?.toLowerCase()?.trim();
                              if (type === "app.update" || castDataType === "app.update") {
                                return "App logo";
                              }
                              if (type === "feedback.new") {
                                const submitter = (notification as any).castData?.submitter;
                                return submitter?.displayName || submitter?.username || "Feedback submitter";
                              }
                              return "User avatar";
                            })()
                          }
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
                          
                          // For feedback.new, show title from castData
                          if (type === "feedback.new") {
                            const title = notif.castData?.title;
                            if (title) {
                              return (
                                <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                                  {title}
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
                      // For curated notifications, webhook notifications (cast.created), and feedback notifications, pass castHash to mark as read in database
                      const castHash = 
                        (type.startsWith("curated.") && (notif.castHash || notification.cast?.hash)) ||
                        (type === "cast.created" && (notif.castHash || notification.cast?.hash)) ||
                        (type === "feedback.new" && (notif.castHash || notification.cast?.hash)) ||
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
                      onClick={() => {
                        fetchNotifications(cursor);
                      }}
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

  // Only render portal if document.body exists and we're allowed to render (prevents errors in React Strict Mode)
  if (!isOpen || !mounted || !canRenderPortalRef.current || typeof document === "undefined" || !document.body) {
    return null;
  }

  return createPortal(content, document.body);
}

