"use client";

import { useEffect } from "react";
import { getAccessibilityPreferences } from "./AccessibilitySettings";
import { SkipLinks } from "./SkipLinks";

export function AccessibilityManager() {
  useEffect(() => {
    // Apply accessibility classes on mount
    const applyClasses = () => {
      if (typeof document === "undefined") return;
      
      const prefs = getAccessibilityPreferences();
      const html = document.documentElement;
      
      // High contrast
      if (prefs.highContrast) {
        html.classList.add("high-contrast");
      } else {
        html.classList.remove("high-contrast");
      }
      
      // Font size
      html.classList.remove("font-size-small", "font-size-medium", "font-size-large", "font-size-extra-large");
      html.classList.add(`font-size-${prefs.fontSize}`);
      
      // Enhanced keyboard navigation
      if (prefs.enhancedKeyboardNav) {
        html.classList.add("enhanced-focus");
      } else {
        html.classList.remove("enhanced-focus");
      }
    };

    applyClasses();

    // Listen for preference changes
    const handleChange = () => {
      applyClasses();
    };

    window.addEventListener("accessibilityPreferencesChanged", handleChange);
    return () => {
      window.removeEventListener("accessibilityPreferencesChanged", handleChange);
    };
  }, []);

  return <SkipLinks />;
}

