"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useNeynarContext } from "@neynar/react";
import { NotificationsPanel } from "./NotificationsPanel";
import { useNotificationPermission } from "@/lib/hooks/useNotificationPermission";
import { useActivityMonitor } from "@/lib/hooks/useActivityMonitor";
import { isSuperAdmin } from "@/lib/roles-client";

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [showPanel, setShowPanel] = useState(false);
  const [isSuperAdminUser, setIsSuperAdminUser] = useState(false);
  const { user } = useNeynarContext();
  const { isGranted } = useNotificationPermission();
  const previousUnreadCountRef = useRef(0);
  const previousNotificationsRef = useRef<unknown[]>([]);
  const manualClearTimeRef = useRef<number | null>(null);
  const markAsSeenCompleteRef = useRef<number | null>(null);

  // Helper function to show toast for superadmin
  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    if (isSuperAdminUser) {
      window.dispatchEvent(new CustomEvent("showToast", {
        detail: { message, type }
      }));
    }
  }, [isSuperAdminUser]);

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

  const getNotificationText = (notification: { count?: number; type: string; follows?: unknown[]; reactions?: Array<{ user: unknown }>; replies?: Array<{ user?: unknown; author?: unknown }>; cast?: { author?: { username?: string; display_name?: string } }; castData?: { title?: string; author?: { username?: string; display_name?: string } }; actor?: { username?: string; display_name?: string; fid?: number }; [key: string]: unknown }): string => {
    const count = notification.count || 1;
    const type = String(notification.type).toLowerCase();
    const notif = notification as any;
    
    // App update notifications use title from castData
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
      type === "curated.quality_score" ||
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
        const notificationType = String(notification.type).toLowerCase();
        // Use more descriptive title for app updates
        const title = notificationType === "app.update" ? "Depthcaster Update" : "Depthcaster";
        const body = getNotificationText(notification);
        const url = getNotificationUrl(notification);
        
        // Send message to service worker to show notification
        // This is more reliable on desktop browsers than calling registration.showNotification() directly
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: 'SHOW_NOTIFICATION',
            notification: {
              title,
              body,
              icon: "/icon-192x192.webp",
              badge: "/icon-96x96.webp",
              tag: `notification-${notification.cast?.hash || notification.timestamp || Date.now()}`,
              data: { url },
            }
          });
        } else {
          // Fallback: if service worker isn't controlling the page yet, use direct call
          registration.showNotification(title, {
            body,
            icon: "/icon-192x192.webp",
            badge: "/icon-96x96.webp",
            tag: `notification-${notification.cast?.hash || notification.timestamp || Date.now()}`,
            data: { url },
            requireInteraction: false,
          });
        }
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

    // Use shorter polling when active (10 seconds), longer when inactive (5 minutes)
    const ACTIVE_POLL_INTERVAL = 10 * 1000; // 10 seconds when active
    const INACTIVE_POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes when inactive

    const fetchUnreadCount = async (useCacheBust = false) => {
      const now = Date.now();
      const currentPollInterval = isUserActive && isTabVisible ? ACTIVE_POLL_INTERVAL : INACTIVE_POLL_INTERVAL;
      const timeSinceLastPoll = now - lastPollTimeRef.current;
      
      // Enforce minimum interval - never poll more frequently than the current interval
      if (timeSinceLastPoll < currentPollInterval && lastPollTimeRef.current > 0 && !useCacheBust) {
        // Too soon since last poll, reschedule for the remaining time
        const remainingTime = currentPollInterval - timeSinceLastPoll;
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
        // Add cache-busting parameter if explicitly requested (e.g., from push notification)
        const url = useCacheBust 
          ? `/api/notifications/count?fid=${user.fid}&_t=${Date.now()}`
          : `/api/notifications/count?fid=${user.fid}`;
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          const unread = data.unreadCount || 0;
          
          // Check if device notifications are enabled
          // NOTE: deviceNotificationsEnabled only controls OS-level device notifications,
          // NOT what appears in the notification panel. The panel always shows all unread notifications.
          const deviceNotificationsEnabled = localStorage.getItem("deviceNotificationsEnabled") === "true";
          
          // Trigger OS-level device notifications if:
          // 1. Device notifications are enabled (user preference)
          // 2. Permission is granted (browser permission)
          // 3. New unread notifications appeared (count increased)
          // Note: We can't show device notifications from count endpoint,
          // but we can trigger a full fetch if count increased
          // This only affects OS notifications, not the notification panel display
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
          
          // Skip update if badge was manually cleared recently (within last 3 seconds)
          const MANUAL_CLEAR_TIMEOUT = 3000; // 3 seconds
          if (!(manualClearTimeRef.current && Date.now() - manualClearTimeRef.current < MANUAL_CLEAR_TIMEOUT)) {
            setUnreadCount(unread);
            previousUnreadCountRef.current = unread;
          }
          
          // Reset backoff on success
          backoffDelayRef.current = currentPollInterval;
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
      
      // Use appropriate interval based on activity
      const currentPollInterval = isUserActive && isTabVisible ? ACTIVE_POLL_INTERVAL : INACTIVE_POLL_INTERVAL;
      const delay = Math.max(backoffDelayRef.current, currentPollInterval);
      
      timeoutIdRef.current = setTimeout(() => {
        // Only fetch if still active and tab is visible
        if (isUserActive && isTabVisible) {
          fetchUnreadCount();
          scheduleNextFetch();
        }
      }, delay);
    };

    // Immediate fetch on new session (when component mounts)
    lastPollTimeRef.current = 0; // Reset to allow immediate fetch
    fetchUnreadCount();
    
    // Schedule recurring fetches (10s when active, 5min when inactive)
    scheduleNextFetch();

    return () => {
      if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
    };
  }, [user?.fid, isGranted, showDeviceNotifications, isUserActive, isTabVisible]);

  // Handle activity changes - resume polling when user becomes active
  useEffect(() => {
    if (!user?.fid) return;

    const ACTIVE_POLL_INTERVAL = 10 * 1000; // 10 seconds when active
    const INACTIVE_POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes when inactive

    if (isUserActive && !wasActiveRef.current && isTabVisible) {
      // User became active, fetch immediately and start shorter polling
      const now = Date.now();
      const fetchUnreadCount = async () => {
        try {
          const response = await fetch(`/api/notifications/count?fid=${user.fid}&_t=${Date.now()}`);
          if (response.ok) {
            const data = await response.json();
            // Skip update if badge was manually cleared recently (within last 3 seconds)
            const MANUAL_CLEAR_TIMEOUT = 3000; // 3 seconds
            if (!(manualClearTimeRef.current && Date.now() - manualClearTimeRef.current < MANUAL_CLEAR_TIMEOUT)) {
              setUnreadCount(data.unreadCount || 0);
              previousUnreadCountRef.current = data.unreadCount || 0;
            }
          }
        } catch (err) {
          console.error("Failed to fetch unread count", err);
        }
      };
      fetchUnreadCount();
      lastPollTimeRef.current = now;
      backoffDelayRef.current = ACTIVE_POLL_INTERVAL;
    } else if (!isUserActive && wasActiveRef.current) {
      // User became inactive, switch to longer polling interval
      backoffDelayRef.current = INACTIVE_POLL_INTERVAL;
    }
    wasActiveRef.current = isUserActive;
  }, [isUserActive, isTabVisible, user?.fid]);

  // Handle visibility changes - resume polling when tab becomes visible
  useEffect(() => {
    if (!user?.fid) return;

    const ACTIVE_POLL_INTERVAL = 10 * 1000; // 10 seconds when active

    if (isTabVisible && !wasVisibleRef.current && isUserActive) {
      // Tab became visible and user is active, fetch immediately
      const now = Date.now();
      const fetchUnreadCount = async () => {
        try {
          const response = await fetch(`/api/notifications/count?fid=${user.fid}&_t=${Date.now()}`);
          if (response.ok) {
            const data = await response.json();
            // Skip update if badge was manually cleared recently (within last 3 seconds)
            const MANUAL_CLEAR_TIMEOUT = 3000; // 3 seconds
            if (!(manualClearTimeRef.current && Date.now() - manualClearTimeRef.current < MANUAL_CLEAR_TIMEOUT)) {
              setUnreadCount(data.unreadCount || 0);
              previousUnreadCountRef.current = data.unreadCount || 0;
            }
          }
        } catch (err) {
          console.error("Failed to fetch unread count", err);
        }
      };
      fetchUnreadCount();
      lastPollTimeRef.current = now;
      backoffDelayRef.current = ACTIVE_POLL_INTERVAL;
    }
    wasVisibleRef.current = isTabVisible;
  }, [isTabVisible, isUserActive, user?.fid]);

  // Listen for service worker messages to refresh badge immediately
  useEffect(() => {
    if (!user?.fid || typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const handleMessage = async (event: MessageEvent) => {
      if (event.data && event.data.type === "BADGE_REFRESH") {
        // Immediately refresh badge count with cache-busting
        try {
          const response = await fetch(`/api/notifications/count?fid=${user.fid}&_t=${Date.now()}`);
          if (response.ok) {
            const data = await response.json();
            const newCount = data.unreadCount || 0;
            // Skip update if badge was manually cleared recently (within last 3 seconds)
            const MANUAL_CLEAR_TIMEOUT = 3000; // 3 seconds
            if (!(manualClearTimeRef.current && Date.now() - manualClearTimeRef.current < MANUAL_CLEAR_TIMEOUT)) {
              setUnreadCount(newCount);
              previousUnreadCountRef.current = newCount;
              if (isSuperAdminUser) {
                console.log("[SuperAdmin] Badge refreshed from push notification:", newCount);
                showToast(`Badge refreshed: ${newCount}`, newCount === 0 ? "success" : "error");
              }
            }
          }
        } catch (err) {
          console.error("Failed to refresh badge from push notification", err);
        }
      }
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);

    return () => {
      navigator.serviceWorker.removeEventListener("message", handleMessage);
    };
  }, [user?.fid, isSuperAdminUser, showToast]);

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
        }
      } catch (error) {
        console.error("Failed to check superadmin status:", error);
        setIsSuperAdminUser(false);
      }
    };

    checkSuperAdmin();
  }, [user?.fid]);

  if (!user) return null;

  return (
    <>
      <button
        onClick={() => {
          setUnreadCount(0); // Clear badge immediately on click
          manualClearTimeRef.current = Date.now(); // Track manual clear time
          console.log("Bell Cleared");
          if (isSuperAdminUser) {
            console.log("[SuperAdmin] Badge cleared manually");
            showToast("Badge cleared", "success");
          }
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
          // Mark that markAsSeen has completed
          markAsSeenCompleteRef.current = Date.now();
          console.log("markAsSeen completed at", markAsSeenCompleteRef.current);
          if (isSuperAdminUser) {
            console.log("[SuperAdmin] markAsSeen completed");
            showToast("markAsSeen completed", "success");
          }
          
          // Refresh unread count when notifications are marked as seen
          const fetchUnreadCount = async () => {
            if (!user?.fid) return;
            
            // Skip update if badge was manually cleared recently (within last 3 seconds)
            const MANUAL_CLEAR_TIMEOUT = 3000; // 3 seconds
            if (manualClearTimeRef.current && Date.now() - manualClearTimeRef.current < MANUAL_CLEAR_TIMEOUT) {
              if (isSuperAdminUser) {
                console.log("[SuperAdmin] Skipping badge update - within manual clear timeout");
              }
              return;
            }
            
            try {
              // Use lightweight count endpoint with cache-busting to ensure fresh count
              const response = await fetch(`/api/notifications/count?fid=${user.fid}&_t=${Date.now()}`);
              if (response.ok) {
                const data = await response.json();
                const newCount = data.unreadCount || 0;
                if (isSuperAdminUser) {
                  console.log("[SuperAdmin] Badge count updated:", newCount);
                  showToast(`Badge count: ${newCount}`, newCount === 0 ? "success" : "error");
                }
                setUnreadCount(newCount);
              }
            } catch (err) {
              console.error("Failed to fetch unread count", err);
              if (isSuperAdminUser) {
                showToast("Failed to fetch unread count", "error");
              }
            }
          };
          fetchUnreadCount();
        }}
      />
    </>
  );
}

