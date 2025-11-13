"use client";

import { useState, useEffect, useRef } from "react";

interface FeedPreferences {
  hideDollarCasts: boolean;
  hideShortCasts: boolean;
  minCastLength: number;
  hideImages: boolean;
  hideTradingWords: boolean;
  tradingWords: string[];
}

const DEFAULT_TRADING_WORDS = [
  "trading",
  "trade",
  "buy",
  "sell",
  "pump",
  "dump",
  "hodl",
  "moon",
  "lambo",
  "bullish",
  "bearish",
  "crypto",
  "bitcoin",
  "btc",
  "ethereum",
  "eth",
  "altcoin",
  "defi",
  "nft",
  "token",
  "coin",
  "market",
  "price",
  "chart",
  "technical analysis",
  "ta",
  "support",
  "resistance",
  "breakout",
  "dip",
  "rally",
  "clanker",
];

const DEFAULT_PREFERENCES: FeedPreferences = {
  hideDollarCasts: false, // Default to off
  hideShortCasts: false, // Default to off
  minCastLength: 100, // Default minimum length when enabled
  hideImages: false, // Default to off
  hideTradingWords: false, // Default to off
  tradingWords: DEFAULT_TRADING_WORDS,
};

// Event name for notifying other components of preference changes
const PREFERENCES_CHANGED_EVENT = "feedPreferencesChanged";

export function FeedSettings() {
  const [preferences, setPreferences] = useState<FeedPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load preferences from localStorage
    const saved = localStorage.getItem("feedPreferences");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Ensure tradingWords exists and is an array
        if (!parsed.tradingWords || !Array.isArray(parsed.tradingWords)) {
          parsed.tradingWords = DEFAULT_TRADING_WORDS;
        }
        setPreferences({ ...DEFAULT_PREFERENCES, ...parsed });
      } catch (e) {
        console.error("Failed to parse feed preferences", e);
      }
    }
    setLoading(false);
  }, []);

  const updatePreference = (key: keyof FeedPreferences, value: boolean | number | string[]) => {
    const newPreferences = { ...preferences, [key]: value };
    setPreferences(newPreferences);
    localStorage.setItem("feedPreferences", JSON.stringify(newPreferences));
    // Dispatch event to notify other components
    window.dispatchEvent(new CustomEvent(PREFERENCES_CHANGED_EVENT));
  };

  if (loading) {
    return <div className="p-4 text-gray-500">Loading settings...</div>;
  }

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Feed Settings
      </h2>
      
      <div className="space-y-3">
        <label
          className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">💰</span>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Hide casts with $
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Hide all casts containing a dollar sign
              </span>
            </div>
          </div>
          <input
            type="checkbox"
            checked={preferences.hideDollarCasts}
            onChange={(e) => updatePreference("hideDollarCasts", e.target.checked)}
            className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
          />
        </label>

        <div className="p-3 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900">
          <label className="flex items-center justify-between cursor-pointer">
            <div className="flex items-center gap-3">
              <span className="text-xl">📏</span>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Hide short casts
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Hide casts shorter than the specified length
                </span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={preferences.hideShortCasts}
              onChange={(e) => updatePreference("hideShortCasts", e.target.checked)}
              className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
            />
          </label>
          {preferences.hideShortCasts && (
            <div className="mt-3 ml-11 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-600 dark:text-gray-400">Minimum length:</span>
                <div className="flex items-center gap-1.5">
                  {[50, 100, 250, 500].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => updatePreference("minCastLength", value)}
                      className={`px-2 py-1 text-xs rounded transition-colors ${
                        preferences.minCastLength === value
                          ? "bg-blue-600 text-white"
                          : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                      }`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={preferences.minCastLength}
                  onChange={(e) => {
                    const value = parseInt(e.target.value);
                    if (!isNaN(value) && value >= 1 && value <= 500) {
                      updatePreference("minCastLength", value);
                    }
                  }}
                  className="w-20 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-xs text-gray-500 dark:text-gray-400">characters</span>
              </div>
            </div>
          )}
        </div>

        <div className="p-3 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900">
          <label className="flex items-center justify-between cursor-pointer mb-3">
            <div className="flex items-center gap-3">
              <span className="text-xl">📈</span>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Hide trading & other words
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Hide casts containing trading-related words
                </span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={preferences.hideTradingWords}
              onChange={(e) => updatePreference("hideTradingWords", e.target.checked)}
              className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
            />
          </label>
          {preferences.hideTradingWords && (
            <TradingWordsEditor
              words={preferences.tradingWords || DEFAULT_TRADING_WORDS}
              defaultWords={DEFAULT_TRADING_WORDS}
              onWordsChange={(words) => updatePreference("tradingWords", words)}
            />
          )}
        </div>

        <label
          className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">🖼️</span>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Hide images
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Hide all image embeds in casts
              </span>
            </div>
          </div>
          <input
            type="checkbox"
            checked={preferences.hideImages}
            onChange={(e) => updatePreference("hideImages", e.target.checked)}
            className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
          />
        </label>
      </div>
    </div>
  );
}

