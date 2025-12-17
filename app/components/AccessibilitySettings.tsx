"use client";

import { useState, useEffect } from "react";
import { analytics } from "@/lib/analytics";

interface AccessibilityPreferences {
  highContrast: boolean;
  fontSize: 'small' | 'medium' | 'large' | 'extra-large';
  enhancedKeyboardNav: boolean;
}

const DEFAULT_PREFERENCES: AccessibilityPreferences = {
  highContrast: false,
  fontSize: 'medium',
  enhancedKeyboardNav: false,
};

// Event name for notifying other components of preference changes
const PREFERENCES_CHANGED_EVENT = "accessibilityPreferencesChanged";

export function AccessibilitySettings() {
  const [preferences, setPreferences] = useState<AccessibilityPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load preferences from localStorage
    const saved = localStorage.getItem("accessibilityPreferences");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setPreferences({ ...DEFAULT_PREFERENCES, ...parsed });
      } catch (e) {
        console.error("Failed to parse accessibility preferences", e);
      }
    }
    setLoading(false);
  }, []);

  const updatePreference = (key: keyof AccessibilityPreferences, value: boolean | 'small' | 'medium' | 'large' | 'extra-large') => {
    const newPreferences = { ...preferences, [key]: value };
    setPreferences(newPreferences);
    localStorage.setItem("accessibilityPreferences", JSON.stringify(newPreferences));
    
    // Track analytics
    analytics.trackSettingsAccessibilityChange(key, value);
    
    // Dispatch event to notify other components
    window.dispatchEvent(new CustomEvent(PREFERENCES_CHANGED_EVENT));
    
    // Apply classes immediately
    applyAccessibilityClasses(newPreferences);
  };

  const applyAccessibilityClasses = (prefs: AccessibilityPreferences) => {
    if (typeof document === "undefined") return;
    
    const html = document.documentElement;
    const body = document.body;
    
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

  // Apply classes on mount and when preferences change
  useEffect(() => {
    if (!loading) {
      applyAccessibilityClasses(preferences);
    }
  }, [preferences, loading]);

  if (loading) {
    return <div className="p-4 text-gray-500">Loading settings...</div>;
  }

  const fontSizeOptions: { value: 'small' | 'medium' | 'large' | 'extra-large'; label: string; description: string }[] = [
    { value: 'small', label: 'Small', description: '87.5% of default size' },
    { value: 'medium', label: 'Medium', description: 'Default size' },
    { value: 'large', label: 'Large', description: '125% of default size' },
    { value: 'extra-large', label: 'Extra Large', description: '150% of default size' },
  ];

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Accessibility
      </h2>
      
      <div className="space-y-3">
        {/* High Contrast Mode */}
        <label
          className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">🎨</span>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                High Contrast Mode
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Increase color contrast for better visibility
              </span>
            </div>
          </div>
          <input
            type="checkbox"
            checked={preferences.highContrast}
            onChange={(e) => updatePreference("highContrast", e.target.checked)}
            className="w-5 h-5 text-accent-dark rounded focus:ring-accent"
            aria-label="Enable high contrast mode"
          />
        </label>

        {/* Font Size */}
        <div className="p-3 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xl">🔤</span>
            <div className="flex flex-col flex-1">
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Font Size
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Adjust text size for better readability
              </span>
            </div>
          </div>
          <div className="ml-11 space-y-2">
            {fontSizeOptions.map((option) => (
              <label
                key={option.value}
                className="flex items-center gap-2 cursor-pointer"
              >
                <input
                  type="radio"
                  name="fontSize"
                  value={option.value}
                  checked={preferences.fontSize === option.value}
                  onChange={() => updatePreference("fontSize", option.value)}
                  className="w-4 h-4 text-accent-dark focus:ring-accent"
                />
                <div className="flex flex-col">
                  <span className="text-sm text-gray-900 dark:text-gray-100">
                    {option.label}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {option.description}
                  </span>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Enhanced Keyboard Navigation */}
        <label
          className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">⌨️</span>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Enhanced Keyboard Navigation
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Show visible focus indicators and skip links
              </span>
            </div>
          </div>
          <input
            type="checkbox"
            checked={preferences.enhancedKeyboardNav}
            onChange={(e) => updatePreference("enhancedKeyboardNav", e.target.checked)}
            className="w-5 h-5 text-accent-dark rounded focus:ring-accent"
            aria-label="Enable enhanced keyboard navigation"
          />
        </label>
      </div>
    </div>
  );
}

// Utility function to get preferences from localStorage
export function getAccessibilityPreferences(): AccessibilityPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES; // Server-side, return defaults
  
  const saved = localStorage.getItem("accessibilityPreferences");
  if (!saved) {
    return DEFAULT_PREFERENCES;
  }
  
  try {
    const preferences: AccessibilityPreferences = JSON.parse(saved);
    return { ...DEFAULT_PREFERENCES, ...preferences };
  } catch (e) {
    console.error("Failed to parse accessibility preferences", e);
    return DEFAULT_PREFERENCES;
  }
}

