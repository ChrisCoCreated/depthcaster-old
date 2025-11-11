"use client";

import { useState, useEffect } from "react";
import { Notification } from "@neynar/nodejs-sdk/build/api";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { useNeynarContext } from "@neynar/react";

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
  const [loading, setLoading] = useState(true);

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
    setLoading(false);
  }, []);

  const updatePreference = (key: keyof NotificationPreferences, value: boolean) => {
    const newPreferences = { ...preferences, [key]: value };
    setPreferences(newPreferences);
    localStorage.setItem("notificationPreferences", JSON.stringify(newPreferences));
  };

  if (loading) {
    return <div className="p-4 text-gray-500">Loading settings...</div>;
  }

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Notification Settings
      </h2>
      
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


