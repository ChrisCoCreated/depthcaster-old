"use client";

import { useState, useEffect, useCallback } from "react";

export function useUpdateCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    let interval: NodeJS.Timeout | null = null;

    const checkForUpdates = async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg) {
          return;
        }

        setRegistration(reg);

        // Check if there's already a waiting service worker
        if (reg.waiting) {
          setUpdateAvailable(true);
        }

        // Listen for updates
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                // New service worker is installed and waiting
                setUpdateAvailable(true);
              }
            });
          }
        });

        // Check for updates periodically
        interval = setInterval(() => {
          reg.update();
        }, 60 * 60 * 1000); // Check every hour
      } catch (error) {
        console.error("Failed to check for updates:", error);
      }
    };

    checkForUpdates();

    // Cleanup function
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, []);

  const refresh = useCallback(() => {
    if (registration?.waiting) {
      // Tell the waiting service worker to skip waiting and activate
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    }
    // Reload the page
    window.location.reload();
  }, [registration]);

  return {
    updateAvailable,
    refresh,
  };
}

