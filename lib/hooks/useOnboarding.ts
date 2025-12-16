"use client";

import { useState, useEffect } from "react";
import { usePWAInstallation } from "./usePWAInstallation";

const ONBOARDING_COMPLETED_KEY = "sopha_onboarding_completed";
const ONBOARDING_VERSION = "1"; // Increment to show onboarding again

// Check if we're in a miniapp/frame context
function isInMiniappContext(): boolean {
  if (typeof window === "undefined") return false;
  
  // Check if we're in an iframe (miniapp context)
  try {
    if (window.self !== window.top) {
      return true;
    }
  } catch (e) {
    // Cross-origin iframe - likely miniapp
    return true;
  }
  
  // Check for Farcaster miniapp indicators
  if (window.location.search.includes("farcaster") || 
      window.location.search.includes("miniapp") ||
      document.referrer.includes("farcaster")) {
    return true;
  }
  
  return false;
}

export function useOnboarding() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { isStandalone } = usePWAInstallation();

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Don't show onboarding in miniapp context
    if (isInMiniappContext()) {
      setShowOnboarding(false);
      setIsLoading(false);
      return;
    }

    // Check if onboarding has been completed
    const completed = localStorage.getItem(ONBOARDING_COMPLETED_KEY);
    const completedVersion = localStorage.getItem(`${ONBOARDING_COMPLETED_KEY}_version`);

    // Show onboarding if:
    // 1. Running in standalone mode (PWA installed)
    // 2. Onboarding hasn't been completed OR version changed
    const shouldShow = isStandalone && (completed !== "true" || completedVersion !== ONBOARDING_VERSION);

    setShowOnboarding(shouldShow);
    setIsLoading(false);
  }, [isStandalone]);

  const completeOnboarding = () => {
    localStorage.setItem(ONBOARDING_COMPLETED_KEY, "true");
    localStorage.setItem(`${ONBOARDING_COMPLETED_KEY}_version`, ONBOARDING_VERSION);
    setShowOnboarding(false);
  };

  const skipOnboarding = () => {
    completeOnboarding();
  };

  return {
    showOnboarding,
    isLoading,
    completeOnboarding,
    skipOnboarding,
  };
}



