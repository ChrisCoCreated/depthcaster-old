"use client";

import { useState, useEffect } from "react";
import { useNotificationPermission } from "@/lib/hooks/useNotificationPermission";
import { useNeynarContext } from "@neynar/react";
import { analytics } from "@/lib/analytics";
import { hasPlusRole } from "@/lib/roles-client";
import Link from "next/link";

interface NotificationPreferences {
  follows: boolean;
  recasts: boolean;
  likes: boolean;
  mentions: boolean;
  replies: boolean;
  quotes: boolean;
}

interface CuratedCastPreferences {
  notifyOnQualityReply: boolean;
  qualityReplyThreshold: number;
  notifyOnCurated: boolean;
  notifyOnLiked: boolean;
  notifyOnRecast: boolean;
  notifyOnDailyStats: boolean;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  follows: true,
  recasts: true,
  likes: true,
  mentions: true,
  replies: true,
  quotes: true,
};

const DEFAULT_CURATED_PREFERENCES: CuratedCastPreferences = {
  notifyOnQualityReply: true,
  qualityReplyThreshold: 60,
  notifyOnCurated: false,
  notifyOnLiked: true,
  notifyOnRecast: false,
  notifyOnDailyStats: true,
};

export function NotificationSettings() {
  const { user } = useNeynarContext();
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [curatedPreferences, setCuratedPreferences] = useState<CuratedCastPreferences>(DEFAULT_CURATED_PREFERENCES);
  const [deviceNotificationsEnabled, setDeviceNotificationsEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasPlus, setHasPlus] = useState(false);
  const [isCheckingPlus, setIsCheckingPlus] = useState(true);
  const { isSupported, isGranted, isDenied, requestPermission, isServiceWorkerSupported } = useNotificationPermission();

  useEffect(() => {
    // Load preferences from localStorage (for Neynar notification types)
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
    
    // Check for plus role
    const checkPlusRole = async () => {
      if (!user?.fid) {
        setHasPlus(false);
        setIsCheckingPlus(false);
        return;
      }

      try {
        const response = await fetch(`/api/admin/check?fid=${user.fid}`);
        if (response.ok) {
          const data = await response.json();
          const roles = data.roles || [];
          setHasPlus(hasPlusRole(roles));
        } else {
          setHasPlus(false);
        }
      } catch (error) {
        console.error("Error checking plus role:", error);
        setHasPlus(false);
      } finally {
        setIsCheckingPlus(false);
      }
    };

    checkPlusRole();
    
    // Load curated cast preferences from database
    if (user?.fid && user?.signer_uuid) {
      const fetchCuratedPreferences = async () => {
        try {
          const response = await fetch(
            `/api/user/preferences?fid=${user.fid}&signerUuid=${user.signer_uuid}`
          );
          if (response.ok) {
            const data = await response.json();
            setCuratedPreferences({
              notifyOnQualityReply: data.notifyOnQualityReply !== undefined ? data.notifyOnQualityReply : true,
              qualityReplyThreshold: data.qualityReplyThreshold !== undefined ? data.qualityReplyThreshold : 60,
              notifyOnCurated: data.notifyOnCurated !== undefined ? data.notifyOnCurated : false,
              notifyOnLiked: data.notifyOnLiked !== undefined ? data.notifyOnLiked : true,
              notifyOnRecast: data.notifyOnRecast !== undefined ? data.notifyOnRecast : false,
              notifyOnDailyStats: data.notifyOnDailyStats !== undefined ? data.notifyOnDailyStats : true,
            });
          }
        } catch (error) {
          console.error("Failed to fetch curated cast preferences:", error);
        } finally {
          setLoading(false);
        }
      };
      fetchCuratedPreferences();
    } else {
      setLoading(false);
    }
  }, [user]);

  const updatePreference = (key: keyof NotificationPreferences, value: boolean) => {
    const newPreferences = { ...preferences, [key]: value };
    setPreferences(newPreferences);
    localStorage.setItem("notificationPreferences", JSON.stringify(newPreferences));
    
    // Track analytics
    analytics.trackSettingsNotificationChange(key, value);
  };

  const saveCuratedPreferences = async (updates: Partial<CuratedCastPreferences>) => {
    if (!user?.fid || !user?.signer_uuid) return;

    setSaving(true);
    try {
      const updatedPreferences = { ...curatedPreferences, ...updates };
      const response = await fetch("/api/user/preferences", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fid: user.fid,
          signerUuid: user.signer_uuid,
          ...updatedPreferences,
        }),
      });

      if (response.ok) {
        setCuratedPreferences(updatedPreferences);
      } else {
        console.error("Failed to save curated cast preferences");
      }
    } catch (error) {
      console.error("Error saving curated cast preferences:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeviceNotificationsToggle = async (enabled: boolean) => {
    if (enabled) {
      // Request permission if not already granted
      const granted = await requestPermission();
      if (granted) {
        setDeviceNotificationsEnabled(true);
        localStorage.setItem("deviceNotificationsEnabled", "true");
      } else {
        // Permission denied or not granted, don't enable
        setDeviceNotificationsEnabled(false);
        localStorage.setItem("deviceNotificationsEnabled", "false");
      }
    } else {
      // Always allow toggling off, even if permission is denied
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
      {/* Note: This setting only controls OS-level device notifications, not what appears in the notification panel */}
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
                {!isServiceWorkerSupported
                  ? "Service worker not available. Notifications will work once service worker is ready."
                  : isGranted
                  ? "Receive OS-level notifications on your device when you're not using the app. This does not affect what appears in the notification panel."
                  : isDenied
                  ? "Permission denied. You can still toggle this setting off. To enable, allow notifications in your browser settings."
                  : "Enable to receive OS-level notifications on your device. This only controls system notifications, not the notification panel."}
              </p>
            </div>
            <input
              type="checkbox"
              checked={deviceNotificationsEnabled}
              onChange={(e) => handleDeviceNotificationsToggle(e.target.checked)}
              disabled={isDenied && !deviceNotificationsEnabled}
              className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 disabled:opacity-50"
            />
          </label>
        </div>
      )}
      
      {/* Neynar Notifications Section */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Neynar Notifications
          </h3>
          {!isCheckingPlus && !hasPlus && (
            <span className="text-xs px-2 py-1 bg-amber-100 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 rounded-full">
              Plus Required
            </span>
          )}
        </div>
        {!isCheckingPlus && !hasPlus && (
          <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-sm text-amber-800 dark:text-amber-200 mb-2">
              <strong>Neynar notifications require Plus.</strong> These notifications (follows, recasts, likes, mentions, replies, quotes) are powered by Neynar and require a Plus subscription.
            </p>
            <Link
              href="/upgrade"
              className="inline-block px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors text-sm font-medium"
            >
              Upgrade to Plus
            </Link>
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
              className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer ${
                !hasPlus && !isCheckingPlus
                  ? "border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 opacity-75"
                  : "border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">{emoji}</span>
                <span className={`text-sm font-medium ${
                  !hasPlus && !isCheckingPlus
                    ? "text-gray-500 dark:text-gray-500"
                    : "text-gray-900 dark:text-gray-100"
                }`}>
                  {label}
                </span>
              </div>
              <input
                type="checkbox"
                checked={preferences[key]}
                onChange={(e) => updatePreference(key, e.target.checked)}
                disabled={!hasPlus && !isCheckingPlus}
                className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </label>
          ))}
        </div>
      </div>

      {/* Curated Cast Notifications Section */}
      <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-800">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Curated Cast Notifications
        </h3>
        
        <div className="space-y-4">
          {/* Quality Reply Notifications */}
          <div className="p-4 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900">
            <label className="flex items-center justify-between cursor-pointer mb-3">
              <div className="flex items-center gap-3">
                <span className="text-xl">⭐</span>
                <div>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    Quality Reply Notifications
                  </span>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    Get notified when someone posts a quality reply to a cast you curated
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={curatedPreferences.notifyOnQualityReply}
                onChange={(e) => saveCuratedPreferences({ notifyOnQualityReply: e.target.checked })}
                disabled={saving}
                className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 disabled:opacity-50"
              />
            </label>
            
            {curatedPreferences.notifyOnQualityReply && (
              <div className="mt-3 pl-8">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Quality Threshold: {curatedPreferences.qualityReplyThreshold}
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={curatedPreferences.qualityReplyThreshold}
                  onChange={(e) => {
                    const threshold = parseInt(e.target.value, 10);
                    saveCuratedPreferences({ qualityReplyThreshold: threshold });
                  }}
                  disabled={saving}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 disabled:opacity-50"
                />
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                  <span>0</span>
                  <span>100</span>
                </div>
              </div>
            )}
          </div>

          {/* Other Curated Cast Notifications */}
          {[
            { key: "notifyOnCurated" as const, label: "When Cast is Curated", emoji: "✨", description: "Get notified when someone else curates a cast you curated" },
            { key: "notifyOnLiked" as const, label: "When Cast is Liked", emoji: "❤️", description: "Get notified when someone likes a cast you curated (within DepthCaster)" },
            { key: "notifyOnRecast" as const, label: "When Cast is Recast", emoji: "🔄", description: "Get notified when someone recasts a cast you curated (within DepthCaster)" },
            { key: "notifyOnDailyStats" as const, label: "Daily Stats Summary", emoji: "📊", description: "Receive a daily notification with statistics from the past 24 hours" },
          ].map(({ key, label, emoji, description }) => (
            <label
              key={key}
              className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">{emoji}</span>
                <div>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {label}
                  </span>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    {description}
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={curatedPreferences[key]}
                onChange={(e) => saveCuratedPreferences({ [key]: e.target.checked })}
                disabled={saving}
                className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 disabled:opacity-50"
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}









