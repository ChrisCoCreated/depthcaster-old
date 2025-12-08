"use client";

import { useEffect, useState } from "react";
import { shouldShowOpenInAppBanner, dismissOpenInAppBanner } from "@/lib/pwa-detection";

export function OpenInAppBanner() {
  const [show, setShow] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    // Check if we should show the banner
    const shouldShow = shouldShowOpenInAppBanner();
    setShow(shouldShow);
  }, []);

  const handleDismiss = () => {
    setIsClosing(true);
    dismissOpenInAppBanner();
    
    // Animate out before hiding
    setTimeout(() => {
      setShow(false);
    }, 300);
  };

  const handleOpenInApp = () => {
    // Get current URL
    const currentUrl = window.location.href;
    
    // Try to open in PWA by navigating to the same URL
    // On iOS, if PWA is installed, this should prompt to open in the app
    // We'll use a small delay and then try to open the URL
    // This is a best-effort approach since iOS doesn't allow direct PWA opening
    
    // Store the URL we want to open
    sessionStorage.setItem("pwa_redirect_url", currentUrl);
    
    // Show instructions to user
    // On iOS, the best we can do is show a message
    alert(
      "To open in Depthcaster:\n\n" +
      "1. Tap the Share button (square with arrow)\n" +
      "2. Scroll down and tap 'Add to Home Screen' if not already added\n" +
      "3. Or tap 'Depthcaster' if it appears in the share menu\n\n" +
      "If you already have Depthcaster installed, close Safari and open the Depthcaster app from your home screen."
    );
    
    // Also try to trigger a navigation that might help
    // This is a fallback - iOS limitations prevent automatic opening
    window.location.href = currentUrl;
  };

  if (!show) {
    return null;
  }

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-50 bg-black text-white px-4 py-3 shadow-lg transition-transform duration-300 ${
        isClosing ? "-translate-y-full" : "translate-y-0"
      }`}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">
            Open in Depthcaster for the best experience
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleOpenInApp}
            className="px-3 py-1.5 text-sm font-medium bg-white text-black rounded hover:bg-gray-100 transition-colors"
          >
            Open in App
          </button>
          <button
            onClick={handleDismiss}
            className="p-1.5 text-white hover:bg-white/10 rounded transition-colors"
            aria-label="Dismiss"
          >
            <svg
              className="w-5 h-5"
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
      </div>
    </div>
  );
}

