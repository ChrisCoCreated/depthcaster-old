"use client";

import { useState, useEffect, useRef } from "react";
import { useNeynarContext } from "@neynar/react";
import { NotificationsPanel } from "./NotificationsPanel";
import { useNotificationPermission } from "@/lib/hooks/useNotificationPermission";

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [showPanel, setShowPanel] = useState(false);
  const { user } = useNeynarContext();
  const { isGranted } = useNotificationPermission();
  const previousUnreadCountRef = useRef(0);
  const previousNotificationsRef = useRef<any[]>([]);

  useEffect(() => {
    if (!user?.fid) {
      setUnreadCount(0);
      previousUnreadCountRef.current = 0;
      previousNotificationsRef.current = [];
      return;
    }

    const fetchUnreadCount = async () => {
      try {
        const types = getNotificationPreferences();
        const params = new URLSearchParams({
          fid: user.fid.toString(),
          limit: "25", // API max is 25
        });

        if (types.length > 0) {
          params.append("types", types.join(","));
        }

        const response = await fetch(`/api/notifications?${params}`);
        if (response.ok) {
          const data = await response.json();
          const notifications = data.notifications || [];
          const unread = notifications.filter((n: any) => !n.seen).length;
          
          // Check if device notifications are enabled
          const deviceNotificationsEnabled = localStorage.getItem("deviceNotificationsEnabled") === "true";
          
          // Trigger device notifications if:
          // 1. Device notifications are enabled
          // 2. Permission is granted
          // 3. New unread notifications appeared
          if (deviceNotificationsEnabled && isGranted && unread > previousUnreadCountRef.current) {
            const newNotifications = notifications
              .filter((n: any) => !n.seen)
              .slice(0, unread - previousUnreadCountRef.current);
            
            showDeviceNotifications(newNotifications);
          }
          
          setUnreadCount(unread);
          previousUnreadCountRef.current = unread;
          previousNotificationsRef.current = notifications;
        }
      } catch (err) {
        console.error("Failed to fetch unread count", err);
      }
    };

    fetchUnreadCount();
    // Poll every 30 seconds
    const interval = setInterval(fetchUnreadCount, 30000);

    return () => clearInterval(interval);
  }, [user?.fid, isGranted]);

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

  const getNotificationText = (notification: any): string => {
    const count = notification.count || 1;
    const users = notification.follows || notification.reactions?.map((r: any) => r.user) || [];
    const firstUser = users[0];
    const firstName = firstUser?.username || firstUser?.user?.username || "Someone";
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

  const getNotificationUrl = (notification: any): string => {
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

  const showDeviceNotifications = async (notifications: any[]) => {
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
  };

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
              const types = getNotificationPreferences();
              const params = new URLSearchParams({
                fid: user.fid.toString(),
                limit: "25",
              });

              if (types.length > 0) {
                params.append("types", types.join(","));
              }

              // Add cache-busting timestamp to ensure fresh data
              params.append("_t", Date.now().toString());
              const response = await fetch(`/api/notifications?${params}`);
              if (response.ok) {
                const data = await response.json();
                const unread = (data.notifications || []).filter(
                  (n: any) => !n.seen
                ).length;
                setUnreadCount(unread);
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

