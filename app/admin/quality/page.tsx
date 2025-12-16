"use client";

import { useEffect, useState } from "react";
import { useNeynarContext } from "@neynar/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CastCard } from "@/app/components/CastCard";
import { extractCastTimestamp } from "@/lib/cast-timestamp";

interface QualityItem {
  hash: string;
  castData: any;
  qualityScore: number | null;
  category: string | null;
  type: "cast" | "reply";
}

const VALID_CATEGORIES = [
  "crypto-critique",
  "platform-analysis",
  "creator-economy",
  "art-culture",
  "ai-philosophy",
  "community-culture",
  "life-reflection",
  "market-news",
  "playful",
  "other",
] as const;

export default function QualityPage() {
  const { user } = useNeynarContext();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [items, setItems] = useState<QualityItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  
  // Filters
  const [minQuality, setMinQuality] = useState<string>("");
  const [maxQuality, setMaxQuality] = useState<string>("");
  const [includeNull, setIncludeNull] = useState<boolean>(false);
  const [showCasts, setShowCasts] = useState<boolean>(true);
  const [showReplies, setShowReplies] = useState<boolean>(true);

  // Editing state
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editQualityScore, setEditQualityScore] = useState<string>("");
  const [editCategory, setEditCategory] = useState<string>("");
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    const checkAdminAccess = async () => {
      if (!user?.fid) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/admin/check?fid=${user.fid}`);
        const data = await response.json();
        
        if (data.isAdmin) {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
          router.push("/");
        }
      } catch (error) {
        console.error("Failed to check admin access:", error);
        setIsAdmin(false);
        router.push("/");
      } finally {
        setIsLoading(false);
      }
    };

    checkAdminAccess();
  }, [user, router]);

  const fetchItems = async () => {
    if (!user?.fid) return;

    setLoadingItems(true);
    try {
      const params = new URLSearchParams({
        adminFid: user.fid.toString(),
        includeCasts: showCasts.toString(),
        includeReplies: showReplies.toString(),
        includeNull: includeNull.toString(),
      });

      if (minQuality) params.append("minQuality", minQuality);
      if (maxQuality) params.append("maxQuality", maxQuality);

      const response = await fetch(`/api/admin/quality?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setItems(data.items || []);
      } else {
        const error = await response.json();
        console.error("Failed to fetch items:", error.error);
        setItems([]);
      }
    } catch (error) {
      console.error("Failed to fetch items:", error);
      setItems([]);
    } finally {
      setLoadingItems(false);
    }
  };

  const handleSearch = () => {
    fetchItems();
  };

  const handleEdit = (item: QualityItem) => {
    setEditingItem(item.hash);
    setEditQualityScore(item.qualityScore?.toString() || "");
    setEditCategory(item.category || "");
  };

  const handleCancelEdit = () => {
    setEditingItem(null);
    setEditQualityScore("");
    setEditCategory("");
  };

  const handleSaveEdit = async (item: QualityItem) => {
    if (!user?.fid) return;

    const qualityScoreNum = parseInt(editQualityScore);
    if (isNaN(qualityScoreNum) || qualityScoreNum < 0 || qualityScoreNum > 100) {
      alert("Quality score must be between 0 and 100");
      return;
    }

    setSaving(item.hash);
    try {
      const response = await fetch("/api/admin/quality", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          adminFid: user.fid,
          castHash: item.hash,
          qualityScore: qualityScoreNum,
          category: editCategory || null,
          type: item.type,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // Update the item in the list
        setItems((prevItems) =>
          prevItems.map((i) =>
            i.hash === item.hash
              ? {
                  ...i,
                  qualityScore: data.qualityScore,
                  category: data.category,
                }
              : i
          )
        );
        setEditingItem(null);
        setEditQualityScore("");
        setEditCategory("");
      } else {
        const error = await response.json();
        alert(`Failed to update: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to save edit:", error);
      alert("Failed to save changes");
    } finally {
      setSaving(null);
    }
  };

  if (!user || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-600">Access Denied</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          Quality Range Filter
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          View casts and replies within a specific quality score range
        </p>
      </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Filters
          </h2>
          
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Min Quality Score
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={minQuality}
                  onChange={(e) => setMinQuality(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Max Quality Score
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={maxQuality}
                  onChange={(e) => setMaxQuality(e.target.value)}
                  placeholder="100"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                />
              </div>
            </div>

            <div className="flex items-center space-x-6">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={includeNull}
                  onChange={(e) => setIncludeNull(e.target.checked)}
                  className="mr-2 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-accent"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Include null quality scores
                  {!minQuality && !maxQuality && includeNull && (
                    <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                      (showing only null)
                    </span>
                  )}
                </span>
              </label>
            </div>

            <div className="flex items-center space-x-6">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={showCasts}
                  onChange={(e) => setShowCasts(e.target.checked)}
                  className="mr-2 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-accent"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Show Casts
                </span>
              </label>
              
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={showReplies}
                  onChange={(e) => setShowReplies(e.target.checked)}
                  className="mr-2 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-accent"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Show Replies
                </span>
              </label>
            </div>

            <button
              onClick={handleSearch}
              disabled={loadingItems || (!showCasts && !showReplies)}
              className="px-6 py-2 bg-accent text-white rounded-lg hover:bg-accent-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingItems ? "Searching..." : "Search"}
            </button>
          </div>
        </div>

        {items.length > 0 && (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Results ({items.length})
            </h2>
            <div className="space-y-4">
              {items.map((item) => {
                // Ensure castData has a valid timestamp
                const castData = { ...item.castData };
                if (!castData.timestamp) {
                  const extractedTimestamp = extractCastTimestamp(castData);
                  if (extractedTimestamp) {
                    castData.timestamp = extractedTimestamp.toISOString();
                  } else {
                    // Fallback to current time if no valid timestamp found
                    castData.timestamp = new Date().toISOString();
                  }
                } else {
                  // Validate existing timestamp
                  const date = new Date(castData.timestamp);
                  if (isNaN(date.getTime())) {
                    const extractedTimestamp = extractCastTimestamp(castData);
                    if (extractedTimestamp) {
                      castData.timestamp = extractedTimestamp.toISOString();
                    } else {
                      castData.timestamp = new Date().toISOString();
                    }
                  }
                }

                const isEditing = editingItem === item.hash;
                const isSaving = saving === item.hash;

                return (
                  <div key={item.hash} className="border-b border-gray-200 dark:border-gray-800 pb-4 last:border-b-0">
                    <div className="mb-2 flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-1 text-xs rounded ${
                        item.type === "cast" 
                          ? "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200"
                          : "bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200"
                      }`}>
                        {item.type === "cast" ? "Cast" : "Reply"}
                      </span>
                      
                      {isEditing ? (
                        <>
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-gray-700 dark:text-gray-300">Quality:</label>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={editQualityScore}
                              onChange={(e) => setEditQualityScore(e.target.value)}
                              className="w-20 px-2 py-1 text-xs border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                              disabled={isSaving}
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-gray-700 dark:text-gray-300">Category:</label>
                            <select
                              value={editCategory}
                              onChange={(e) => setEditCategory(e.target.value)}
                              className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                              disabled={isSaving}
                            >
                              <option value="">None</option>
                              {VALID_CATEGORIES.map((cat) => (
                                <option key={cat} value={cat}>
                                  {cat}
                                </option>
                              ))}
                            </select>
                          </div>
                          <button
                            onClick={() => handleSaveEdit(item)}
                            disabled={isSaving}
                            className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isSaving ? "Saving..." : "Save"}
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            disabled={isSaving}
                            className="px-3 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          {item.qualityScore !== null ? (
                            <span className="px-2 py-1 text-xs rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                              Quality: {item.qualityScore}
                            </span>
                          ) : (
                            <span className="px-2 py-1 text-xs rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-500">
                              Quality: null
                            </span>
                          )}
                          {item.category && (
                            <span className="px-2 py-1 text-xs rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                              {item.category}
                            </span>
                          )}
                          <button
                            onClick={() => handleEdit(item)}
                            className="px-3 py-1 text-xs bg-accent text-white rounded hover:bg-accent-dark transition-colors"
                          >
                            Edit
                          </button>
                        </>
                      )}
                    </div>
                    <CastCard
                      cast={castData}
                      feedType="curated"
                      isReply={item.type === "reply"}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!loadingItems && items.length === 0 && (minQuality || maxQuality || includeNull) && (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
            <div className="text-center text-gray-500 dark:text-gray-400 py-8">
              No items found matching the criteria.
            </div>
          </div>
        )}
    </div>
  );
}
