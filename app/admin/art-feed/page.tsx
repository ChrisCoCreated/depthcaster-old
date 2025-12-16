"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useNeynarContext } from "@neynar/react";
import { useRouter, useSearchParams } from "next/navigation";
import { ImageModal } from "@/app/components/ImageModal";

interface ArtFeedImage {
  imageUrl: string;
  linkUrl: string;
  castHash: string;
  castText?: string;
  castAuthor?: {
    fid: number;
    username?: string;
    displayName?: string;
  };
}

function ArtFeedContent() {
  const { user } = useNeynarContext();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [images, setImages] = useState<ArtFeedImage[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [modalImageUrl, setModalImageUrl] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hasUserClosedModal, setHasUserClosedModal] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selectedFid, setSelectedFid] = useState<number | null>(null);
  const [selectedUsername, setSelectedUsername] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  
  const cursorRef = useRef<string | null>(null);
  const loadingImagesRef = useRef<boolean>(false);
  const loadingFidRef = useRef<number | null>(null);
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const currentIndexRef = useRef(0);
  const isNavigatingRef = useRef(false);
  const activeRequestIdRef = useRef<string | null>(null);

  // Sync refs with state
  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);

  // loadingImagesRef is now managed directly in loadImages function

  // Handle user selection - defined early so it can be used in other hooks
  const handleSelectUser = useCallback((userResult: any) => {
    setSelectedFid(userResult.fid);
    const username = userResult.username || "";
    setSelectedUsername(username);
    setSearchTerm("");
    setSearchResults([]);
    setShowSearch(false);
    setImages([]);
    setCursor(null);
    cursorRef.current = null;
    setCurrentIndex(0);
    loadingFidRef.current = null;
    // Update URL with username
    if (username) {
      router.push(`/admin/art-feed?fid=${userResult.fid}&username=${encodeURIComponent(username)}`);
    } else {
      router.push(`/admin/art-feed?fid=${userResult.fid}`);
    }
  }, [router]);

  // Load images - defined early so it can be used in other hooks
  const loadImages = useCallback(async (fid: number, reset = false) => {
    if (!fid) return;
    if (!user?.fid) return;
    
    // Generate a unique request ID for this call
    const requestId = `${fid}-${reset ? 'reset' : 'append'}-${Date.now()}-${Math.random()}`;
    
    // Prevent concurrent loads for the same FID - check and set synchronously
    if (loadingImagesRef.current && loadingFidRef.current === fid) {
      console.log('[loadImages] BLOCKED - already loading for fid:', fid, 'active request:', activeRequestIdRef.current);
      return;
    }
    
    // Set refs synchronously before async operation
    loadingFidRef.current = fid;
    loadingImagesRef.current = true;
    activeRequestIdRef.current = requestId;
    setLoadingImages(true);
    
    console.log('[loadImages] Starting load for fid:', fid, 'reset:', reset, 'requestId:', requestId);
    
    try {
      const params = new URLSearchParams({
        adminFid: user.fid.toString(),
        fid: fid.toString(),
        limit: "20",
      });
      
      // Use ref to get current cursor value without causing dependency issues
      const currentCursor = reset ? null : cursorRef.current;
      if (currentCursor) {
        params.append("cursor", currentCursor);
      }

      const response = await fetch(`/api/admin/art-feed?${params}`);
      
      // Check if this request is still the active one (prevent race conditions)
      if (activeRequestIdRef.current !== requestId) {
        console.log('[loadImages] Request superseded, ignoring response for requestId:', requestId);
        return;
      }
      if (!response.ok) {
        throw new Error("Failed to fetch images");
      }

      const data = await response.json();
      const newImages = data.images || [];
      
      if (reset) {
        // When resetting, just set the new images (they should be fresh)
        setImages(newImages);
        setCurrentIndex(0);
        setCursor(data.next?.cursor || null);
        cursorRef.current = data.next?.cursor || null;
      } else {
        // Deduplicate by castHash to prevent duplicate images when appending
        setImages((prev) => {
          const existingHashes = new Set(prev.map(img => img.castHash));
          const uniqueNewImages = newImages.filter((img: ArtFeedImage) => !existingHashes.has(img.castHash));
          console.log('[loadImages] Appending', uniqueNewImages.length, 'new images (filtered from', newImages.length, 'total)');
          return [...prev, ...uniqueNewImages];
        });
        setCursor(data.next?.cursor || null);
        cursorRef.current = data.next?.cursor || null;
      }
      setHasMore(data.hasMore || false);
    } catch (error) {
      console.error("Error loading images:", error);
    } finally {
      // Only clear if this is still the active request
      if (activeRequestIdRef.current === requestId) {
        setLoadingImages(false);
        loadingImagesRef.current = false;
        if (loadingFidRef.current === fid) {
          loadingFidRef.current = null;
        }
        activeRequestIdRef.current = null;
      }
    }
  }, [user?.fid]);

  // Check for URL parameters
  useEffect(() => {
    const fidParam = searchParams.get("fid");
    const usernameParam = searchParams.get("username");
    
    if (fidParam) {
      const fid = parseInt(fidParam);
      if (!isNaN(fid) && fid !== selectedFid) {
        setSelectedFid(fid);
        setSelectedUsername(usernameParam || "");
        // Don't reset images here - let the loadImages effect handle it
        setCursor(null);
        cursorRef.current = null;
        setCurrentIndex(0);
      }
    } else if (usernameParam && user?.fid) {
      // Search for user by username
      const cleanUsername = usernameParam.replace(/^@/, "");
      setSearchTerm(cleanUsername);
      // The search effect will handle this
    }
  }, [searchParams, user?.fid, selectedFid]);

  // Load images when selectedFid changes
  useEffect(() => {
    if (selectedFid && user?.fid && !loadingImagesRef.current && loadingFidRef.current !== selectedFid) {
      console.log('[useEffect] Loading images for selectedFid:', selectedFid, 'current loadingFid:', loadingFidRef.current);
      // Clear images and reset state when loading a new user
      setImages([]);
      setCursor(null);
      cursorRef.current = null;
      setCurrentIndex(0);
      loadImages(selectedFid, true);
    }
  }, [selectedFid, user?.fid, loadImages]);

  // Reset modal close state when switching users
  useEffect(() => {
    setHasUserClosedModal(false);
  }, [selectedFid]);

  // Keep modal image in sync with current index
  useEffect(() => {
    if (images.length > 0 && currentIndex >= 0 && currentIndex < images.length) {
      setModalImageUrl(images[currentIndex].imageUrl);
      if (!hasUserClosedModal) {
        setIsModalOpen(true);
      }
    } else if (images.length === 0) {
      setModalImageUrl(null);
      setIsModalOpen(false);
    }
  }, [images, currentIndex, hasUserClosedModal]);

  // Check admin access
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

  // Search users
  useEffect(() => {
    if (searchTerm.length < 2) {
      setSearchResults([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          q: searchTerm,
          limit: "10",
        });
        if (user?.fid) {
          params.append("viewerFid", user.fid.toString());
        }

        const response = await fetch(`/api/user/search?${params}`);
        if (response.ok) {
          const data = await response.json();
          setSearchResults(data.users || []);
          // Auto-select if exact match found
          const exactMatch = data.users?.find(
            (u: any) => u.username?.toLowerCase() === searchTerm.toLowerCase().replace(/^@/, "")
          );
          if (exactMatch && exactMatch.fid !== selectedFid) {
            handleSelectUser(exactMatch);
          }
        }
      } catch (error) {
        console.error("Error searching users:", error);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchTerm, user?.fid, selectedFid, handleSelectUser]);

  // Scroll to image
  const goToPreviousImage = useCallback(() => {
    // Prevent concurrent navigations
    if (isNavigatingRef.current) {
      console.log('[goToPreviousImage] BLOCKED - navigation in progress');
      return;
    }
    
    isNavigatingRef.current = true;
    const currentIdx = currentIndexRef.current;
    console.log('[goToPreviousImage] currentIndex:', currentIdx, 'images.length:', images.length);
    
    if (currentIdx > 0) {
      setCurrentIndex((prev) => {
        const newIndex = Math.max(0, prev - 1);
        console.log('[goToPreviousImage] setting index from', prev, 'to', newIndex);
        setTimeout(() => {
          isNavigatingRef.current = false;
        }, 100);
        return newIndex;
      });
    } else {
      isNavigatingRef.current = false;
    }
  }, [images.length]);

  const goToNextImage = useCallback(() => {
    // Prevent concurrent navigations
    if (isNavigatingRef.current) {
      console.log('[goToNextImage] BLOCKED - navigation in progress');
      return;
    }
    
    isNavigatingRef.current = true;
    const currentIdx = currentIndexRef.current;
    console.log('[goToNextImage] currentIndex:', currentIdx, 'images.length:', images.length, 'hasMore:', hasMore);
    
    if (currentIdx < images.length - 1) {
      setCurrentIndex((prev) => {
        const newIndex = Math.min(images.length - 1, prev + 1);
        console.log('[goToNextImage] setting index from', prev, 'to', newIndex);
        setTimeout(() => {
          isNavigatingRef.current = false;
        }, 100);
        return newIndex;
      });
    } else if (hasMore && selectedFid) {
      console.log('[goToNextImage] loading more images, pendingIndex:', currentIdx + 1);
      setPendingIndex(currentIdx + 1);
      loadImages(selectedFid);
      setTimeout(() => {
        isNavigatingRef.current = false;
      }, 100);
    } else {
      isNavigatingRef.current = false;
    }
  }, [images.length, hasMore, selectedFid, loadImages]);

  const canGoPrevious = currentIndex > 0;
  const canGoNext = currentIndex < images.length - 1 || hasMore;

  // Sync ref with state
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  // Update modal image when index changes (if modal is open)
  useEffect(() => {
    console.log('[currentIndex changed]', currentIndex, 'images.length:', images.length, 'isModalOpen:', isModalOpen);
    if (isModalOpen && images.length > 0 && currentIndex >= 0 && currentIndex < images.length) {
      console.log('[currentIndex] updating modal image to index', currentIndex);
      setModalImageUrl(images[currentIndex].imageUrl);
    }
  }, [currentIndex, images, isModalOpen]);

  useEffect(() => {
    if (pendingIndex !== null && pendingIndex < images.length) {
      setCurrentIndex(pendingIndex);
      setPendingIndex(null);
    }
  }, [images.length, pendingIndex]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        goToPreviousImage();
      } else if (e.key === "ArrowRight") {
        if (currentIndex >= images.length - 1 && hasMore && selectedFid && !loadingImages) {
          setPendingIndex(currentIndex + 1);
          loadImages(selectedFid);
        } else {
          goToNextImage();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, images.length, hasMore, selectedFid, loadingImages, goToPreviousImage, goToNextImage, loadImages]);

  // Wheel navigation is handled in the ImageModal component only


  // Load more when scrolling near the end
  useEffect(() => {
    if (currentIndex >= images.length - 5 && hasMore && !loadingImages && selectedFid) {
      loadImages(selectedFid);
    }
  }, [currentIndex, images.length, hasMore, loadingImages, selectedFid, loadImages]);

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
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          Art Feed
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          View images from any user's casts in a gallery
        </p>
        
        <div className="max-w-md relative">
            <input
              type="text"
              placeholder="Search user by username..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setShowSearch(true);
              }}
              onFocus={() => setShowSearch(true)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
            />
            {showSearch && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto z-50">
                {searchResults.map((userResult) => (
                  <button
                    key={userResult.fid}
                    onClick={() => handleSelectUser(userResult)}
                    className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-3"
                  >
                    {userResult.pfp_url && (
                      <img
                        src={userResult.pfp_url}
                        alt=""
                        className="w-8 h-8 rounded-full"
                      />
                    )}
                    <div>
                      <div className="font-medium text-gray-900 dark:text-gray-100">
                        {userResult.display_name || userResult.username}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        @{userResult.username}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
        </div>

        {selectedUsername && (
          <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Viewing: @{selectedUsername}
          </div>
        )}
      </div>

      {/* Image Gallery */}
      {images.length > 0 ? (
        <div className="pb-16">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5">
            {images.map((image, index) => {
              if (!image.imageUrl) {
                return null;
              }
              return (
                <button
                  key={`${image.castHash}-${index}`}
                  onClick={() => {
                    setHasUserClosedModal(false);
                    setIsModalOpen(true);
                    setModalImageUrl(image.imageUrl);
                    setCurrentIndex(index);
                  }}
                  className="relative group aspect-square overflow-hidden rounded-xl bg-black/5 dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <img
                    src={image.imageUrl}
                    alt={image.castText || "Art"}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading={index < 6 ? "eager" : "lazy"}
                    crossOrigin="anonymous"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      if (!target.src.includes("/api/image-proxy")) {
                        target.src = `/api/image-proxy?url=${encodeURIComponent(image.imageUrl)}`;
                      }
                    }}
                  />
                  <div className="pointer-events-none absolute inset-0 rounded-xl border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              );
            })}
          </div>

          {hasMore && selectedFid && (
            <div className="mt-10 flex justify-center">
              <button
                onClick={() => loadImages(selectedFid)}
                disabled={loadingImages}
                className="px-6 py-3 rounded-full bg-black text-white dark:bg-white dark:text-black text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed hover:scale-105 transition-transform"
              >
                {loadingImages ? "Loading..." : "Load more images"}
              </button>
            </div>
          )}
        </div>
      ) : selectedFid ? (
        <div className="flex items-center justify-center py-16">
          <div className="text-gray-500 dark:text-gray-400">
            {loadingImages ? "Loading images..." : "No images found for this user"}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              Search for a user to view their art feed
            </p>
            <p className="text-sm text-gray-400 dark:text-gray-500">
              Use the search bar above to find a user by username
            </p>
          </div>
        </div>
      )}

      {/* Image Modal */}
      {modalImageUrl && (
        <ImageModal
          imageUrl={modalImageUrl}
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setHasUserClosedModal(true);
          }}
          onPrevious={canGoPrevious ? goToPreviousImage : undefined}
          onNext={canGoNext ? goToNextImage : undefined}
          disablePrevious={!canGoPrevious}
          disableNext={!canGoNext}
          caption={selectedUsername ? `@${selectedUsername}` : undefined}
        />
      )}
    </div>
  );
}

export default function ArtFeedPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    }>
      <ArtFeedContent />
    </Suspense>
  );
}

