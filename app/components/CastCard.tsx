"use client";

import { useState, useRef, useEffect } from "react";
import { Cast } from "@neynar/nodejs-sdk/build/api";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ImageModal } from "./ImageModal";
import { useNeynarContext } from "@neynar/react";
import { QuoteCastModal } from "./QuoteCastModal";
import { CastComposer } from "./CastComposer";

interface CastCardProps {
  cast: Cast;
  showThread?: boolean;
  onUpdate?: () => void;
}

export function CastCard({ cast, showThread = false, onUpdate }: CastCardProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showRecastMenu, setShowRecastMenu] = useState(false);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [isLiked, setIsLiked] = useState(cast.viewer_context?.liked || false);
  const [isRecasted, setIsRecasted] = useState(cast.viewer_context?.recasted || false);
  const [likesCount, setLikesCount] = useState(cast.reactions?.likes_count || 0);
  const [recastsCount, setRecastsCount] = useState(cast.reactions?.recasts_count || 0);
  const [isReacting, setIsReacting] = useState(false);
  const recastMenuRef = useRef<HTMLDivElement>(null);
  const { user } = useNeynarContext();

  // Close recast menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (recastMenuRef.current && !recastMenuRef.current.contains(event.target as Node)) {
        setShowRecastMenu(false);
      }
    };

    if (showRecastMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showRecastMenu]);

  const handleLike = async () => {
    if (!user?.signer_uuid) {
      alert("Please sign in to like casts");
      return;
    }

    try {
      setIsReacting(true);
      const wasLiked = isLiked;
      const newLikesCount = wasLiked ? likesCount - 1 : likesCount + 1;
      
      // Optimistic update
      setIsLiked(!wasLiked);
      setLikesCount(newLikesCount);

      const response = await fetch("/api/reaction", {
        method: wasLiked ? "DELETE" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          signerUuid: user.signer_uuid,
          reactionType: "like",
          target: cast.hash,
          targetAuthorFid: cast.author.fid,
        }),
      });

      if (!response.ok) {
        // Revert optimistic update on error
        setIsLiked(wasLiked);
        setLikesCount(likesCount);
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to toggle like");
      }

      if (onUpdate) {
        onUpdate();
      }
    } catch (error: any) {
      console.error("Like error:", error);
      alert(error.message || "Failed to toggle like");
    } finally {
      setIsReacting(false);
    }
  };

  const handleRecast = async () => {
    if (!user?.signer_uuid) {
      alert("Please sign in to recast");
      return;
    }

    try {
      setIsReacting(true);
      setShowRecastMenu(false);
      const wasRecasted = isRecasted;
      const newRecastsCount = wasRecasted ? recastsCount - 1 : recastsCount + 1;
      
      // Optimistic update
      setIsRecasted(!wasRecasted);
      setRecastsCount(newRecastsCount);

      const response = await fetch("/api/reaction", {
        method: wasRecasted ? "DELETE" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          signerUuid: user.signer_uuid,
          reactionType: "recast",
          target: cast.hash,
          targetAuthorFid: cast.author.fid,
        }),
      });

      if (!response.ok) {
        // Revert optimistic update on error
        setIsRecasted(wasRecasted);
        setRecastsCount(recastsCount);
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to toggle recast");
      }

      if (onUpdate) {
        onUpdate();
      }
    } catch (error: any) {
      console.error("Recast error:", error);
      alert(error.message || "Failed to toggle recast");
    } finally {
      setIsReacting(false);
    }
  };

  const handleQuote = () => {
    if (!user?.signer_uuid) {
      alert("Please sign in to quote casts");
      return;
    }
    setShowRecastMenu(false);
    setShowQuoteModal(true);
  };

  const author = cast.author;
  const timestamp = new Date(cast.timestamp);
  const timeAgo = formatDistanceToNow(timestamp, { addSuffix: true });

  return (
    <>
      <div className="border-b border-gray-200 dark:border-gray-800 py-6 px-4 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
        <div className="flex gap-3">
          {/* Avatar */}
          <Link href={`/profile/${author.fid}`}>
            <img
              src={author.pfp_url || "/default-avatar.png"}
              alt={author.username}
              className="w-12 h-12 rounded-full cursor-pointer hover:opacity-80 transition-opacity"
            />
          </Link>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Author info */}
            <div className="flex items-center gap-2 mb-2">
              <Link href={`/profile/${author.fid}`}>
                <span className="font-semibold text-gray-900 dark:text-gray-100 hover:underline cursor-pointer">
                  {author.display_name || author.username}
                </span>
              </Link>
              <span className="text-gray-500 dark:text-gray-400 text-sm">
                @{author.username}
              </span>
              {author.power_badge && (
                <span className="text-blue-500" title="Power Badge">
                  ⚡
                </span>
              )}
              <span className="text-gray-400 dark:text-gray-500 text-sm">
                · {timeAgo}
              </span>
            </div>

            {/* Cast text */}
            <div className="text-gray-900 dark:text-gray-100 mb-3 whitespace-pre-wrap break-words text-base leading-7">
              {cast.text}
            </div>

            {/* Embeds */}
            {cast.embeds && cast.embeds.length > 0 && (
              <div className="mb-3 space-y-2">
                {cast.embeds.map((embed: any, index: number) => {
                  // URL embed (images, videos, links)
                  if (embed.url) {
                    const metadata = embed.metadata;
                    
                    // HTML metadata (for link previews)
                    if (metadata?.html) {
                      const htmlMeta = metadata.html;
                      const ogImage = htmlMeta.ogImage && htmlMeta.ogImage.length > 0 ? htmlMeta.ogImage[0] : null;
                      const imageUrl = ogImage?.url || null;
                      const title = htmlMeta.ogTitle || htmlMeta.title || null;
                      const description = htmlMeta.ogDescription || htmlMeta.description || null;
                      
                      return (
                        <div key={index} className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
                          <a
                            href={embed.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block"
                          >
                            {imageUrl && (
                              <img
                                src={imageUrl}
                                alt={title || "Link preview"}
                                className="w-full max-h-96 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setSelectedImage(imageUrl);
                                }}
                              />
                            )}
                            <div className="p-3">
                              {title && (
                                <div className="font-semibold text-sm text-gray-900 dark:text-gray-100 mb-1">
                                  {title}
                                </div>
                              )}
                              {description && (
                                <div className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                                  {description}
                                </div>
                              )}
                              <div className="text-xs text-gray-500 dark:text-gray-500 mt-2 truncate">
                                {new URL(embed.url).hostname}
                              </div>
                            </div>
                          </a>
                        </div>
                      );
                    }
                    
                    // Image embed (direct image URL)
                    if (metadata?.image || (metadata?.content_type && metadata.content_type.startsWith('image/'))) {
                      return (
                        <div key={index} className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800">
                          <a
                            href={embed.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block"
                          >
                            <img
                              src={embed.url}
                              alt="Embedded image"
                              className="w-full max-h-96 object-contain bg-gray-50 dark:bg-gray-900 cursor-pointer hover:opacity-90 transition-opacity"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setSelectedImage(embed.url);
                              }}
                            />
                          </a>
                        </div>
                      );
                    }
                    
                    // Video embed
                    if (metadata?.video) {
                      const videoMeta = metadata.video;
                      return (
                        <div key={index} className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800">
                          <video
                            src={videoMeta.url || embed.url}
                            controls
                            className="w-full max-h-96"
                          />
                        </div>
                      );
                    }
                    
                    // Generic URL embed (fallback)
                    return (
                      <div key={index} className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 bg-gray-50 dark:bg-gray-900">
                        <a
                          href={embed.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 hover:underline text-sm break-all"
                        >
                          {embed.url}
                        </a>
                      </div>
                    );
                  }
                  // Cast embed (quoted cast)
                  if (embed.cast_id || embed.cast) {
                    // Get hash from cast object or cast_id object
                    const quotedCastHash = embed.cast?.hash || 
                                         (embed.cast_id && typeof embed.cast_id === 'object' && 'hash' in embed.cast_id ? embed.cast_id.hash : null);
                    
                    return (
                      <div key={index} className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 bg-gray-50 dark:bg-gray-900">
                        <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                          Quoted cast
                        </div>
                        {embed.cast && (
                          <Link
                            href={quotedCastHash ? `/cast/${quotedCastHash}` : "#"}
                            className="block pl-3 border-l-2 border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-r-lg transition-colors cursor-pointer"
                            onClick={(e) => {
                              if (!quotedCastHash) {
                                e.preventDefault();
                              }
                            }}
                          >
                            <div className="text-xs text-gray-500 dark:text-gray-500 mb-1">
                              @{embed.cast.author?.username || "unknown"}
                            </div>
                            <div className="text-sm text-gray-900 dark:text-gray-100 mb-2">
                              {embed.cast.text}
                            </div>
                            
                            {/* Show embeds from quoted cast in smaller format */}
                            {embed.cast.embeds && embed.cast.embeds.length > 0 && (
                              <div className="mt-2">
                                {/* Collect all image embeds first */}
                                {(() => {
                                  const imageEmbeds: string[] = [];
                                  
                                  embed.cast.embeds.forEach((quotedEmbed: any) => {
                                    if (quotedEmbed.url) {
                                      const quotedMetadata = quotedEmbed.metadata;
                                      
                                      // HTML metadata with image
                                      if (quotedMetadata?.html) {
                                        const htmlMeta = quotedMetadata.html;
                                        const ogImage = htmlMeta.ogImage && htmlMeta.ogImage.length > 0 ? htmlMeta.ogImage[0] : null;
                                        if (ogImage?.url) {
                                          imageEmbeds.push(ogImage.url);
                                        }
                                      }
                                      
                                      // Direct image embed
                                      if (quotedMetadata?.image || (quotedMetadata?.content_type && quotedMetadata.content_type.startsWith('image/'))) {
                                        imageEmbeds.push(quotedEmbed.url);
                                      }
                                    }
                                  });
                                  
                                  if (imageEmbeds.length > 0) {
                                    // Display images in a grid - use consistent sizing
                                    let gridClass = "grid gap-1";
                                    if (imageEmbeds.length === 1) {
                                      gridClass += " grid-cols-1";
                                    } else if (imageEmbeds.length === 2) {
                                      gridClass += " grid-cols-2";
                                    } else if (imageEmbeds.length <= 4) {
                                      gridClass += " grid-cols-2";
                                    } else {
                                      gridClass += " grid-cols-3";
                                    }
                                    
                                    return (
                                      <div className={gridClass}>
                                        {imageEmbeds.map((imageUrl, imgIndex) => (
                                          <img
                                            key={imgIndex}
                                            src={imageUrl}
                                            alt="Quoted cast image"
                                            className="w-full aspect-square object-cover rounded border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 cursor-pointer hover:opacity-90 transition-opacity"
                                            onClick={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              setSelectedImage(imageUrl);
                                            }}
                                          />
                                        ))}
                                      </div>
                                    );
                                  }
                                  
                                  return null;
                                })()}
                                
                                {/* Show other embeds (nested casts, etc.) */}
                                {embed.cast.embeds.map((quotedEmbed: any, quotedIndex: number) => {
                                  // Skip image embeds (already handled above)
                                  if (quotedEmbed.url) {
                                    const quotedMetadata = quotedEmbed.metadata;
                                    if (quotedMetadata?.html?.ogImage || quotedMetadata?.image || (quotedMetadata?.content_type && quotedMetadata.content_type.startsWith('image/'))) {
                                      return null;
                                    }
                                  }
                                  
                                  // Nested cast embeds (quoted cast within quoted cast)
                                  if (quotedEmbed.cast_id || quotedEmbed.cast) {
                                    return (
                                      <div key={quotedIndex} className="mt-2 text-xs text-gray-500 dark:text-gray-400 italic pl-2 border-l border-gray-300 dark:border-gray-600">
                                        Quoted: @{quotedEmbed.cast?.author?.username || "unknown"}
                                      </div>
                                    );
                                  }
                                  
                                  return null;
                                })}
                              </div>
                            )}
                          </Link>
                        )}
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            )}

            {/* Channel */}
            {cast.channel && (
              <div className="mb-3">
                <Link
                  href={`/channel/${cast.channel.id}`}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  <span>#{cast.channel.name}</span>
                </Link>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-6 mt-4">
              {/* Reply */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (!user) {
                      alert("Please sign in to reply");
                      return;
                    }
                    setShowReplyBox(!showReplyBox);
                  }}
                  className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  <span>💬</span>
                  <span>{cast.replies?.count || 0}</span>
                </button>
                {showThread && cast.hash && (
                  <Link
                    href={`/cast/${cast.hash}`}
                    className="text-xs text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    title="View full thread"
                  >
                    →
                  </Link>
                )}
              </div>

              {/* Like */}
              <button
                onClick={handleLike}
                disabled={isReacting || !user}
                className={`flex items-center gap-2 text-sm transition-colors ${
                  isLiked
                    ? "text-red-600 dark:text-red-400"
                    : "text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <span>❤️</span>
                <span>{likesCount}</span>
              </button>

              {/* Recast menu */}
              <div className="relative" ref={recastMenuRef}>
                <button
                  onClick={() => setShowRecastMenu(!showRecastMenu)}
                  disabled={isReacting || !user}
                  className={`flex items-center gap-2 text-sm transition-colors ${
                    isRecasted
                      ? "text-green-600 dark:text-green-400"
                      : "text-gray-500 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-400"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <span>🔄</span>
                  <span>{recastsCount}</span>
                </button>

                {/* Dropdown menu */}
                {showRecastMenu && user && (
                  <div className="absolute left-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 min-w-[160px]">
                    <button
                      onClick={handleRecast}
                      className="w-full text-left px-4 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      {isRecasted ? "Undo Recast" : "Recast"}
                    </button>
                    <button
                      onClick={handleQuote}
                      className="w-full text-left px-4 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border-t border-gray-200 dark:border-gray-700"
                    >
                      Quote Cast
                    </button>
                  </div>
                )}
              </div>

              {/* Thread link */}
              {showThread && cast.hash && (
                <Link
                  href={`/cast/${cast.hash}`}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  View thread →
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Reply box */}
        {showReplyBox && (
          <div className="mt-2 pl-14 border-t border-gray-200 dark:border-gray-800 pt-4">
            <CastComposer
              parentHash={cast.hash}
              onSuccess={() => {
                setShowReplyBox(false);
                if (onUpdate) {
                  onUpdate();
                }
              }}
            />
          </div>
        )}
      </div>

      {/* Image Modal */}
      {selectedImage && (
        <ImageModal
          imageUrl={selectedImage}
          isOpen={!!selectedImage}
          onClose={() => setSelectedImage(null)}
        />
      )}

      {/* Quote Cast Modal */}
      {showQuoteModal && (
        <QuoteCastModal
          cast={cast}
          isOpen={showQuoteModal}
          onClose={() => setShowQuoteModal(false)}
          onSuccess={() => {
            setShowQuoteModal(false);
            if (onUpdate) {
              onUpdate();
            }
          }}
        />
      )}
    </>
  );
}
