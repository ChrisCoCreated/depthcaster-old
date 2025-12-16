"use client";

import { useState, useEffect } from "react";
import { useNeynarContext } from "@neynar/react";
import { analytics } from "@/lib/analytics";

export function CurationSettings() {
  const { user } = useNeynarContext();
  const [autoLikeOnCurate, setAutoLikeOnCurate] = useState(true);
  const [notifyOnDeepbotCurate, setNotifyOnDeepbotCurate] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.fid || !user?.signer_uuid) {
      setLoading(false);
      return;
    }

    const fetchPreferences = async () => {
      try {
        const response = await fetch(
          `/api/user/preferences?fid=${user.fid}&signerUuid=${user.signer_uuid}`
        );
        if (response.ok) {
          const data = await response.json();
          setAutoLikeOnCurate(data.autoLikeOnCurate !== undefined ? data.autoLikeOnCurate : true);
          setNotifyOnDeepbotCurate(data.notifyOnDeepbotCurate !== undefined ? data.notifyOnDeepbotCurate : true);
        }
      } catch (error) {
        console.error("Failed to fetch curation preferences:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPreferences();
  }, [user]);

  const savePreferences = async (updatedAutoLikeOnCurate?: boolean, updatedNotifyOnDeepbotCurate?: boolean) => {
    if (!user?.fid || !user?.signer_uuid) return;

    setSaving(true);
    try {
      const response = await fetch("/api/user/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fid: user.fid,
          signerUuid: user.signer_uuid,
          autoLikeOnCurate: updatedAutoLikeOnCurate !== undefined ? updatedAutoLikeOnCurate : autoLikeOnCurate,
          notifyOnDeepbotCurate: updatedNotifyOnDeepbotCurate !== undefined ? updatedNotifyOnDeepbotCurate : notifyOnDeepbotCurate,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (updatedAutoLikeOnCurate !== undefined) {
          setAutoLikeOnCurate(data.autoLikeOnCurate);
          analytics.trackCurationSettingsAutoLike(data.autoLikeOnCurate);
        }
        if (updatedNotifyOnDeepbotCurate !== undefined) {
          setNotifyOnDeepbotCurate(data.notifyOnDeepbotCurate);
        }
      }
    } catch (error) {
      console.error("Failed to save curation preferences:", error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-4 text-gray-500">Loading settings...</div>;
  }

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Curation Settings
      </h2>
      
      <div className="space-y-3">
        <label
          className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">❤️</span>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Auto-like curated casts
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Automatically like casts when you curate them (won't apply to casts curated with @deepbot)
              </span>
            </div>
          </div>
          <input
            type="checkbox"
            checked={autoLikeOnCurate}
            onChange={(e) => {
              setAutoLikeOnCurate(e.target.checked);
              savePreferences(e.target.checked, undefined);
            }}
            disabled={saving}
            className="w-5 h-5 text-accent-dark rounded focus:ring-accent disabled:opacity-50"
          />
        </label>

        <label
          className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">🔔</span>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Notify when @deepbot curates your cast
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Get notified when someone uses @deepbot to curate one of your casts
              </span>
            </div>
          </div>
          <input
            type="checkbox"
            checked={notifyOnDeepbotCurate}
            onChange={(e) => {
              setNotifyOnDeepbotCurate(e.target.checked);
              savePreferences(undefined, e.target.checked);
            }}
            disabled={saving}
            className="w-5 h-5 text-accent-dark rounded focus:ring-accent disabled:opacity-50"
          />
        </label>
      </div>
    </div>
  );
}




