"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { startSession, endSession, trackSessionTime, shouldStartNewSession, analytics } from "@/lib/analytics";

let previousPath: string | null = null;

export function SessionTracker() {
  const pathname = usePathname();

  useEffect(() => {
    // Initialize session tracking
    if (shouldStartNewSession()) {
      startSession();
    }

    // Track page view
    analytics.trackPageView(pathname, previousPath || undefined);
    previousPath = pathname;

    // Track session time periodically (every 30 seconds)
    const sessionInterval = setInterval(() => {
      trackSessionTime();
    }, 30000);

    // Track session time on visibility change (when user returns to tab)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (shouldStartNewSession()) {
          endSession();
          startSession();
        } else {
          trackSessionTime();
        }
      }
    };

    // Track session end on page unload
    const handleBeforeUnload = () => {
      endSession();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      clearInterval(sessionInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [pathname]);

  return null;
}

