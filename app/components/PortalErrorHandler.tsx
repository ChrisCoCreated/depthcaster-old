"use client";

import { useEffect } from "react";

/**
 * Suppresses React portal cleanup errors that occur during Strict Mode
 * These errors happen when React tries to clean up portals after document.body
 * has been removed or is unavailable, which is common in development/preview.
 */
export function PortalErrorHandler() {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      // Suppress React portal cleanup errors during Strict Mode
      if (
        event.error?.message?.includes("removeChild") ||
        (event.error?.message?.includes("Cannot read properties of null") &&
          event.error?.stack?.includes("removeChild"))
      ) {
        // Check if this is a React portal cleanup error
        const isPortalError = event.error?.stack?.includes("react-dom") ||
          event.error?.stack?.includes("createPortal") ||
          event.filename?.includes(".js?dpl="); // Vercel preview build files
        
        if (isPortalError) {
          event.preventDefault();
          // Silently suppress - this is a known React Strict Mode issue
          return false;
        }
      }
    };

    window.addEventListener("error", handleError);
    
    return () => {
      window.removeEventListener("error", handleError);
    };
  }, []);

  return null;
}














