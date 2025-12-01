"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useNeynarContext } from "@neynar/react";
import { NotificationsPanel } from "./NotificationsPanel";
import { useNotificationPermission } from "@/lib/hooks/useNotificationPermission";
import { useActivityMonitor } from "@/lib/hooks/useActivityMonitor";

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [showPanel, setShowPanel] = useState(false);
  const { user } = useNeynarContext();
  const { isGranted } = useNotificationPermission();
  const previousUnreadCountRef = useRef(0);
  const previousNotificationsRef = useRef<unknown[]>([]);

  const getNotificationPreferences = (): string[] => {
    const saved = localStorage.getItem("notificationPreferences");
    if (!saved) return ["follows", "recasts", "likes", "mentions", "replies", "quotes"];
    
    try {
      const prefs = JSON.parse(saved);
      return Object.entries(prefs)
        .filter(([, enabled]) => enabled)
        .map(([key]) => {
          // Map to API format (API uses plural forms)
          if (key === "mentions") return "mentions";
          if (key === "replies") return "replies";
          if (key === "quotes") return "quotes";
          return key;
        });
    } catch {
      return ["follows", "recasts", "likes", "mentions", "replies", "quotes"];
    }
  };

  const getNotificationText = (notification: { count?: number; type: string; follows?: unknown[]; reactions?: Array<{ user: unknown }>; replies?: Array<{ user?: unknown; author?: unknown }>; cast?: { author?: { username?: string; display_name?: string } }; [key: string]: unknown }): string => {
    const count = notification.count || 1;
    const users = notification.follows || notification.reactions?.map((r) => r.user) || [];
    const firstUser = users[0] as { username?: string; user?: { username?: string }; display_name?: string } | undefined;
    const firstName = firstUser?.username || (firstUser as { user?: { username?: string } })?.user?.username || "Someone";
    const type = String(notification.type).toLowerCase();

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
        return `${firstName} replied to your cast`;
      case "quote":
      case "quotes":
        return `${firstName} quoted your cast`;
      case "cast.created":
        return `${firstName} posted a new cast`;
      default:
        return "New notification";
    }
  };

  const getNotificationUrl = (notification: {
    type: string;
    cast?: { hash?: string; parent_hash?: string };
    castHash?: string;
    castData?: { _rootCastHash?: string; _curatedCastHash?: string; parent_hash?: string };
    follows?: Array<{ fid?: number; user?: { fid?: number } }>;
    [key: string]: unknown;
  }): string => {
    const type = String(notification.type);

    // Curated notifications: prefer conversation view
    if (type === "curated.quality_reply") {
      const replyHash = notification.castHash || notification.cast?.hash;
      const curatedHash =
        notification.cast?.parent_hash ||
        notification.castData?._rootCastHash ||
        notification.castData?._curatedCastHash;

      if (curatedHash && replyHash) {
        return `/conversation/${curatedHash}?replyHash=${replyHash}`;
      }
      if (replyHash) {
        return `/conversation/${replyHash}`;
      }
    }

    if (
      type === "curated.curated" ||
      type === "curated.liked" ||
      type === "curated.recast"
    ) {
      const curatedHash =
        notification.castHash || notification.cast?.hash;
      if (curatedHash) {
        return `/conversation/${curatedHash}`;
      }
    }

    // Default behavior – fall back to cast/profile routes
    if (notification.cast?.hash) {
      return `/cast/${notification.cast.hash}`;
    }
    if (notification.follows && notification.follows.length > 0) {
      const follower = notification.follows[0];
      const fid = follower?.fid || follower?.user?.fid;
      if (fid) return `/profile/${fid}`;
    }
    return "/";
  };

  const showDeviceNotifications = useCallback(async (notifications: Array<{ count?: number; type: string; seen?: boolean; cast?: { hash?: string; text?: string; author?: { username?: string; display_name?: string } }; timestamp?: string; created_at?: string; follows?: Array<{ fid?: number; user?: { fid?: number; username?: string } }>; reactions?: Array<{ user: unknown }>; replies?: Array<{ user?: unknown; author?: unknown }>; [key: string]: unknown }>) => {
    if (!("serviceWorker" in navigator)) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      
      // Show notification for each new notification (limit to 3 to avoid spam)
      const notificationsToShow = notifications.slice(0, 3);
      
      for (const notification of notificationsToShow) {
        const title = "Depthcaster";
        const body = getNotificationText(notification);
        const url = getNotificationUrl(notification);
        
        registration.showNotification(title, {
          body,
          icon: "/icon-192x192.webp",
          badge: "/icon-96x96.webp",
          tag: `notification-${notification.cast?.hash || notification.timestamp || Date.now()}`,
          data: { url },
          requireInteraction: false,
        });
      }
    } catch (error) {
      console.error("Failed to show device notification:", error);
    }
  }, []);

  // Use shared activity monitor
  const { isUserActive, isTabVisible } = useActivityMonitor({
    inactivityThreshold: 3 * 60 * 1000, // 3 minutes
  });

  const timeoutIdRef = useRef<NodeJS.Timeout | null>(null);
  const lastPollTimeRef = useRef(0);
  const backoffDelayRef = useRef(5 * 60 * 1000); // 5 minutes
  const wasActiveRef = useRef(true);
  const wasVisibleRef = useRef(true);

  useEffect(() => {
    if (!user?.fid) {
      // Use refs to avoid setState in effect cleanup
      previousUnreadCountRef.current = 0;
      previousNotificationsRef.current = [];
      // Defer setState to avoid synchronous state update in effect
      setTimeout(() => setUnreadCount(0), 0);
      return;
    }

    const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes - NEVER poll more frequently than this

    const fetchUnreadCount = async () => {
      // Enforce minimum 5-minute interval - never poll more frequently
      const now = Date.now();
      const timeSinceLastPoll = now - lastPollTimeRef.current;
      if (timeSinceLastPoll < POLL_INTERVAL && lastPollTimeRef.current > 0) {
        // Too soon since last poll, reschedule for the remaining time
        const remainingTime = POLL_INTERVAL - timeSinceLastPoll;
        if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = setTimeout(() => {
          fetchUnreadCount();
          scheduleNextFetch();
        }, remainingTime);
        return;
      }
      
      lastPollTimeRef.current = now;
      try {
        // Use lightweight count endpoint instead of full notifications
        const response = await fetch(`/api/notifications/count?fid=${user.fid}`);
        if (response.ok) {
          const data = await response.json();
          const unread = data.unreadCount || 0;
          
          // Check if device notifications are enabled
          const deviceNotificationsEnabled = localStorage.getItem("deviceNotificationsEnabled") === "true";
          
          // Trigger device notifications if:
          // 1. Device notifications are enabled
          // 2. Permission is granted
          // 3. New unread notifications appeared
          // Note: We can't show device notifications from count endpoint,
          // but we can trigger a full fetch if count increased
          if (deviceNotificationsEnabled && isGranted && unread > previousUnreadCountRef.current) {
            // Fetch full notifications to show device notifications
            const types = getNotificationPreferences();
            const params = new URLSearchParams({
              fid: user.fid.toString(),
              limit: "25",
            });

            if (types.length > 0) {
              params.append("types", types.join(","));
            }

            try {
              const fullResponse = await fetch(`/api/notifications?${params}`);
              if (fullResponse.ok) {
                const fullData = await fullResponse.json();
                const notifications = fullData.notifications || [];
                const newNotifications = notifications
                  .filter((n: { seen?: boolean }) => !n.seen)
                  .slice(0, unread - previousUnreadCountRef.current);
                
                showDeviceNotifications(newNotifications);
                previousNotificationsRef.current = notifications;
              }
            } catch (err) {
              console.error("Failed to fetch full notifications for device notifications", err);
            }
          }
          
          setUnreadCount(unread);
          previousUnreadCountRef.current = unread;
          
          // Reset backoff on success
          backoffDelayRef.current = POLL_INTERVAL;
        } else {
          // On error, use exponential backoff (but don't exceed 10 minutes)
          backoffDelayRef.current = Math.min(backoffDelayRef.current * 2, 10 * 60 * 1000); // Max 10 minutes
        }
      } catch (err) {
        console.error("Failed to fetch unread count", err);
        // Use exponential backoff on error (but don't exceed 10 minutes)
        backoffDelayRef.current = Math.min(backoffDelayRef.current * 2, 10 * 60 * 1000); // Max 10 minutes
      }
    };

    const scheduleNextFetch = () => {
      // Don't schedule if user is inactive or tab is hidden
      if (!isUserActive || !isTabVisible) {
        return;
      }
      
      if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = setTimeout(() => {
        // Only fetch if still active and tab is visible
        if (isUserActive && isTabVisible) {
          fetchUnreadCount();
          scheduleNextFetch();
        }
      }, backoffDelayRef.current);
    };

    // Immediate fetch on new session (when component mounts)
    lastPollTimeRef.current = 0; // Reset to allow immediate fetch
    fetchUnreadCount();
    
    // Schedule recurring fetches every 5 minutes
    scheduleNextFetch();

    return () => {
      if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
    };
  }, [user?.fid, isGranted, showDeviceNotifications]);

  // Handle activity changes - resume polling when user becomes active
  useEffect(() => {
    if (!user?.fid) return;

    const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes

    if (isUserActive && !wasActiveRef.current && isTabVisible) {
      // User became active, check if enough time has passed since last poll
      const now = Date.now();
      const timeSinceLastPoll = now - lastPollTimeRef.current;
      if (timeSinceLastPoll >= POLL_INTERVAL || lastPollTimeRef.current === 0) {
        // Enough time has passed, fetch immediately
        const fetchUnreadCount = async () => {
          try {
            const response = await fetch(`/api/notifications/count?fid=${user.fid}`);
            if (response.ok) {
              const data = await response.json();
              setUnreadCount(data.unreadCount || 0);
              previousUnreadCountRef.current = data.unreadCount || 0;
            }
          } catch (err) {
            console.error("Failed to fetch unread count", err);
          }
        };
        fetchUnreadCount();
        lastPollTimeRef.current = now;
      }
    }
    wasActiveRef.current = isUserActive;
  }, [isUserActive, isTabVisible, user?.fid]);

  // Handle visibility changes - resume polling when tab becomes visible
  useEffect(() => {
    if (!user?.fid) return;

    const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes

    if (isTabVisible && !wasVisibleRef.current && isUserActive) {
      // Tab became visible and user is active, check if enough time has passed
      const now = Date.now();
      const timeSinceLastPoll = now - lastPollTimeRef.current;
      if (timeSinceLastPoll >= POLL_INTERVAL || lastPollTimeRef.current === 0) {
        const fetchUnreadCount = async () => {
          try {
            const response = await fetch(`/api/notifications/count?fid=${user.fid}`);
            if (response.ok) {
              const data = await response.json();
              setUnreadCount(data.unreadCount || 0);
              previousUnreadCountRef.current = data.unreadCount || 0;
            }
          } catch (err) {
            console.error("Failed to fetch unread count", err);
          }
        };
        fetchUnreadCount();
        lastPollTimeRef.current = now;
      }
    }
    wasVisibleRef.current = isTabVisible;
  }, [isTabVisible, isUserActive, user?.fid]);

  if (!user) return null;

  return (
    <>
      <button
        onClick={() => {
          setUnreadCount(0); // Clear badge immediately on click
          setShowPanel(true);
        }}
        className="relative p-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
        aria-label="Notifications"
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
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      <NotificationsPanel
        isOpen={showPanel}
        onClose={() => setShowPanel(false)}
        onNotificationsSeen={() => {
          // Refresh unread count when notifications are marked as seen
          const fetchUnreadCount = async () => {
            if (!user?.fid) return;
            try {
              // Use lightweight count endpoint with cache-busting to ensure fresh count
              const response = await fetch(`/api/notifications/count?fid=${user.fid}&_t=${Date.now()}`);
              if (response.ok) {
                const data = await response.json();
                setUnreadCount(data.unreadCount || 0);
              }
            } catch (err) {
              console.error("Failed to fetch unread count", err);
            }
          };
          fetchUnreadCount();
        }}
      />
    </>
  );
}

