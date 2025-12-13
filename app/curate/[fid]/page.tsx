"use client";

import { useEffect, useState, use, useRef } from "react";
import { useNeynarContext } from "@neynar/react";
import { ProfileHeader } from "../../components/ProfileHeader";
import { CastCard } from "../../components/CastCard";
import { MiniCastCard } from "../../components/MiniCastCard";
import { BulkCollectionSelectModal } from "../../components/BulkCollectionSelectModal";
import { hasCollectionsOrAdminRole } from "@/lib/roles-client";
import { ChevronDown, ChevronUp, LayoutGrid, List, Square, Minus, Plus } from "lucide-react";
import { useRouter } from "next/navigation";

interface UserProfile {
  fid: number;
  username?: string;
  display_name?: string;
  pfp_url?: string;
  bio?: string;
  follower_count?: number;
  following_count?: number;
  verified?: boolean;
  isFollowing?: boolean;
}

interface SelectedCast {
  castHash: string;
  castData: any;
}

export default function CuratePersonPage({
  params,
}: {
  params: Promise<{ fid: string }>;
}) {
  const { fid: fidParam } = use(params);
  const { user } = useNeynarContext();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasCollectorRole, setHasCollectorRole] = useState(false);
  const [checkingRole, setCheckingRole] = useState(true);
  
  // View toggle
  const [viewMode, setViewMode] = useState<"mini" | "standard">("mini");
  
  // Cast data
  const [popularCasts, setPopularCasts] = useState<any[]>([]);
  const [chronoCasts, setChronoCasts] = useState<any[]>([]);
  const [loadingPopular, setLoadingPopular] = useState(false);
  const [loadingChrono, setLoadingChrono] = useState(false);
  
  // Pagination
  const [popularCursor, setPopularCursor] = useState<string | null>(null);
  const [chronoCursor, setChronoCursor] = useState<string | null>(null);
  const [hasMorePopular, setHasMorePopular] = useState(false);
  const [hasMoreChrono, setHasMoreChrono] = useState(false);
  
  // Collapsible sections
  const [popularExpanded, setPopularExpanded] = useState(true);
  const [chronoExpanded, setChronoExpanded] = useState(true);
  
  // Selection state
  const [selectedCasts, setSelectedCasts] = useState<Map<string, SelectedCast>>(new Map());
  const [showBulkModal, setShowBulkModal] = useState(false);
  const globalCheckboxRef = useRef<HTMLInputElement>(null);

  // Check collector role
  useEffect(() => {
    if (!user?.fid) {
      setCheckingRole(false);
      return;
    }

    const checkRole = async () => {
      try {
        const response = await fetch(`/api/admin/check?fid=${user.fid}`);
        if (response.ok) {
          const data = await response.json();
          const roles = data.roles || [];
          setHasCollectorRole(hasCollectionsOrAdminRole(roles));
        }
      } catch (error) {
        console.error("Failed to check role:", error);
      } finally {
        setCheckingRole(false);
      }
    };

    checkRole();
  }, [user?.fid]);

  // Fetch profile (works with both FID and username)
  useEffect(() => {
    fetchProfile();
  }, [fidParam, user?.fid]);

  // Fetch initial casts (after profile is loaded, we have the FID)
  useEffect(() => {
    if (!profile?.fid) return;
    fetchPopularCasts(10, null, true);
    fetchChronoCasts(25, null, true);
  }, [profile?.fid, user?.fid]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      setError(null);

      const viewerFid = user?.fid;
      const url = viewerFid
        ? `/api/user/${encodeURIComponent(fidParam)}?viewerFid=${viewerFid}`
        : `/api/user/${encodeURIComponent(fidParam)}`;

      const response = await fetch(url);
      if (!response.ok) {
        if (response.status === 404) {
          setError("User not found");
        } else {
          throw new Error("Failed to fetch profile");
        }
        setLoading(false);
        return;
      }

      const data = await response.json();
      setProfile(data);
    } catch (err: any) {
      console.error("Failed to fetch profile:", err);
      setError(err.message || "Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  const fetchPopularCasts = async (limit: number, cursor: string | null, isInitial: boolean = false) => {
    if (!profile?.fid) return;
    
    try {
      if (isInitial) {
        setLoadingPopular(true);
      }
      const viewerFid = user?.fid;
      const userFid = profile.fid;

      const url = `/api/user/${userFid}/popular-casts?limit=${limit}${cursor ? `&cursor=${cursor}` : ""}${viewerFid ? `&viewerFid=${viewerFid}` : ""}`;
      const response = await fetch(url);
      
      if (response.ok) {
        const data = await response.json();
        const casts = data.casts || [];
        
        if (isInitial) {
          setPopularCasts(casts);
        } else {
          setPopularCasts((prev) => [...prev, ...casts]);
        }
        
        setPopularCursor(data.next?.cursor || null);
        setHasMorePopular(!!data.next?.cursor);
      }
    } catch (err: any) {
      console.error("Failed to fetch popular casts:", err);
    } finally {
      if (isInitial) {
        setLoadingPopular(false);
      }
    }
  };

  const fetchChronoCasts = async (limit: number, cursor: string | null, isInitial: boolean = false) => {
    if (!profile?.fid) return;
    
    try {
      if (isInitial) {
        setLoadingChrono(true);
      }
      const viewerFid = user?.fid;
      const userFid = profile.fid;

      const url = `/api/user/${userFid}/casts?limit=${limit}${cursor ? `&cursor=${cursor}` : ""}${viewerFid ? `&viewerFid=${viewerFid}` : ""}`;
      const response = await fetch(url);
      
      if (response.ok) {
        const data = await response.json();
        const casts = data.casts || [];
        
        if (isInitial) {
          setChronoCasts(casts);
        } else {
          setChronoCasts((prev) => [...prev, ...casts]);
        }
        
        setChronoCursor(data.next?.cursor || null);
        setHasMoreChrono(!!data.next?.cursor);
      }
    } catch (err: any) {
      console.error("Failed to fetch chronological casts:", err);
    } finally {
      if (isInitial) {
        setLoadingChrono(false);
      }
    }
  };

  const handleProfileUpdate = () => {
    fetchProfile();
  };

  const toggleCastSelection = (cast: any) => {
    const newSelected = new Map(selectedCasts);
    if (newSelected.has(cast.hash)) {
      newSelected.delete(cast.hash);
    } else {
      newSelected.set(cast.hash, {
        castHash: cast.hash,
        castData: cast,
      });
    }
    setSelectedCasts(newSelected);
  };

  const handleSelectAll = (casts: any[]) => {
    const newSelected = new Map(selectedCasts);
    casts.forEach((cast) => {
      if (cast.hash) {
        newSelected.set(cast.hash, {
          castHash: cast.hash,
          castData: cast,
        });
      }
    });
    setSelectedCasts(newSelected);
  };

  const handleSelectAllGlobal = () => {
    const allCasts = [...popularCasts, ...chronoCasts];
    handleSelectAll(allCasts);
  };

  const allCastsSelected = () => {
    const allCasts = [...popularCasts, ...chronoCasts];
    return allCasts.length > 0 && allCasts.every(cast => selectedCasts.has(cast.hash));
  };

  const someCastsSelected = () => {
    const allCasts = [...popularCasts, ...chronoCasts];
    return allCasts.some(cast => selectedCasts.has(cast.hash));
  };

  // Update indeterminate state of global checkbox
  useEffect(() => {
    if (globalCheckboxRef.current) {
      globalCheckboxRef.current.indeterminate = someCastsSelected() && !allCastsSelected();
    }
  }, [selectedCasts, popularCasts, chronoCasts]);

  const handleDeselectAll = () => {
    setSelectedCasts(new Map());
  };

  const handleLoadMorePopular = () => {
    if (popularCursor && !loadingPopular) {
      fetchPopularCasts(10, popularCursor, false);
    }
  };

  const handleLoadMoreChrono = () => {
    if (chronoCursor && !loadingChrono) {
      fetchChronoCasts(25, chronoCursor, false);
    }
  };

  if (checkingRole || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!hasCollectorRole) {
    return (
      <div className="min-h-screen">
        <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
          <div className="p-4 sm:p-6 border border-red-200 dark:border-red-800 rounded-lg bg-red-50 dark:bg-red-900/20">
            <p className="text-red-600 dark:text-red-400">
              You need collector role to access this page.
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen">
        <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
          <div className="p-4 sm:p-6 border border-red-200 dark:border-red-800 rounded-lg bg-red-50 dark:bg-red-900/20">
            <p className="text-red-600 dark:text-red-400">
              {error || "Profile not found"}
            </p>
          </div>
        </main>
      </div>
    );
  }

  const viewerFid = user?.fid;
  const selectedCount = selectedCasts.size;
  const isMiniView = viewMode === "mini";

  return (
    <div className="min-h-screen">
      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {/* Profile Header */}
        <ProfileHeader
          fid={profile.fid}
          username={profile.username}
          displayName={profile.display_name}
          pfpUrl={profile.pfp_url}
          bio={profile.bio}
          followerCount={profile.follower_count}
          followingCount={profile.following_count}
          verified={profile.verified}
          viewerFid={viewerFid}
          isFollowing={profile.isFollowing}
          onProfileUpdate={handleProfileUpdate}
        />

        {/* View Toggle and Bulk Actions Bar */}
        <div className="sticky top-0 bg-white dark:bg-black border-b border-gray-200 dark:border-gray-800 z-40 p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Global Select All Checkbox */}
              <input
                type="checkbox"
                ref={globalCheckboxRef}
                checked={allCastsSelected()}
                onChange={(e) => {
                  if (e.target.checked) {
                    handleSelectAllGlobal();
                  } else {
                    handleDeselectAll();
                  }
                }}
                className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                title="Select All"
              />
              
              {/* View Toggle */}
              <div className="flex items-center gap-2 border border-gray-300 dark:border-gray-700 rounded-lg p-1">
                <button
                  onClick={() => setViewMode("mini")}
                  className={`p-1.5 rounded ${isMiniView ? "bg-blue-600 text-white" : "text-gray-600 dark:text-gray-400"}`}
                  title="Mini View"
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode("standard")}
                  className={`p-1.5 rounded ${!isMiniView ? "bg-blue-600 text-white" : "text-gray-600 dark:text-gray-400"}`}
                  title="Standard View"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
              </div>
              
              {selectedCount > 0 && (
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {selectedCount} cast{selectedCount !== 1 ? "s" : ""} selected
                </div>
              )}
            </div>
            
            {selectedCount > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={handleDeselectAll}
                  className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                >
                  Deselect All
                </button>
                <button
                  onClick={() => setShowBulkModal(true)}
                  className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Add Selected to Collection
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Popular Casts Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setPopularExpanded(!popularExpanded)}
              className="flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-gray-100 hover:text-gray-700 dark:hover:text-gray-300"
            >
              {popularExpanded ? (
                <Minus className="w-5 h-5" />
              ) : (
                <Square className="w-5 h-5" />
              )}
              <span>Popular Casts</span>
              {popularCasts.length > 0 && (
                <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                  ({popularCasts.length})
                </span>
              )}
            </button>
          </div>
          
          {popularExpanded && (
            <>
              {loadingPopular && popularCasts.length === 0 ? (
                <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                  Loading popular casts...
                </div>
              ) : popularCasts.length === 0 ? (
                <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                  No popular casts found
                </div>
              ) : (
                <div className="space-y-4">
                  {popularCasts.map((cast) => (
                    <div key={cast.hash} className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedCasts.has(cast.hash)}
                        onChange={() => toggleCastSelection(cast)}
                        className="mt-4 w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex-1">
                        {isMiniView ? (
                          <MiniCastCard
                            cast={cast}
                            onClick={() => router.push(`/cast/${cast.hash}`)}
                          />
                        ) : (
                          <CastCard
                            cast={cast}
                            feedType={undefined}
                            disableClick={false}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                  
                  {hasMorePopular && (
                    <div className="text-center pt-4">
                      <button
                        onClick={handleLoadMorePopular}
                        disabled={loadingPopular}
                        className="px-4 py-2 text-sm text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {loadingPopular ? "Loading..." : "Load More"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Chronological Casts Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setChronoExpanded(!chronoExpanded)}
              className="flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-gray-100 hover:text-gray-700 dark:hover:text-gray-300"
            >
              {chronoExpanded ? (
                <Minus className="w-5 h-5" />
              ) : (
                <Square className="w-5 h-5" />
              )}
              <span>Chronological Casts</span>
              {chronoCasts.length > 0 && (
                <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                  ({chronoCasts.length})
                </span>
              )}
            </button>
          </div>
          
          {chronoExpanded && (
            <>
              {loadingChrono && chronoCasts.length === 0 ? (
                <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                  Loading chronological casts...
                </div>
              ) : chronoCasts.length === 0 ? (
                <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                  No casts found
                </div>
              ) : (
                <div className="space-y-4">
                  {chronoCasts.map((cast) => (
                    <div key={cast.hash} className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedCasts.has(cast.hash)}
                        onChange={() => toggleCastSelection(cast)}
                        className="mt-4 w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex-1">
                        {isMiniView ? (
                          <MiniCastCard
                            cast={cast}
                            onClick={() => router.push(`/cast/${cast.hash}`)}
                          />
                        ) : (
                          <CastCard
                            cast={cast}
                            feedType={undefined}
                            disableClick={false}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                  
                  {hasMoreChrono && (
                    <div className="text-center pt-4">
                      <button
                        onClick={handleLoadMoreChrono}
                        disabled={loadingChrono}
                        className="px-4 py-2 text-sm text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {loadingChrono ? "Loading..." : "Load More"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Bulk Collection Modal */}
        <BulkCollectionSelectModal
          isOpen={showBulkModal}
          onClose={() => setShowBulkModal(false)}
          selectedCasts={Array.from(selectedCasts.values())}
          defaultCollectionName={profile?.display_name || profile?.username || "User"}
          onSuccess={() => {
            setSelectedCasts(new Map());
            setShowBulkModal(false);
          }}
        />
      </main>
    </div>
  );
}
