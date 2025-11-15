"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useNeynarContext } from "@neynar/react";
import { NotificationsPanel } from "./NotificationsPanel";
import { useNotificationPermission } from "@/lib/hooks/useNotificationPermission";

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

  const getNotificationUrl = (notification: { cast?: { hash?: string }; follows?: Array<{ fid?: number; user?: { fid?: number } }>; [key: string]: unknown }): string => {
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

  useEffect(() => {
    if (!user?.fid) {
      // Use refs to avoid setState in effect cleanup
      previousUnreadCountRef.current = 0;
      previousNotificationsRef.current = [];
      // Defer setState to avoid synchronous state update in effect
      setTimeout(() => setUnreadCount(0), 0);
      return;
    }

    const intervalId: NodeJS.Timeout | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let inactivityTimeoutId: NodeJS.Timeout | null = null;
    const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes - NEVER poll more frequently than this
    const INACTIVITY_THRESHOLD = 3 * 60 * 1000; // 3 minutes of inactivity before pausing
    let backoffDelay = POLL_INTERVAL;
    let lastPollTime = 0; // Track when we last polled to enforce 5-minute minimum
    let isActive = true; // Track if user is currently active
    let isPaused = false; // Track if polling is paused due to inactivity

    const fetchUnreadCount = async () => {
      // Enforce minimum 5-minute interval - never poll more frequently
      const now = Date.now();
      const timeSinceLastPoll = now - lastPollTime;
      if (timeSinceLastPoll < POLL_INTERVAL && lastPollTime > 0) {
        // Too soon since last poll, reschedule for the remaining time
        const remainingTime = POLL_INTERVAL - timeSinceLastPoll;
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          fetchUnreadCount();
          scheduleNextFetch();
        }, remainingTime);
        return;
      }
      
      lastPollTime = now;
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
          backoffDelay = POLL_INTERVAL;
        } else {
          // On error, use exponential backoff (but don't exceed 10 minutes)
          backoffDelay = Math.min(backoffDelay * 2, 10 * 60 * 1000); // Max 10 minutes
        }
      } catch (err) {
        console.error("Failed to fetch unread count", err);
        // Use exponential backoff on error (but don't exceed 10 minutes)
        backoffDelay = Math.min(backoffDelay * 2, 10 * 60 * 1000); // Max 10 minutes
      }
    };

    const scheduleNextFetch = () => {
      // Don't schedule if paused due to inactivity
      if (isPaused) {
        return;
      }
      
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        // Only fetch if still active and not paused
        if (isActive && !isPaused) {
          fetchUnreadCount();
          scheduleNextFetch();
        }
      }, backoffDelay);
    };

    // Track user activity
    const markActivity = () => {
      const wasPaused = isPaused;
      isActive = true;
      
      // Clear inactivity timeout
      if (inactivityTimeoutId) {
        clearTimeout(inactivityTimeoutId);
        inactivityTimeoutId = null;
      }
      
      // If we were paused and user became active, resume polling
      if (wasPaused) {
        isPaused = false;
        // Check if enough time has passed since last poll (enforce 5-minute minimum)
        const now = Date.now();
        const timeSinceLastPoll = now - lastPollTime;
        if (timeSinceLastPoll >= POLL_INTERVAL || lastPollTime === 0) {
          // Enough time has passed, fetch immediately
          fetchUnreadCount();
        }
        // Schedule next fetch
        scheduleNextFetch();
      }
      
      // Set inactivity timeout - if no activity for threshold, pause polling
      inactivityTimeoutId = setTimeout(() => {
        if (isActive && !document.hidden) {
          isPaused = true;
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
        }
      }, INACTIVITY_THRESHOLD);
    };

    // Activity event handlers
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    activityEvents.forEach((event) => {
      document.addEventListener(event, markActivity, { passive: true });
    });

    // Immediate fetch on new session (when component mounts)
    lastPollTime = 0; // Reset to allow immediate fetch
    fetchUnreadCount();
    
    // Schedule recurring fetches every 5 minutes
    scheduleNextFetch();
    
    // Start activity tracking
    markActivity();

    // Handle visibility change - pause when tab is hidden, resume when visible
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab is hidden, pause polling
        isActive = false;
        isPaused = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (inactivityTimeoutId) {
          clearTimeout(inactivityTimeoutId);
          inactivityTimeoutId = null;
        }
      } else {
        // Tab is visible, resume polling if user is active
        isActive = true;
        isPaused = false;
        // Check if enough time has passed since last poll (enforce 5-minute minimum)
        const now = Date.now();
        const timeSinceLastPoll = now - lastPollTime;
        if (timeSinceLastPoll >= POLL_INTERVAL || lastPollTime === 0) {
          // Enough time has passed, fetch immediately
          fetchUnreadCount();
        }
        scheduleNextFetch();
        // Restart activity tracking
        markActivity();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
      if (inactivityTimeoutId) clearTimeout(inactivityTimeoutId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      // Remove all activity event listeners
      activityEvents.forEach((event) => {
        document.removeEventListener(event, markActivity);
      });
    };
  }, [user?.fid, isGranted, showDeviceNotifications, unreadCount]);

  if (!user) return null;

  return (
    <>
      <button
        onClick={() => setShowPanel(true)}
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
              // Use lightweight count endpoint
              const response = await fetch(`/api/notifications/count?fid=${user.fid}`);
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

