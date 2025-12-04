"use client";

import { useRouter, usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { getPreviousNavigation, saveNavigationState } from "@/lib/navigationHistory";

/**
 * Back button component that navigates to previous page and restores scroll position
 */
export function BackButton() {
  const router = useRouter();
  const pathname = usePathname();
  const [hasHistory, setHasHistory] = useState(false);

  // Check if there's previous navigation history
  useEffect(() => {
    const checkHistory = () => {
      // Don't show back button in miniapp context
      if (pathname?.startsWith("/miniapp")) {
        setHasHistory(false);
        return;
      }
      
      const previousNav = getPreviousNavigation();
      // Show button if there's history and we're not on the home page
      // Or if there's history and the previous page is different from current
      const shouldShow = previousNav !== null && 
                        previousNav.pathname !== pathname &&
                        pathname !== "/";
      setHasHistory(shouldShow);
    };

    checkHistory();
    // Re-check periodically in case history changes
    const interval = setInterval(checkHistory, 500);
    return () => clearInterval(interval);
  }, [pathname]);

  const handleBack = () => {
    const previousNav = getPreviousNavigation();
    
    console.log("[BackButton] Back button clicked", {
      currentPathname: pathname,
      currentScrollY: window.scrollY || document.documentElement.scrollTop,
      previousNav,
    });
    
    if (!previousNav) {
      console.log("[BackButton] No previous navigation, using browser back");
      // Fallback to browser back if no saved history
      router.back();
      return;
    }

    // Save current page's scroll position before navigating
    const currentScrollY = window.scrollY || document.documentElement.scrollTop;
    saveNavigationState(pathname, currentScrollY);

    console.log("[BackButton] Navigating to previous page", {
      previousPathname: previousNav.pathname,
      previousScrollY: previousNav.scrollY,
    });

    // Navigate to previous page
    // The useNavigationTracker hook will detect the pathname change and restore scroll position
    router.push(previousNav.pathname);
  };

  if (!hasHistory) {
    return null;
  }

  return (
    <button
      onClick={handleBack}
      className="fixed top-20 left-4 z-[150] p-2 rounded-full bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm border border-gray-200 dark:border-gray-800 shadow-lg hover:bg-white dark:hover:bg-gray-900 transition-colors"
      aria-label="Go back"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)',
      }}
    >
      <ArrowLeft className="w-5 h-5 text-gray-700 dark:text-gray-300" />
    </button>
  );
}
