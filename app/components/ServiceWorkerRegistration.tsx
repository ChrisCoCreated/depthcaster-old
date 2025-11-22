"use client";

import { useEffect, useState } from "react";
import { useNotificationPermission } from "@/lib/hooks/useNotificationPermission";

export function ServiceWorkerRegistration() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const { isSupported, requestPermission } = useNotificationPermission();

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const registerServiceWorker = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });

        setRegistration(registration);

        // Handle service worker updates
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                // New service worker available, but old one still active
                console.log("New service worker available");
              }
            });
          }
        });

        // Check for updates periodically
        setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000); // Check every hour
      } catch (error) {
        console.error("Service worker registration failed:", error);
      }
    };

    registerServiceWorker();
  }, []);

  // Request notification permission when service worker is ready
  useEffect(() => {
    if (registration && isSupported) {
      // Check if user has device notifications enabled in preferences
      const deviceNotificationsEnabled = localStorage.getItem("deviceNotificationsEnabled");
      if (deviceNotificationsEnabled === "true") {
        requestPermission();
      }
    }
  }, [registration, isSupported, requestPermission]);

  return null; // This component doesn't render anything
}



