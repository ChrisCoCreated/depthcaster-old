"use client";

import { useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import { saveNavigationState, getScrollPosition, setPreviousPathname } from "@/lib/navigationHistory";
import { throttle } from "@/lib/feedState";

/**
 * Hook to track navigation history and scroll positions
 * Saves scroll position continuously and restores it when returning to a page
 */
export function useNavigationTracker() {
  const pathname = usePathname();
  const previousPathnameRef = useRef<string | null>(null);
  const scrollRestoredRef = useRef(false);
  const isRestoringScrollRef = useRef(false);
  const throttledSaveScrollRef = useRef<ReturnType<typeof throttle> | null>(null);

  // Save scroll position for current page (throttled)
  const saveScrollPosition = useCallback(() => {
    if (isRestoringScrollRef.current || !previousPathnameRef.current) return;

    const scrollY = window.scrollY || document.documentElement.scrollTop;
    saveNavigationState(previousPathnameRef.current, scrollY);
  }, []);

  // Initialize throttled save function
  useEffect(() => {
    throttledSaveScrollRef.current = throttle(() => {
      saveScrollPosition();
    }, 500);
  }, [saveScrollPosition]);

  // Save scroll position on scroll (throttled) for current page
  useEffect(() => {
    if (!previousPathnameRef.current) return;

    const handleScroll = () => {
      if (throttledSaveScrollRef.current && !isRestoringScrollRef.current) {
        throttledSaveScrollRef.current();
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [pathname, previousPathnameRef.current]);

  // Handle pathname changes and scroll restoration
  useEffect(() => {
    // On initial mount
    if (previousPathnameRef.current === null) {
      previousPathnameRef.current = pathname;
      scrollRestoredRef.current = true;
      return;
    }

    // Pathname changed
    if (previousPathnameRef.current !== pathname) {
      // Save scroll position of the page we're leaving
      let scrollY = window.scrollY || document.documentElement.scrollTop;
      
      if (previousPathnameRef.current === "/") {
        // For home page, ALWAYS use FeedState's scroll position
        // window.scrollY is unreliable because Next.js might have already scrolled to top
        try {
          const { getFeedState } = require("@/lib/feedState");
          // Try all feed types to find the one with saved state
          const curatedState = getFeedState("curated");
          const followingState = getFeedState("following");
          const my37State = getFeedState("my-37");
          const savedState = curatedState || followingState || my37State;
          
          if (savedState?.scrollY !== undefined) {
            scrollY = savedState.scrollY;
            console.log("[NavigationTracker] Using FeedState scroll position for home page", { 
              scrollY,
              feedType: curatedState ? "curated" : followingState ? "following" : "my-37"
            });
          } else {
            console.log("[NavigationTracker] No FeedState found, using window.scrollY", { scrollY });
          }
        } catch (e) {
          console.error("[NavigationTracker] Error getting FeedState", e);
          // Fall back to window.scrollY if FeedState is not available
        }
      }
      
      if (previousPathnameRef.current) {
        saveNavigationState(previousPathnameRef.current, scrollY);
      }

      console.log("[NavigationTracker] Pathname changed", {
        from: previousPathnameRef.current,
        to: pathname,
        savedScrollY: scrollY,
      });

      // Set the previous pathname for back button functionality
      setPreviousPathname(previousPathnameRef.current);

      // Update ref
      previousPathnameRef.current = pathname;
      scrollRestoredRef.current = false;

      // Skip scroll restoration on home page - let Feed component handle it
      if (pathname === "/") {
        console.log("[NavigationTracker] Skipping scroll restoration on home page - Feed will handle it");
        // Don't restore scroll or scroll to top - Feed will handle restoration
        scrollRestoredRef.current = true;
        return;
      }

      // Check if we have a saved scroll position for the page we're navigating to
      const savedScrollY = getScrollPosition(pathname);

      if (savedScrollY !== null && savedScrollY > 0) {
        // Restore scroll position after page renders
        isRestoringScrollRef.current = true;
        setTimeout(() => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              window.scrollTo({ top: savedScrollY, behavior: "auto" });
              isRestoringScrollRef.current = false;
              scrollRestoredRef.current = true;
            });
          });
        }, 100);
      } else {
        // New page or no saved position, scroll to top
        window.scrollTo({ top: 0, behavior: "auto" });
        scrollRestoredRef.current = true;
      }
    }
  }, [pathname]);

  // Save scroll position before page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (previousPathnameRef.current) {
        const scrollY = window.scrollY || document.documentElement.scrollTop;
        saveNavigationState(previousPathnameRef.current, scrollY);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [pathname]);
}
