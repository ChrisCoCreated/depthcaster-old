"use client";

import { useState, useEffect } from "react";
import { useNeynarContext } from "@neynar/react";
import { analytics } from "@/lib/analytics";

const DEFAULT_HIDDEN_BOTS = ["betonbangers", "deepbot", "bracky", "hunttown.eth"];

interface BotSettingsProps {}

export function BotSettings({}: BotSettingsProps) {
  const { user } = useNeynarContext();
  const [hideBots, setHideBots] = useState(true);
  const [hiddenBots, setHiddenBots] = useState<string[]>(DEFAULT_HIDDEN_BOTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newBot, setNewBot] = useState("");

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
          setHideBots(data.hideBots !== undefined ? data.hideBots : true);
          setHiddenBots(data.hiddenBots || DEFAULT_HIDDEN_BOTS);
        }
      } catch (error) {
        console.error("Failed to fetch bot preferences:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPreferences();
  }, [user]);

  const savePreferences = async (updatedHideBots?: boolean, updatedHiddenBots?: string[]) => {
    if (!user?.fid || !user?.signer_uuid) return;

    setSaving(true);
    try {
      const response = await fetch("/api/user/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fid: user.fid,
          signerUuid: user.signer_uuid,
          hideBots: updatedHideBots !== undefined ? updatedHideBots : hideBots,
          hiddenBots: updatedHiddenBots || hiddenBots,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (updatedHideBots !== undefined) {
          setHideBots(data.hideBots);
          analytics.trackSettingsBotChange("hideBots", data.hideBots);
        }
        if (updatedHiddenBots) {
          setHiddenBots(data.hiddenBots);
          analytics.trackSettingsBotChange("hiddenBots", data.hiddenBots);
        }
      }
    } catch (error) {
      console.error("Failed to save bot preferences:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleAddBot = () => {
    const trimmed = newBot.trim().toLowerCase().replace("@", "");
    if (trimmed && !hiddenBots.some((b) => b.toLowerCase() === trimmed)) {
      const updated = [...hiddenBots, trimmed];
      setHiddenBots(updated);
      savePreferences(undefined, updated);
      setNewBot("");
    }
  };

  const handleRemoveBot = (botToRemove: string) => {
    const updated = hiddenBots.filter((b) => b.toLowerCase() !== botToRemove.toLowerCase());
    setHiddenBots(updated);
    savePreferences(undefined, updated);
  };

  const handleAddDefaultBot = (bot: string) => {
    if (!hiddenBots.some((b) => b.toLowerCase() === bot.toLowerCase())) {
      const updated = [...hiddenBots, bot];
      setHiddenBots(updated);
      savePreferences(undefined, updated);
    }
  };

  const handleAddAllDefaults = () => {
    const missingDefaults = DEFAULT_HIDDEN_BOTS.filter(
      (db) => !hiddenBots.some((b) => b.toLowerCase() === db.toLowerCase())
    );
    if (missingDefaults.length > 0) {
      const updated = [...hiddenBots, ...missingDefaults];
      setHiddenBots(updated);
      savePreferences(undefined, updated);
    }
  };

  if (loading) {
    return <div className="p-4 text-gray-500">Loading settings...</div>;
  }

  if (!user?.fid || !user?.signer_uuid) {
    return (
      <div className="p-4 text-gray-500">
        Please sign in to manage bot settings
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Bot Settings
      </h2>

      <div className="p-3 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900">
        <label className="flex items-center justify-between cursor-pointer mb-3">
          <div className="flex items-center gap-3">
            <span className="text-xl">🤖</span>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Hide bots
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Hide casts from bots and casts that mention bots
              </span>
            </div>
          </div>
          <input
            type="checkbox"
            checked={hideBots}
            onChange={(e) => {
              setHideBots(e.target.checked);
              savePreferences(e.target.checked, undefined);
            }}
            disabled={saving}
            className="w-5 h-5 text-accent-dark rounded focus:ring-accent disabled:opacity-50"
          />
        </label>

        {hideBots && (
          <div className="mt-3 ml-7 space-y-2">
            {/* Active bots display */}
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1.5">
                Hidden bots ({hiddenBots.length}):
              </label>
              <div className="flex flex-wrap gap-1.5 p-2 border border-gray-200 dark:border-gray-700 rounded bg-gray-50 dark:bg-gray-900 min-h-[50px] max-h-[120px] overflow-y-auto">
                {hiddenBots.length === 0 ? (
                  <span className="text-xs text-gray-400 dark:text-gray-500 italic">
                    No bots configured
                  </span>
                ) : (
                  hiddenBots.map((bot) => (
                    <span
                      key={bot}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-full text-gray-700 dark:text-gray-300"
                    >
                      @{bot}
                      <button
                        type="button"
                        onClick={() => handleRemoveBot(bot)}
                        className="ml-0.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors text-sm leading-none"
                        aria-label={`Remove @${bot}`}
                      >
                        ×
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* Add new bot */}
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1.5">
                Add bot username:
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={newBot}
                  onChange={(e) => setNewBot(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddBot();
                    }
                  }}
                  placeholder="Enter username (e.g., botname)"
                  className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                />
                <button
                  type="button"
                  onClick={handleAddBot}
                  disabled={!newBot.trim() || saving}
                  className="px-2 py-1 text-xs bg-accent text-white rounded hover:bg-accent-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Default bots section */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs text-gray-600 dark:text-gray-400">
                  Default bots ({DEFAULT_HIDDEN_BOTS.length}):
                </label>
                <button
                  type="button"
                  onClick={handleAddAllDefaults}
                  className="text-xs text-accent-dark dark:text-accent hover:underline"
                >
                  Add all defaults
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 p-2 border border-gray-200 dark:border-gray-700 rounded bg-gray-50 dark:bg-gray-900 max-h-[120px] overflow-y-auto">
                {DEFAULT_HIDDEN_BOTS.map((bot) => {
                  const isActive = hiddenBots.some((b) => b.toLowerCase() === bot.toLowerCase());
                  return (
                    <button
                      key={bot}
                      type="button"
                      onClick={() =>
                        isActive ? handleRemoveBot(bot) : handleAddDefaultBot(bot)
                      }
                      className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
                        isActive
                          ? "bg-accent/40 dark:bg-accent-dark/90 text-accent-dark dark:text-accent border border-accent/60 dark:border-accent-dark"
                          : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                      }`}
                    >
                      {isActive ? "✓ " : "+ "}@{bot}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}



