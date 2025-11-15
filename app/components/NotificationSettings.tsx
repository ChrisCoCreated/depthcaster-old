"use client";

import { useState, useEffect } from "react";
import { useNotificationPermission } from "@/lib/hooks/useNotificationPermission";

interface NotificationPreferences {
  follows: boolean;
  recasts: boolean;
  likes: boolean;
  mentions: boolean;
  replies: boolean;
  quotes: boolean;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  follows: true,
  recasts: true,
  likes: true,
  mentions: true,
  replies: true,
  quotes: true,
};

export function NotificationSettings() {
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [deviceNotificationsEnabled, setDeviceNotificationsEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const { isSupported, isGranted, isDenied, requestPermission } = useNotificationPermission();

  useEffect(() => {
    // Load preferences from localStorage
    const saved = localStorage.getItem("notificationPreferences");
    if (saved) {
      try {
        setPreferences(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse notification preferences", e);
      }
    }
    
    // Load device notification preference
    const deviceEnabled = localStorage.getItem("deviceNotificationsEnabled") === "true";
    setDeviceNotificationsEnabled(deviceEnabled);
    
    setLoading(false);
  }, []);

  const updatePreference = (key: keyof NotificationPreferences, value: boolean) => {
    const newPreferences = { ...preferences, [key]: value };
    setPreferences(newPreferences);
    localStorage.setItem("notificationPreferences", JSON.stringify(newPreferences));
  };

  const handleDeviceNotificationsToggle = async (enabled: boolean) => {
    if (enabled) {
      // Request permission if not already granted
      const granted = await requestPermission();
      if (granted) {
        setDeviceNotificationsEnabled(true);
        localStorage.setItem("deviceNotificationsEnabled", "true");
      } else {
        // Permission denied, don't enable
        setDeviceNotificationsEnabled(false);
        localStorage.setItem("deviceNotificationsEnabled", "false");
      }
    } else {
      setDeviceNotificationsEnabled(false);
      localStorage.setItem("deviceNotificationsEnabled", "false");
    }
  };

  if (loading) {
    return <div className="p-4 text-gray-500">Loading settings...</div>;
  }

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Notification Settings
      </h2>
      
      {/* Device Notifications Toggle */}
      {isSupported && (
        <div className="mb-6 p-4 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900">
          <label className="flex items-center justify-between cursor-pointer">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">🔔</span>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Device Notifications
                </span>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {isGranted
                  ? "Receive notifications on your device when you're not using the app"
                  : isDenied
                  ? "Permission denied. Please enable notifications in your browser settings."
                  : "Enable to receive notifications on your device"}
              </p>
            </div>
            <input
              type="checkbox"
              checked={deviceNotificationsEnabled && isGranted}
              onChange={(e) => handleDeviceNotificationsToggle(e.target.checked)}
              disabled={isDenied}
              className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 disabled:opacity-50"
            />
          </label>
        </div>
      )}
      
      <div className="space-y-3">
        {[
          { key: "follows" as const, label: "New Followers", emoji: "👥" },
          { key: "recasts" as const, label: "Recasts", emoji: "🔄" },
          { key: "likes" as const, label: "Likes", emoji: "❤️" },
          { key: "mentions" as const, label: "Mentions", emoji: "@" },
          { key: "replies" as const, label: "Replies", emoji: "💬" },
          { key: "quotes" as const, label: "Quote Casts", emoji: "💭" },
        ].map(({ key, label, emoji }) => (
          <label
            key={key}
            className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">{emoji}</span>
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {label}
              </span>
            </div>
            <input
              type="checkbox"
              checked={preferences[key]}
              onChange={(e) => updatePreference(key, e.target.checked)}
              className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
            />
          </label>
        ))}
      </div>
    </div>
  );
}






