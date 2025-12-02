"use client";

import { useState, useEffect, useCallback } from "react";

type NotificationPermission = "default" | "granted" | "denied";

export function useNotificationPermission() {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check if notifications are supported (only need Notification API, not service worker)
    // Service worker is needed for actually showing notifications, but not for the toggle itself
    const supported = "Notification" in window;
    setIsSupported(supported);

    if (supported) {
      setPermission(Notification.permission as NotificationPermission);
    }
  }, []);

  // Refresh permission status periodically (in case user changes it in browser settings)
  useEffect(() => {
    if (!isSupported) return;

    const interval = setInterval(() => {
      if (typeof window !== "undefined" && "Notification" in window) {
        const currentPermission = Notification.permission as NotificationPermission;
        setPermission((prev) => {
          // Only update if permission actually changed
          if (prev !== currentPermission) {
            return currentPermission;
          }
          return prev;
        });
      }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, [isSupported]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      console.warn("Notifications are not supported in this browser");
      return false;
    }

    if (permission === "granted") {
      return true;
    }

    if (permission === "denied") {
      console.warn("Notification permission was previously denied");
      return false;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result as NotificationPermission);
      return result === "granted";
    } catch (error) {
      console.error("Error requesting notification permission:", error);
      return false;
    }
  }, [isSupported, permission]);

  return {
    permission,
    isSupported,
    isGranted: permission === "granted",
    isDenied: permission === "denied",
    requestPermission,
    // Helper to check if service worker is available (needed for actually showing notifications)
    isServiceWorkerSupported: typeof navigator !== "undefined" && "serviceWorker" in navigator,
  };
}