interface TradingWordsEditorProps {
  words: string[];
  defaultWords: string[];
  onWordsChange: (words: string[]) => void;
}

function TradingWordsEditor({ words, defaultWords, onWordsChange }: TradingWordsEditorProps) {
  const [newWord, setNewWord] = useState("");
  const [showDefaults, setShowDefaults] = useState(false);

  const handleAddWord = () => {
    const trimmed = newWord.trim().toLowerCase();
    if (trimmed && !words.some((w) => w.toLowerCase() === trimmed)) {
      onWordsChange([...words, trimmed]);
      setNewWord("");
    }
  };

  const handleRemoveWord = (wordToRemove: string) => {
    onWordsChange(words.filter((w) => w.toLowerCase() !== wordToRemove.toLowerCase()));
  };

  const handleAddDefaultWord = (word: string) => {
    if (!words.some((w) => w.toLowerCase() === word.toLowerCase())) {
      onWordsChange([...words, word]);
    }
  };

  const handleAddAllDefaults = () => {
    const missingDefaults = defaultWords.filter(
      (dw) => !words.some((w) => w.toLowerCase() === dw.toLowerCase())
    );
    onWordsChange([...words, ...missingDefaults]);
  };

  return (
    <div className="mt-2 ml-7 space-y-2">
      {/* Active words display */}
      <div>
        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1.5">
          Active words ({words.length}):
        </label>
        <div className="flex flex-wrap gap-1.5 p-2 border border-gray-200 dark:border-gray-700 rounded bg-gray-50 dark:bg-gray-900 min-h-[50px] max-h-[120px] overflow-y-auto">
          {words.length === 0 ? (
            <span className="text-xs text-gray-400 dark:text-gray-500 italic">
              No words configured
            </span>
          ) : (
            words.map((word) => (
              <span
                key={word}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-full text-gray-700 dark:text-gray-300"
              >
                {word}
                <button
                  type="button"
                  onClick={() => handleRemoveWord(word)}
                  className="ml-0.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors text-sm leading-none"
                  aria-label={`Remove ${word}`}
                >
                  ×
                </button>
              </span>
            ))
          )}
        </div>
      </div>

      {/* Add new word */}
      <div>
        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1.5">
          Add custom word:
        </label>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={newWord}
            onChange={(e) => setNewWord(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddWord();
              }
            }}
            placeholder="Enter word..."
            className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />
          <button
            type="button"
            onClick={handleAddWord}
            disabled={!newWord.trim()}
            className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Add
          </button>
        </div>
      </div>

      {/* Default words section */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-xs text-gray-600 dark:text-gray-400">
            Default words ({defaultWords.length}):
          </label>
          <button
            type="button"
            onClick={() => setShowDefaults(!showDefaults)}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            {showDefaults ? "Hide" : "Show"}
          </button>
        </div>
        {showDefaults && (
          <div className="space-y-1.5">
            <div className="flex flex-wrap gap-1.5 p-2 border border-gray-200 dark:border-gray-700 rounded bg-gray-50 dark:bg-gray-900 max-h-[120px] overflow-y-auto">
              {defaultWords.map((word) => {
                const isActive = words.some((w) => w.toLowerCase() === word.toLowerCase());
                return (
                  <button
                    key={word}
                    type="button"
                    onClick={() =>
                      isActive ? handleRemoveWord(word) : handleAddDefaultWord(word)
                    }
                    className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
                      isActive
                        ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700"
                        : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                    }`}
                  >
                    {isActive ? "✓ " : "+ "}
                    {word}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={handleAddAllDefaults}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              Add all defaults
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Utility function to get preferences from localStorage
export function getFeedPreferences(): FeedPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES; // Server-side, return defaults
  
  const saved = localStorage.getItem("feedPreferences");
  if (!saved) {
    return DEFAULT_PREFERENCES;
  }
  
  try {
    const preferences: FeedPreferences = JSON.parse(saved);
    // Merge with defaults to ensure all fields exist
    const merged = { ...DEFAULT_PREFERENCES, ...preferences };
    // Ensure tradingWords is an array
    if (!merged.tradingWords || !Array.isArray(merged.tradingWords)) {
      merged.tradingWords = DEFAULT_TRADING_WORDS;
    }
    return merged;
  } catch (e) {
    console.error("Failed to parse feed preferences", e);
    return DEFAULT_PREFERENCES;
  }
}

// Utility function to check if a cast should be hidden based on preferences
export function shouldHideCast(cast: { text?: string }): boolean {
  if (typeof window === "undefined") return false; // Server-side, don't filter
  
  const preferences = getFeedPreferences();
  
  // Check dollar sign filter
  if (preferences.hideDollarCasts && cast.text?.includes("$")) {
    return true;
  }
  
  // Check short cast filter
  if (preferences.hideShortCasts && cast.text && cast.text.length < preferences.minCastLength) {
    return true;
  }
  
  // Check trading words filter
  if (preferences.hideTradingWords && cast.text && preferences.tradingWords.length > 0) {
    const textLower = cast.text.toLowerCase();
    const hasTradingWord = preferences.tradingWords.some((word) =>
      textLower.includes(word.toLowerCase())
    );
    if (hasTradingWord) {
      return true;
    }
  }
  
  return false;
}

// Utility function to check if images should be hidden
export function shouldHideImages(): boolean {
  if (typeof window === "undefined") return false; // Server-side, don't filter
  
  const preferences = getFeedPreferences();
  return preferences.hideImages;
}

interface Curator {
  fid: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
}

interface CuratorFilterProps {
  selectedCuratorFids: number[];
  onCuratorFidsChange: (fids: number[]) => void;
}

function CuratorFilter({ selectedCuratorFids, onCuratorFidsChange }: CuratorFilterProps) {
  const [curators, setCurators] = useState<Curator[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const fetchCurators = async () => {
      try {
        const response = await fetch("/api/curators");
        if (response.ok) {
          const data = await response.json();
          setCurators(data.curators || []);
        }
      } catch (error) {
        console.error("Failed to fetch curators:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchCurators();
  }, []);

  const toggleCurator = (fid: number) => {
    if (selectedCuratorFids.includes(fid)) {
      onCuratorFidsChange(selectedCuratorFids.filter((f) => f !== fid));
    } else {
      onCuratorFidsChange([...selectedCuratorFids, fid]);
    }
  };

  const selectAll = () => {
    onCuratorFidsChange(curators.map((c) => c.fid));
  };

  const deselectAll = () => {
    onCuratorFidsChange([]);
  };

  if (loading) {
    return (
      <div className="py-2 text-xs text-gray-500 dark:text-gray-400">
        Loading curators...
      </div>
    );
  }

  if (curators.length === 0) {
    return null;
  }

  const allSelected = curators.length > 0 && selectedCuratorFids.length === curators.length;
  const noneSelected = selectedCuratorFids.length === 0;

  return (
    <div className="py-2">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-base">👤</span>
          <span className="text-sm text-gray-700 dark:text-gray-300">Filter by curator</span>
        </div>
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          {isExpanded ? "Hide" : "Show"}
        </button>
      </div>

      {selectedCuratorFids.length > 0 && (
        <div className="mb-2 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-600 dark:text-gray-400">
            {selectedCuratorFids.length} of {curators.length} selected
          </span>
          {!allSelected && (
            <button
              type="button"
              onClick={selectAll}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              Select all
            </button>
          )}
          {!noneSelected && (
            <button
              type="button"
              onClick={deselectAll}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              Deselect all
            </button>
          )}
        </div>
      )}

      {isExpanded && (
        <div className="mt-2 space-y-1.5 max-h-[200px] overflow-y-auto">
          {curators.map((curator) => {
            const isSelected = selectedCuratorFids.includes(curator.fid);
            const displayName = curator.displayName || curator.username || `@user${curator.fid}`;
            return (
              <label
                key={curator.fid}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleCurator(curator.fid)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                {curator.pfpUrl && (
                  <img
                    src={curator.pfpUrl}
                    alt={displayName}
                    className="w-5 h-5 rounded-full"
                  />
                )}
                <span className="text-xs text-gray-700 dark:text-gray-300 flex-1">
                  {displayName}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Inline version of feed settings for display at top of feeds
export function FeedSettingsInline({ feedType }: { feedType?: string }) {
  const [preferences, setPreferences] = useState<FeedPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    // Load preferences from localStorage
    const saved = localStorage.getItem("feedPreferences");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Ensure tradingWords exists and is an array
        if (!parsed.tradingWords || !Array.isArray(parsed.tradingWords)) {
          parsed.tradingWords = DEFAULT_TRADING_WORDS;
        }
        setPreferences({ ...DEFAULT_PREFERENCES, ...parsed });
      } catch (e) {
        console.error("Failed to parse feed preferences", e);
      }
    }
    setLoading(false);
  }, []);

  // Listen for preference changes from other components
  useEffect(() => {
    const handlePreferencesChange = () => {
      const saved = localStorage.getItem("feedPreferences");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // Ensure tradingWords exists and is an array
          if (!parsed.tradingWords || !Array.isArray(parsed.tradingWords)) {
            parsed.tradingWords = DEFAULT_TRADING_WORDS;
          }
          setPreferences({ ...DEFAULT_PREFERENCES, ...parsed });
        } catch (e) {
          console.error("Failed to parse feed preferences", e);
        }
      }
    };
    window.addEventListener("feedPreferencesChanged", handlePreferencesChange);
    return () => {
      window.removeEventListener("feedPreferencesChanged", handlePreferencesChange);
    };
  }, []);

  const updatePreference = (key: keyof FeedPreferences, value: boolean | number | string[]) => {
    const newPreferences = { ...preferences, [key]: value };
    setPreferences(newPreferences);
    localStorage.setItem("feedPreferences", JSON.stringify(newPreferences));
    // Dispatch event to notify other components
    window.dispatchEvent(new CustomEvent(PREFERENCES_CHANGED_EVENT));
  };

  if (loading) {
    return null;
  }

  // Count active filters
  const activeFiltersCount = [
    preferences.hideDollarCasts,
    preferences.hideShortCasts,
    preferences.hideImages,
    preferences.hideTradingWords,
  ].filter(Boolean).length;

  return (
    <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-black">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Filters
          </span>
          {activeFiltersCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full">
              {activeFiltersCount}
            </span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform ${
            isExpanded ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-2 border-t border-gray-200 dark:border-gray-800">
          {/* Dollar sign filter */}
          <label className="flex items-center justify-between py-2 cursor-pointer">
            <div className="flex items-center gap-2">
              <span className="text-base">💰</span>
              <span className="text-sm text-gray-700 dark:text-gray-300">Hide casts with $</span>
            </div>
            <input
              type="checkbox"
              checked={preferences.hideDollarCasts}
              onChange={(e) => updatePreference("hideDollarCasts", e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
          </label>

          {/* Short casts filter */}
          <div className="py-2">
            <label className="flex items-center justify-between cursor-pointer">
              <div className="flex items-center gap-2">
                <span className="text-base">📏</span>
                <span className="text-sm text-gray-700 dark:text-gray-300">Hide short casts</span>
              </div>
              <input
                type="checkbox"
                checked={preferences.hideShortCasts}
                onChange={(e) => updatePreference("hideShortCasts", e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
            </label>
            {preferences.hideShortCasts && (
              <div className="mt-2 ml-7 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-600 dark:text-gray-400">Min length:</span>
                  <div className="flex items-center gap-1.5">
                    {[50, 100, 250, 500].map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => updatePreference("minCastLength", value)}
                        className={`px-2 py-0.5 text-xs rounded transition-colors ${
                          preferences.minCastLength === value
                            ? "bg-blue-600 text-white"
                            : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                        }`}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={preferences.minCastLength}
                    onChange={(e) => {
                      const value = parseInt(e.target.value);
                      if (!isNaN(value) && value >= 1 && value <= 500) {
                        updatePreference("minCastLength", value);
                      }
                    }}
                    className="w-16 px-1.5 py-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-xs text-gray-500 dark:text-gray-400">chars</span>
                </div>
              </div>
            )}
          </div>

          {/* Trading words filter */}
          <div className="py-2">
            <label className="flex items-center justify-between cursor-pointer">
              <div className="flex items-center gap-2">
                <span className="text-base">📈</span>
                <span className="text-sm text-gray-700 dark:text-gray-300">Hide trading & other words</span>
              </div>
              <input
                type="checkbox"
                checked={preferences.hideTradingWords}
                onChange={(e) => updatePreference("hideTradingWords", e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
            </label>
            {preferences.hideTradingWords && (
              <TradingWordsEditor
                words={preferences.tradingWords || DEFAULT_TRADING_WORDS}
                defaultWords={DEFAULT_TRADING_WORDS}
                onWordsChange={(words) => updatePreference("tradingWords", words)}
              />
            )}
          </div>

          {/* Hide images filter */}
          <label className="flex items-center justify-between py-2 cursor-pointer">
            <div className="flex items-center gap-2">
              <span className="text-base">🖼️</span>
              <span className="text-sm text-gray-700 dark:text-gray-300">Hide images</span>
            </div>
            <input
              type="checkbox"
              checked={preferences.hideImages}
              onChange={(e) => updatePreference("hideImages", e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
          </label>
        </div>
      )}
    </div>
  );
}

// Curator filter component for curated feed
export function CuratorFilterInline({ 
  selectedCuratorFids, 
  onCuratorFidsChange 
}: CuratorFilterProps) {
  const [curators, setCurators] = useState<Curator[]>([]);
  const [manuallyAddedCurators, setManuallyAddedCurators] = useState<Curator[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Curator[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load manually added curators from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("manuallyAddedCuratorFids");
    if (saved) {
      try {
        const fids = JSON.parse(saved);
        if (Array.isArray(fids) && fids.length > 0) {
          // Fetch info for manually added curators
          fetchCuratorInfo(fids).then((curators) => {
            setManuallyAddedCurators(curators);
          });
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
  }, []);

  const fetchCuratorInfo = async (fids: number[]): Promise<Curator[]> => {
    try {
      const response = await fetch(`/api/user/bulk?fids=${fids.join(",")}`);
      if (response.ok) {
        const data = await response.json();
        return data.users || [];
      }
      return [];
    } catch (error) {
      console.error("Failed to fetch curator info:", error);
      return [];
    }
  };

  useEffect(() => {
    const fetchCurators = async () => {
      try {
        const response = await fetch("/api/curators");
        if (response.ok) {
          const data = await response.json();
          setCurators(data.curators || []);
        }
      } catch (error) {
        console.error("Failed to fetch curators:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchCurators();
  }, []);

  // Search for curators
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (searchTerm.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/curators?q=${encodeURIComponent(searchTerm)}`);
        if (response.ok) {
          const data = await response.json();
          setSearchResults(data.curators || []);
        }
      } catch (error) {
        console.error("Failed to search curators:", error);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm]);

  const toggleCurator = (fid: number) => {
    if (selectedCuratorFids.includes(fid)) {
      onCuratorFidsChange(selectedCuratorFids.filter((f) => f !== fid));
    } else {
      onCuratorFidsChange([...selectedCuratorFids, fid]);
    }
  };

  // Combine curators with role and manually added curators
  const allDisplayedCurators = [...curators, ...manuallyAddedCurators];

  const selectAll = () => {
    const allCuratorFids = allDisplayedCurators.map((c) => c.fid);
    onCuratorFidsChange(allCuratorFids);
  };

  const deselectAll = () => {
    onCuratorFidsChange([]);
  };

  const allSelected = allDisplayedCurators.length > 0 && selectedCuratorFids.length === allDisplayedCurators.length;
  const noneSelected = selectedCuratorFids.length === 0;

  const addManuallyAddedCurator = (curator: Curator) => {
    setManuallyAddedCurators((prev) => {
      if (prev.find((c) => c.fid === curator.fid)) {
        return prev; // Already added
      }
      const updated = [...prev, curator];
      // Save to localStorage
      const fids = updated.map((c) => c.fid);
      localStorage.setItem("manuallyAddedCuratorFids", JSON.stringify(fids));
      return updated;
    });
  };

  const removeManuallyAddedCurator = (fid: number) => {
    setManuallyAddedCurators((prev) => {
      const updated = prev.filter((c) => c.fid !== fid);
      // Save to localStorage
      const fids = updated.map((c) => c.fid);
      localStorage.setItem("manuallyAddedCuratorFids", JSON.stringify(fids));
      return updated;
    });
  };

  if (loading) {
    return (
      <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-black">
        <div className="px-3 sm:px-4 py-2 sm:py-3 text-xs text-gray-500 dark:text-gray-400">
          Loading curators...
        </div>
      </div>
    );
  }

  if (allDisplayedCurators.length === 0 && searchTerm.length === 0) {
    return null;
  }

  return (
    <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-black">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Curators
          </span>
          {selectedCuratorFids.length > 0 && selectedCuratorFids.length < allDisplayedCurators.length && (
            <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full">
              {selectedCuratorFids.length}
            </span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform ${
            isExpanded ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-2 border-t border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-600 dark:text-gray-400">
              {selectedCuratorFids.length} of {allDisplayedCurators.length} selected
            </span>
            <div className="flex gap-2">
              {!allSelected && (
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Select all
                </button>
              )}
              {!noneSelected && (
                <button
                  type="button"
                  onClick={deselectAll}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Deselect all
                </button>
              )}
            </div>
          </div>
          {/* Search input for adding curators */}
          <div className="mb-2">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search for curators..."
              className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {isSearching && (
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Searching...
              </div>
            )}
            {searchResults.length > 0 && (
              <div className="mt-2 space-y-1">
                {searchResults.map((curator) => {
                  const isAlreadyAdded = allDisplayedCurators.find((c) => c.fid === curator.fid);
                  const displayName = curator.displayName || curator.username || `@user${curator.fid}`;
                  return (
                    <button
                      key={curator.fid}
                      type="button"
                      onClick={() => {
                        if (!isAlreadyAdded) {
                          addManuallyAddedCurator(curator);
                        }
                      }}
                      disabled={!!isAlreadyAdded}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors ${
                        isAlreadyAdded
                          ? "opacity-50 cursor-not-allowed"
                          : "cursor-pointer"
                      }`}
                    >
                      {curator.pfpUrl && (
                        <img
                          src={curator.pfpUrl}
                          alt={displayName}
                          className="w-5 h-5 rounded-full"
                        />
                      )}
                      <span className="flex-1 text-left text-gray-700 dark:text-gray-300">
                        {displayName}
                      </span>
                      {isAlreadyAdded ? (
                        <span className="text-xs text-gray-500">Added</span>
                      ) : (
                        <span className="text-xs text-blue-600 dark:text-blue-400">+ Add</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Curators pills */}
          <div className="flex flex-wrap gap-1.5 p-2 border border-gray-200 dark:border-gray-700 rounded bg-gray-50 dark:bg-gray-900 min-h-[50px] max-h-[200px] overflow-y-auto">
            {allDisplayedCurators.length === 0 ? (
              <span className="text-xs text-gray-400 dark:text-gray-500 italic">
                No curators found
              </span>
            ) : (
              <>
                {/* Curators with role */}
                {curators.map((curator) => {
                  const isSelected = selectedCuratorFids.includes(curator.fid);
                  const displayName = curator.displayName || curator.username || `@user${curator.fid}`;
                  return (
                    <button
                      key={curator.fid}
                      type="button"
                      onClick={() => toggleCurator(curator.fid)}
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs rounded-full transition-colors ${
                        isSelected
                          ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700"
                          : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                      }`}
                    >
                      {curator.pfpUrl && (
                        <img
                          src={curator.pfpUrl}
                          alt={displayName}
                          className="w-4 h-4 rounded-full"
                        />
                      )}
                      <span>{displayName}</span>
                      {isSelected && (
                        <span className="ml-0.5">×</span>
                      )}
                    </button>
                  );
                })}
                {/* Manually added curators */}
                {manuallyAddedCurators.map((curator) => {
                  const isSelected = selectedCuratorFids.includes(curator.fid);
                  const displayName = curator.displayName || curator.username || `@user${curator.fid}`;
                  return (
                    <button
                      key={curator.fid}
                      type="button"
                      onClick={() => toggleCurator(curator.fid)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        removeManuallyAddedCurator(curator.fid);
                      }}
                      title="Right-click to remove"
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs rounded-full transition-colors ${
                        isSelected
                          ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700"
                          : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                      }`}
                    >
                      {curator.pfpUrl && (
                        <img
                          src={curator.pfpUrl}
                          alt={displayName}
                          className="w-4 h-4 rounded-full"
                        />
                      )}
                      <span>{displayName}</span>
                      {isSelected && (
                        <span className="ml-0.5">×</span>
                      )}
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

