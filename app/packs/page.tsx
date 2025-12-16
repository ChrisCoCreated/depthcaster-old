"use client";

import { CuratorPackSelector } from "@/app/components/CuratorPackSelector";
import { CuratorPackManager } from "@/app/components/CuratorPackManager";
import { CuratorPackCard } from "@/app/components/CuratorPackCard";
import { useNeynarContext } from "@neynar/react";
import { useState, useEffect } from "react";
import Link from "next/link";

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

export default function PacksPage() {
  const { user } = useNeynarContext();
  const [favoritePacks, setFavoritePacks] = useState<Pack[]>([]);
  const [loadingFavorites, setLoadingFavorites] = useState(true);
  const [selectedPackIds, setSelectedPackIds] = useState<string[]>([]);
  const [selectedPacks, setSelectedPacks] = useState<Pack[]>([]);
  const [loadingSelected, setLoadingSelected] = useState(true);

  useEffect(() => {
    if (user?.fid) {
      fetchFavoritePacks();
    }
    loadSelectedPacks();
  }, [user?.fid]);

  const loadSelectedPacks = () => {
    const saved = localStorage.getItem("selectedPackIds");
    if (saved) {
      try {
        const ids = JSON.parse(saved);
        if (Array.isArray(ids) && ids.length > 0) {
          setSelectedPackIds(ids);
          fetchSelectedPacks(ids);
        } else {
          setLoadingSelected(false);
        }
      } catch (e) {
        setLoadingSelected(false);
      }
    } else {
      setLoadingSelected(false);
    }
  };

  const fetchSelectedPacks = async (packIds: string[]) => {
    try {
      setLoadingSelected(true);
      const packs: Pack[] = [];
      for (const packId of packIds) {
        try {
          const response = await fetch(`/api/curator-packs/${packId}`);
          if (response.ok) {
            const data = await response.json();
            packs.push({
              ...data,
              userCount: data.userCount || 0,
            });
          }
        } catch (error) {
          console.error(`Error fetching pack ${packId}:`, error);
        }
      }
      setSelectedPacks(packs);
    } catch (error) {
      console.error("Error fetching selected packs:", error);
    } finally {
      setLoadingSelected(false);
    }
  };

  const handleRemovePack = (packId: string) => {
    const newSelected = selectedPackIds.filter((id) => id !== packId);
    setSelectedPackIds(newSelected);
    setSelectedPacks(selectedPacks.filter((p) => p.id !== packId));
    localStorage.setItem("selectedPackIds", JSON.stringify(newSelected));
  };

  const handleClearAll = () => {
    setSelectedPackIds([]);
    setSelectedPacks([]);
    localStorage.removeItem("selectedPackIds");
  };

  const handlePackSelect = (packIds: string[]) => {
    setSelectedPackIds(packIds);
    localStorage.setItem("selectedPackIds", JSON.stringify(packIds));
    fetchSelectedPacks(packIds);
  };

  const fetchFavoritePacks = async () => {
    if (!user?.fid) return;
    
    try {
      setLoadingFavorites(true);
      const response = await fetch(`/api/curator-packs/favorites?userFid=${user.fid}`);
      if (response.ok) {
        const data = await response.json();
        setFavoritePacks(data.packs || []);
      }
    } catch (error) {
      console.error("Error fetching favorite packs:", error);
    } finally {
      setLoadingFavorites(false);
    }
  };

  const handleFavoriteChange = (packId: string, favorited: boolean) => {
    if (!favorited) {
      setFavoritePacks(favoritePacks.filter((p) => p.id !== packId));
    } else {
      // If favorited, we'll need to refetch to get the full pack data
      fetchFavoritePacks();
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Curator Packs
          </h1>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
            Discover and use curated lists of Farcaster users to filter your feed
          </p>
        </div>

        {/* Selected Packs Section */}
        {selectedPackIds.length > 0 && (
          <div className="mb-6 sm:mb-8 p-3 sm:p-4 bg-accent/30 dark:bg-accent/20 rounded-lg border border-accent/50 dark:border-accent-dark">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100">
                Selected Packs ({selectedPackIds.length})
              </h2>
              <button
                onClick={handleClearAll}
                className="text-xs sm:text-sm text-accent-dark dark:text-accent hover:underline"
              >
                Clear All
              </button>
            </div>
            {loadingSelected ? (
              <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                Loading selected packs...
              </div>
            ) : selectedPacks.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {selectedPacks.map((pack) => (
                  <div key={pack.id} className="flex items-center gap-3 p-3 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800">
                    <div className="flex-1 min-w-0">
                      <Link href={`/packs/${pack.id}`} className="font-medium text-gray-900 dark:text-gray-100 hover:text-accent-dark dark:hover:text-accent truncate block">
                        {pack.name}
                      </Link>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {pack.userCount} users
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemovePack(pack.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                      aria-label="Remove pack"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                Selected packs not found
              </div>
            )}
          </div>
        )}

        {/* Favorite Packs Section */}
        {user && (
          <div className="mb-6 sm:mb-8">
            <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-3 sm:mb-4">
              Favorite Packs
            </h2>
            {loadingFavorites ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                Loading favorites...
              </div>
            ) : favoritePacks.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                No favorite packs yet. Star packs you like to add them here!
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {favoritePacks.map((pack) => (
                  <CuratorPackCard
                    key={pack.id}
                    pack={pack}
                    viewerFid={user.fid}
                    onFavoriteChange={handleFavoriteChange}
                    onUse={(packId) => {
                      // Handle using favorite pack in feed
                      const packIds = [packId];
                      localStorage.setItem("selectedPackIds", JSON.stringify(packIds));
                      window.location.href = "/";
                    }}
                    showActions={true}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          <div className="lg:col-span-2 order-2 lg:order-1">
            <CuratorPackSelector 
              viewerFid={user?.fid} 
              selectedPackIds={selectedPackIds}
              onSelect={handlePackSelect}
              showSearch={true} 
              showPopular={true}
              onFavoriteChange={handleFavoriteChange}
            />
          </div>
          
          <div className="lg:col-span-1 order-1 lg:order-2">
            <div className="lg:sticky lg:top-4">
              <CuratorPackManager />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

