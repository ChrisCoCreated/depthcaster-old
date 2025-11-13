"use client";

import { useState, useEffect } from "react";

export function usePWAInstallation() {
  const [isInstalled, setIsInstalled] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check if running in standalone mode (PWA installed)
    const isStandaloneMode =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes("android-app://");

    setIsStandalone(isStandaloneMode);
    setIsInstalled(isStandaloneMode);

    // Listen for beforeinstallprompt event (for install prompt)
    // Only prevent default if we want to show a custom install button
    // For now, let the browser show its own prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      // Don't prevent default - let browser show its own install prompt
      // Store the event in case we want to use it later for custom install button
      setDeferredPrompt(e);
      setIsInstalled(false); // Not installed yet, but can be
    };

    // Listen for appinstalled event (when PWA is installed)
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const promptInstall = async (): Promise<boolean> => {
    if (!deferredPrompt) {
      return false;
    }

    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      return outcome === "accepted";
    } catch (error) {
      console.error("Error prompting install:", error);
      return false;
    }
  };

  return {
    isInstalled,
    isStandalone,
    canInstall: !!deferredPrompt,
    promptInstall,
  };
}

