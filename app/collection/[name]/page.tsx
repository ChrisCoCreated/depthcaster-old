"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { use } from "react";
import { CastCard } from "../../components/CastCard";
import { Cast } from "@neynar/nodejs-sdk/build/api";
import { useNeynarContext } from "@neynar/react";
import { ImageModal } from "../../components/ImageModal";
import { DisplayMode } from "@/lib/customFeeds";

interface CollectionInfo {
  name: string;
  displayName: string | null;
  description: string | null;
  displayType: "text" | "image" | "image-text";
  displayMode: DisplayMode | null;
  headerConfig: {
    showChannelHeader?: boolean;
    customTitle?: string;
    customDescription?: string;
    headerImage?: string;
  } | null;
}

interface ImageItem {
  castHash: string;
  imageUrl: string;
  castText: string | null;
  cast: Cast;
}

export default function CollectionPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = use(params);
  const { user } = useNeynarContext();
  const [casts, setCasts] = useState<Cast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [collectionInfo, setCollectionInfo] = useState<CollectionInfo | null>(null);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalImageUrl, setModalImageUrl] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [hasUserClosedModal, setHasUserClosedModal] = useState(false);
  
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const lastFetchTimeRef = useRef<number>(0);
  const MIN_FETCH_INTERVAL = 500;

  // Extract images from casts
  useEffect(() => {
    if (collectionInfo?.displayType === "image" || collectionInfo?.displayType === "image-text") {
      const extractedImages: ImageItem[] = [];
      
      casts.forEach((cast) => {
        if (cast.embeds && Array.isArray(cast.embeds)) {
          cast.embeds.forEach((embed: any) => {
            let imageUrl: string | null = null;
            
            // Check if it's a direct image embed
            if (embed.metadata?.image || (embed.metadata?.content_type && embed.metadata.content_type.startsWith('image/'))) {
              imageUrl = embed.url;
            } else if (embed.url && embed.metadata?.html?.ogImage) {
              // Check for ogImage
              const ogImages = Array.isArray(embed.metadata.html.ogImage) 
                ? embed.metadata.html.ogImage 
                : [embed.metadata.html.ogImage];
              const nonEmojiImage = ogImages.find((img: any) => {
                if (!img.url) return false;
                if (img.type === 'svg') return false;
                if (img.url.includes('twimg.com/emoji') || img.url.includes('/svg/')) return false;
                return true;
              });
              if (nonEmojiImage) imageUrl = nonEmojiImage.url;
            }
            
            if (imageUrl) {
              extractedImages.push({
                castHash: cast.hash,
                imageUrl,
                castText: cast.text || null,
                cast,
              });
            }
          });
        }
      });
      
      setImages(extractedImages);
    }
  }, [casts, collectionInfo?.displayType]);

  const fetchFeed = useCallback(async (newCursor?: string | null) => {
    const fetchStartTime = performance.now();
    const isInitialLoad = !newCursor;

    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        limit: "25",
      });

      if (user?.fid) {
        params.append("viewerFid", user.fid.toString());
      }

      if (newCursor) {
        params.append("cursor", newCursor);
      }

      const response = await fetch(`/api/collections/${name}?${params}`);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Collection not found");
        }
        throw new Error("Failed to fetch collection");
      }

      const data = await response.json();

      if (newCursor) {
        setCasts((prev) => [...prev, ...data.casts]);
      } else {
        setCasts(data.casts);
        if (data.collection) {
          setCollectionInfo({
            name: data.collection.name,
            displayName: data.collection.displayName,
            description: data.collection.description,
            displayType: data.collection.displayType,
            displayMode: data.collection.displayMode || null,
            headerConfig: data.collection.headerConfig || null,
          });
        }
      }

      setCursor(data.next?.cursor || null);
      setHasMore(!!data.next?.cursor);
    } catch (err: unknown) {
      const error = err as { message?: string };
      console.error(`[Collection] Error:`, error.message || "Failed to load collection");
      setError(error.message || "Failed to load collection");
    } finally {
      setLoading(false);
      lastFetchTimeRef.current = Date.now();
    }
  }, [name, user?.fid]);

  // Initial load
  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  const loadMore = useCallback(() => {
    const now = Date.now();
    const timeSinceLastFetch = now - lastFetchTimeRef.current;

    if (timeSinceLastFetch < MIN_FETCH_INTERVAL) {
      return;
    }

    if (loading || !hasMore || !cursor) {
      return;
    }

    lastFetchTimeRef.current = now;
    fetchFeed(cursor);
  }, [loading, hasMore, cursor, fetchFeed]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const target = entries[0];
        if (target.isIntersecting && hasMore && !loading) {
          loadMore();
        }
      },
      {
        root: null,
        rootMargin: "400px",
        threshold: 0.1,
      }
    );

    const currentRef = loadMoreRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [hasMore, loading, loadMore]);

  // Image modal navigation
  const handlePreviousImage = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setModalImageUrl(images[currentIndex - 1].imageUrl);
      setHasUserClosedModal(false);
    }
  };

  const handleNextImage = () => {
    if (currentIndex < images.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setModalImageUrl(images[currentIndex + 1].imageUrl);
      setHasUserClosedModal(false);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen">
        <main className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-red-500 dark:text-red-400">Error: {error}</div>
        </main>
      </div>
    );
  }

  const displayType = collectionInfo?.displayType || "text";
  const headerImage = collectionInfo?.headerConfig?.headerImage;
  const customTitle = collectionInfo?.headerConfig?.customTitle;
  const displayName = collectionInfo?.displayName || collectionInfo?.name || name;

  return (
    <div className="min-h-screen">
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Collection Header */}
        <div className="mb-6">
          {headerImage && (
            <div className="mb-4">
              <img 
                src={headerImage} 
                alt={customTitle || displayName} 
                className="w-full max-w-4xl rounded-lg"
              />
            </div>
          )}
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {customTitle || displayName}
          </h1>
          {collectionInfo?.description && (
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              {collectionInfo.description}
            </p>
          )}
        </div>

        {/* Image Gallery View */}
        {displayType === "image" && images.length > 0 && (
          <div className="pb-16">
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5">
              {images.map((image, index) => (
                <button
                  key={`${image.castHash}-${index}`}
                  onClick={() => {
                    setHasUserClosedModal(false);
                    setIsModalOpen(true);
                    setModalImageUrl(image.imageUrl);
                    setCurrentIndex(index);
                  }}
                  className="relative group aspect-square overflow-hidden rounded-xl bg-black/5 dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <img
                    src={image.imageUrl}
                    alt={image.castText || "Collection image"}
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
              ))}
            </div>
          </div>
        )}

        {/* Text/Image-Text View */}
        {(displayType === "text" || displayType === "image-text") && (
          <div className="space-y-4">
            {casts.map((cast) => (
              <CastCard
                key={cast.hash}
                cast={cast}
                displayMode={collectionInfo?.displayMode || undefined}
              />
            ))}
          </div>
        )}

        {/* Loading indicator */}
        {loading && casts.length === 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            Loading collection...
          </div>
        )}

        {/* Load more trigger */}
        {hasMore && (
          <div ref={loadMoreRef} className="h-20 flex items-center justify-center">
            {loading && casts.length > 0 && (
              <div className="text-gray-500 dark:text-gray-400">Loading more...</div>
            )}
          </div>
        )}

        {/* End of feed message */}
        {!hasMore && casts.length > 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No more casts in this collection
          </div>
        )}

        {/* Image Modal */}
        {isModalOpen && modalImageUrl && (
          <ImageModal
            imageUrl={modalImageUrl}
            isOpen={isModalOpen}
            onClose={() => {
              setIsModalOpen(false);
              setHasUserClosedModal(true);
            }}
            onPrevious={currentIndex > 0 ? handlePreviousImage : undefined}
            onNext={currentIndex < images.length - 1 ? handleNextImage : undefined}
            disablePrevious={currentIndex === 0}
            disableNext={currentIndex === images.length - 1}
            caption={images[currentIndex]?.castText || undefined}
          />
        )}
      </main>
    </div>
  );
}

