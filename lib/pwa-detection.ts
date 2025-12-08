/**
 * PWA Detection Utilities
 * 
 * Detects if the app is running in PWA mode (standalone) vs Safari,
 * and tracks PWA installation status.
 */

/**
 * Check if the app is running in standalone/PWA mode
 * Returns true if running as an installed PWA, false if in a browser
 */
export function isStandalone(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  // iOS Safari detection
  if ((window.navigator as any).standalone === true) {
    return true;
  }

  // Other platforms: check display-mode media query
  if (window.matchMedia("(display-mode: standalone)").matches) {
    return true;
  }

  return false;
}

/**
 * Check if running in Safari on iOS
 * Returns true if on iOS Safari (not in PWA mode)
 */
export function isSafariIOS(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const userAgent = window.navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream;
  
  if (!isIOS) {
    return false;
  }

  // On iOS, if standalone is false, we're in Safari
  // If standalone is true, we're in PWA mode
  return (window.navigator as any).standalone === false;
}

/**
 * Check if PWA is likely installed
 * Uses localStorage flag that gets set when PWA is first opened
 */
export function isPWAInstalled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const installed = localStorage.getItem("pwa_installed");
  return installed === "true";
}

/**
 * Mark PWA as installed in localStorage
 * Should be called when PWA is first opened in standalone mode
 */
export function markPWAInstalled(): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem("pwa_installed", "true");
}

/**
 * Check if we should show the "Open in App" banner
 * Returns true if:
 * - Running in Safari (not PWA mode)
 * - PWA is likely installed
 * - Banner hasn't been permanently dismissed
 */
export function shouldShowOpenInAppBanner(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  // Don't show if already in PWA mode
  if (isStandalone()) {
    return false;
  }

  // Only show on iOS Safari
  if (!isSafariIOS()) {
    return false;
  }

  // Check if banner was permanently dismissed
  const dismissed = localStorage.getItem("pwa_banner_dismissed");
  if (dismissed === "true") {
    return false;
  }

  // Show if PWA is likely installed
  return isPWAInstalled();
}

/**
 * Permanently dismiss the "Open in App" banner
 */
export function dismissOpenInAppBanner(): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem("pwa_banner_dismissed", "true");
}

/**
 * Initialize PWA tracking
 * Should be called on app load to detect and track PWA installation
 */
export function initializePWATracking(): void {
  if (typeof window === "undefined") {
    return;
  }

  // If we're in standalone mode, mark PWA as installed
  if (isStandalone()) {
    markPWAInstalled();
  }
}

