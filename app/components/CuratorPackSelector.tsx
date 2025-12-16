"use client";

import { useState, useEffect } from "react";
import { CuratorPackCard } from "./CuratorPackCard";

interface Pack {
  id: string;
  name: string;
  description?: string | null;
  creatorFid: number;
  creator?: {
    fid: number;
    username?: string | null;
    displayName?: string | null;
    pfpUrl?: string | null;
  } | null;
  isPublic: boolean;
  usageCount: number;
  userCount: number;
  createdAt: Date | string;
  isFavorited?: boolean;
}

interface CuratorPackSelectorProps {
  viewerFid?: number;
  selectedPackIds?: string[];
  onSelect?: (packIds: string[]) => void;
  onSubscribe?: (packId: string) => void;
  onFavoriteChange?: (packId: string, favorited: boolean) => void;
  showSearch?: boolean;
  showPopular?: boolean;
}

export function CuratorPackSelector({
  viewerFid,
  selectedPackIds = [],
  onSelect,
  onSubscribe,
  onFavoriteChange,
  showSearch = true,
  showPopular = true,
}: CuratorPackSelectorProps) {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [popularPacks, setPopularPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedPacks, setSelectedPacks] = useState<string[]>(selectedPackIds);

  useEffect(() => {
    setSelectedPacks(selectedPackIds);
  }, [selectedPackIds]);

  useEffect(() => {
    fetchPacks();
    if (showPopular) {
      fetchPopularPacks();
    }
  }, [viewerFid, showPopular]);

  const fetchPacks = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (viewerFid) {
        params.append("viewerFid", viewerFid.toString());
      }
      if (search) {
        params.append("search", search);
      }

      const response = await fetch(`/api/curator-packs?${params}`);
      if (!response.ok) throw new Error("Failed to fetch packs");
      const data = await response.json();
      setPacks(data.packs || []);
    } catch (error) {
      console.error("Error fetching packs:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPopularPacks = async () => {
    try {
      const response = await fetch("/api/curator-packs/popular?limit=5");
      if (!response.ok) throw new Error("Failed to fetch popular packs");
      const data = await response.json();
      setPopularPacks(data.packs || []);
    } catch (error) {
      console.error("Error fetching popular packs:", error);
    }
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (search !== undefined) {
        fetchPacks();
      }
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [search]);

  const handleTogglePack = (packId: string) => {
    const newSelected = selectedPacks.includes(packId)
      ? selectedPacks.filter((id) => id !== packId)
      : [...selectedPacks, packId];
    setSelectedPacks(newSelected);
    onSelect?.(newSelected);
  };

  const handleUsePack = (packId: string) => {
    handleTogglePack(packId);
  };

  return (
    <div className="w-full">
      {showSearch && (
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search packs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      )}

      {selectedPacks.length > 0 && (
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <p className="text-sm text-blue-900 dark:text-blue-100 mb-2">
            Selected packs: {selectedPacks.length}
          </p>
          <button
            onClick={() => {
              setSelectedPacks([]);
              onSelect?.([]);
            }}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Clear selection
          </button>
        </div>
      )}

      {showPopular && popularPacks.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">
            Popular Packs
          </h3>
          <div className="space-y-3">
            {popularPacks.map((pack) => (
              <div key={pack.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedPacks.includes(pack.id)}
                  onChange={() => handleTogglePack(pack.id)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <div className="flex-1">
                  <CuratorPackCard
                    pack={pack}
                    viewerFid={viewerFid}
                    onUse={onSelect ? handleUsePack : undefined}
                    onSubscribe={onSubscribe}
                    onFavoriteChange={onFavoriteChange}
                    showActions={false}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">
          {search ? "Search Results" : "All Packs"}
        </h3>
        {loading ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            Loading packs...
          </div>
        ) : packs.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No packs found
          </div>
        ) : (
          <div className="space-y-3">
            {packs.map((pack) => (
              <div key={pack.id} className="flex items-center gap-2">
                {onSelect && (
                  <input
                    type="checkbox"
                    checked={selectedPacks.includes(pack.id)}
                    onChange={() => handleTogglePack(pack.id)}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                )}
                <div className="flex-1">
                  <CuratorPackCard
                    pack={pack}
                    viewerFid={viewerFid}
                    onUse={onSelect ? handleUsePack : undefined}
                    onSubscribe={onSubscribe}
                    onFavoriteChange={onFavoriteChange}
                    showActions={!onSelect}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

