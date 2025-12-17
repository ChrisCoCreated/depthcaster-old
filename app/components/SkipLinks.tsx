"use client";

import { useEffect, useState } from "react";
import { getAccessibilityPreferences } from "./AccessibilitySettings";

export function SkipLinks() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Check if enhanced keyboard navigation is enabled
    const checkEnabled = () => {
      const prefs = getAccessibilityPreferences();
      setIsEnabled(prefs.enhancedKeyboardNav);
    };

    checkEnabled();

    // Listen for preference changes
    const handleChange = () => {
      checkEnabled();
    };

    window.addEventListener("accessibilityPreferencesChanged", handleChange);
    return () => {
      window.removeEventListener("accessibilityPreferencesChanged", handleChange);
    };
  }, []);

  if (!mounted || !isEnabled) {
    return null;
  }

  return (
    <div className="skip-links">
      <a
        href="#main-content"
        className="skip-link"
        onClick={(e) => {
          e.preventDefault();
          const main = document.getElementById("main-content");
          if (main) {
            main.focus();
            main.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }}
      >
        Skip to main content
      </a>
      <a
        href="#navigation"
        className="skip-link"
        onClick={(e) => {
          e.preventDefault();
          const nav = document.getElementById("navigation") || document.querySelector("header");
          if (nav) {
            (nav as HTMLElement).focus();
            nav.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }}
      >
        Skip to navigation
      </a>
    </div>
  );
}

