"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Notification } from "@neynar/nodejs-sdk/build/api";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { useNeynarContext } from "@neynar/react";

interface NotificationsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onNotificationsSeen?: () => void;
}

export function NotificationsPanel({ isOpen, onClose, onNotificationsSeen }: NotificationsPanelProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const { user } = useNeynarContext();

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

  const fetchNotifications = useCallback(async (newCursor?: string | null) => {
    if (!user?.fid) {
      setLoading(false);
      return;
    }

    try {
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

      // Add cache-busting timestamp to ensure fresh data after marking as seen
      params.append("_t", Date.now().toString());
      const response = await fetch(`/api/notifications?${params}`);
      if (!response.ok) {
        throw new Error("Failed to fetch notifications");
      }

      const data = await response.json();
      
      if (newCursor) {
        setNotifications((prev) => [...prev, ...data.notifications]);
      } else {
        setNotifications(data.notifications || []);
      }

      setCursor(data.next?.cursor || null);
      setHasMore(!!data.next?.cursor);
    } catch (err: any) {
      setError(err.message || "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }, [user?.fid]);

  const markAsSeen = useCallback(async (notificationType?: string) => {
    if (!user?.signer_uuid) return;

    try {
      await fetch("/api/notifications/seen", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          signerUuid: user.signer_uuid,
          notificationType,
        }),
      });
      
      // Notify parent component to refresh unread count
      if (onNotificationsSeen) {
        onNotificationsSeen();
      }
    } catch (err) {
      console.error("Failed to mark notifications as seen", err);
    }
  }, [user?.signer_uuid, onNotificationsSeen]);

  useEffect(() => {
    if (isOpen && user?.fid) {
      // Mark all notifications as seen first, then fetch fresh data
      markAsSeen().then(() => {
        // Add cache-busting parameter to ensure fresh data
        fetchNotifications();
      });
    }
  }, [isOpen, user?.fid, fetchNotifications, markAsSeen]);

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
      default:
        return "🔔";
    }
  };

  const getNotificationLink = (notification: Notification): string | null => {
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

  const getNotificationText = (notification: Notification): string => {
    const count = notification.count || 1;
    const type = String(notification.type).toLowerCase();
    
    // Get users based on notification type
    let users: any[] = [];
    const notif = notification as any;
    if (notif.follows) {
      users = notif.follows;
    } else if (notif.reactions) {
      users = notif.reactions.map((r: any) => r.user);
    } else if (notif.replies) {
      users = notif.replies.map((r: any) => r.user || r.author);
    } else if (notification.cast?.author) {
      // Fallback to cast author for replies/quotes/mentions
      users = [notification.cast.author];
    }
    
    const firstUser = users[0];
    const firstName = (firstUser as any)?.username || 
                     (firstUser as any)?.user?.username || 
                     (firstUser as any)?.display_name ||
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
      default:
        return "New notification";
    }
  };

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
                const content = (
                  <div
                    className={`p-4 border-b border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors ${
                      !notification.seen ? "bg-blue-50 dark:bg-blue-900/20" : ""
                    }`}
                  >
                    <div className="flex gap-3">
                      <div className="text-2xl">{getNotificationIcon(notification.type)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-900 dark:text-gray-100">
                          {getNotificationText(notification)}
                        </div>
                        {notification.cast && (
                          <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                            {notification.cast.text}
                          </div>
                        )}
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-500">
                          {formatDistanceToNow(
                            new Date(notification.most_recent_timestamp),
                            { addSuffix: true }
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );

                return link ? (
                  <Link key={index} href={link} onClick={() => markAsSeen()}>
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

