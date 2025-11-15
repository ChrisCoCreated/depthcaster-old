"use client";

import { useState, useRef, useEffect, type ReactElement } from "react";
import { Cast } from "@neynar/nodejs-sdk/build/api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { ImageModal } from "./ImageModal";
import { useNeynarContext } from "@neynar/react";
import { QuoteCastModal } from "./QuoteCastModal";
import { CastComposer } from "./CastComposer";
import { AutoLikeNotification } from "./AutoLikeNotification";
import { MessageCircle, Heart, Repeat2, Star, Share2, RefreshCw, Tag } from "lucide-react";
import { shouldHideImages } from "./FeedSettings";
import { convertBaseAppLinksInline, isFarcasterLink, extractCastHashFromUrl } from "@/lib/link-converter";

// Helper function to convert URLs in text to clickable links
function renderTextWithLinks(text: string, router: ReturnType<typeof useRouter>) {
  // First, convert base.app links inline
  const textWithConvertedBaseLinks = convertBaseAppLinksInline(text);
  
  // URL regex pattern - matches http(s):// URLs, www. URLs, domain-like patterns, and /cast/ paths
  const urlRegex = /(https?:\/\/[^\s<>"']+)|(www\.[^\s<>"']+)|(\/cast\/0x[a-fA-F0-9]{8,})|([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.(?:[a-zA-Z]{2,})(?:\/[^\s<>"']*)?)/g;
  
  const parts: (string | ReactElement)[] = [];
  let lastIndex = 0;
  let match;
  
  while ((match = urlRegex.exec(textWithConvertedBaseLinks)) !== null) {
    // Skip if it looks like an email address (has @ before it)
    const beforeMatch = textWithConvertedBaseLinks.substring(Math.max(0, match.index - 50), match.index);
    if (beforeMatch.includes('@') && !beforeMatch.match(/@[\s\n]/)) {
      continue;
    }
    
    // Add text before the URL
    if (match.index > lastIndex) {
      parts.push(textWithConvertedBaseLinks.substring(lastIndex, match.index));
    }
    
    // Determine the full URL - use the first non-empty capture group
    let url = match[1] || match[2] || match[3] || match[4];
    let displayText = match[0];
    
    // Check if it's a Depthcaster link (already converted base.app link)
    if (url && url.startsWith('/cast/')) {
      parts.push(
        <Link
          key={match.index}
          href={url}
          className="text-blue-600 dark:text-blue-400 hover:underline break-all"
          onClick={(e) => e.stopPropagation()}
        >
          {displayText}
        </Link>
      );
    }
    // Handle external URLs
    else {
      // Ensure URL is absolute for external links
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      
      // Check if it's a Farcaster link (farcaster.xyz, warpcast.com) - convert on click
      if (isFarcasterLink(url)) {
        const hash = extractCastHashFromUrl(url);
        // Full cast hash is 0x + 64 hex chars = 66 chars total
        if (hash && hash.length === 66) {
          // Full hash found - convert directly
          parts.push(
            <a
              key={match.index}
              href={`/cast/${hash}`}
              className="text-blue-600 dark:text-blue-400 hover:underline break-all"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                router.push(`/cast/${hash}`);
              }}
            >
              {displayText}
            </a>
          );
        } else {
          // Hash not found or truncated - resolve via API on click
          parts.push(
            <a
              key={match.index}
              href={url}
              className="text-blue-600 dark:text-blue-400 hover:underline break-all"
              onClick={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                try {
                  // Resolve the URL to get the cast hash
                  const response = await fetch(`/api/conversation?identifier=${encodeURIComponent(url)}&type=url&replyDepth=0`);
                  if (response.ok) {
                    const data = await response.json();
                    const castHash = data?.conversation?.cast?.hash;
                    if (castHash) {
                      router.push(`/cast/${castHash}`);
                    } else {
                      // Fallback to external link
                      window.open(url, '_blank');
                    }
                  } else {
                    // Fallback to external link on error
                    window.open(url, '_blank');
                  }
                } catch (error) {
                  console.error('Failed to resolve Farcaster link:', error);
                  // Fallback to external link
                  window.open(url, '_blank');
                }
              }}
            >
              {displayText}
            </a>
          );
        }
      }
      // Regular external link
      else {
        parts.push(
          <a
            key={match.index}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:underline break-all"
            onClick={(e) => e.stopPropagation()}
          >
            {displayText}
          </a>
        );
      }
    }
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < textWithConvertedBaseLinks.length) {
    parts.push(textWithConvertedBaseLinks.substring(lastIndex));
  }
  
  return parts.length > 0 ? parts : textWithConvertedBaseLinks;
}

interface MinimalReplyCardProps {
  reply: any;
  onUpdate?: () => void;
  parentCastHash: string;
}

function MinimalReplyCard({ reply, onUpdate, parentCastHash }: MinimalReplyCardProps) {
  const router = useRouter();
  const { user } = useNeynarContext();
  const replyAuthor = reply.author;
  const replyTimestamp = new Date(reply.timestamp);
  const replyTimeAgo = formatDistanceToNow(replyTimestamp, { addSuffix: true });
  const replyText = reply.text || "";
  const truncatedText = replyText.length > 150 
    ? replyText.substring(0, 150) + "..." 
    : replyText;
  
  const [replyLiked, setReplyLiked] = useState(reply.viewer_context?.liked || false);
  const [replyRecasted, setReplyRecasted] = useState(reply.viewer_context?.recasted || false);
  const [replyLikesCount, setReplyLikesCount] = useState(reply.reactions?.likes_count || 0);
  const [replyRecastsCount, setReplyRecastsCount] = useState(reply.reactions?.recasts_count || 0);
  const [replyReacting, setReplyReacting] = useState(false);
  
  const handleReplyLike = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user?.signer_uuid) {
      alert("Please sign in to like casts");
      return;
    }

    try {
      setReplyReacting(true);
      const wasLiked = replyLiked;
      const newLikesCount = wasLiked ? replyLikesCount - 1 : replyLikesCount + 1;
      
      // Optimistic update
      setReplyLiked(!wasLiked);
      setReplyLikesCount(newLikesCount);

      const response = await fetch("/api/reaction", {
        method: wasLiked ? "DELETE" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          signerUuid: user.signer_uuid,
          reactionType: "like",
          target: reply.hash,
          targetAuthorFid: replyAuthor?.fid,
        }),
      });

      if (!response.ok) {
        // Revert optimistic update on error
        setReplyLiked(wasLiked);
        setReplyLikesCount(replyLikesCount);
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to toggle like");
      }
    } catch (error: any) {
      console.error("Like error:", error);
      alert(error.message || "Failed to toggle like");
    } finally {
      setReplyReacting(false);
    }
  };

  const handleReplyRecast = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user?.signer_uuid) {
      alert("Please sign in to recast");
      return;
    }

    try {
      setReplyReacting(true);
      const wasRecasted = replyRecasted;
      const newRecastsCount = wasRecasted ? replyRecastsCount - 1 : replyRecastsCount + 1;
      
      // Optimistic update
      setReplyRecasted(!wasRecasted);
      setReplyRecastsCount(newRecastsCount);

      const response = await fetch("/api/reaction", {
        method: wasRecasted ? "DELETE" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          signerUuid: user.signer_uuid,
          reactionType: "recast",
          target: reply.hash,
          targetAuthorFid: replyAuthor?.fid,
        }),
      });

      if (!response.ok) {
        // Revert optimistic update on error
        setReplyRecasted(wasRecasted);
        setReplyRecastsCount(replyRecastsCount);
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
      setReplyReacting(false);
    }
  };

  const handleReplyClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    router.push(`/cast/${parentCastHash}?reply=true`);
  };

  return (
    <div className="p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors border border-gray-100 dark:border-gray-800">
      <div className="flex items-start gap-2">
        {/* Profile picture */}
        {replyAuthor?.pfp_url && (
          <Link
            href={`/profile/${replyAuthor.fid}`}
            onClick={(e) => e.stopPropagation()}
            className="flex-shrink-0"
          >
            <img
              src={replyAuthor.pfp_url}
              alt={replyAuthor.display_name || replyAuthor.username || "User"}
              className="w-6 h-6 rounded-full"
            />
          </Link>
        )}
        <div className="flex-1 min-w-0">
          {/* Header row with name, timestamp, and action buttons */}
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Link
              href={`/cast/${reply.hash}`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1.5 min-w-0"
            >
              <span className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
                {replyAuthor?.display_name || replyAuthor?.username || "Unknown"}
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                {replyTimeAgo}
              </span>
            </Link>
            {/* Action buttons */}
            <div className="flex items-center gap-2 ml-auto" onClick={(e) => e.stopPropagation()}>
              {/* Like */}
              <button
                onClick={handleReplyLike}
                disabled={replyReacting || !user}
                className={`flex items-center gap-0.5 text-xs transition-colors ${
                  replyLiked
                    ? "text-red-600 dark:text-red-400"
                    : "text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <Heart className={`w-3 h-3 ${replyLiked ? "fill-current" : ""}`} />
                {replyLikesCount > 0 && <span className="text-[10px]">{replyLikesCount}</span>}
              </button>

              {/* Recast */}
              <button
                onClick={handleReplyRecast}
                disabled={replyReacting || !user}
                className={`flex items-center gap-0.5 text-xs transition-colors ${
                  replyRecasted
                    ? "text-green-600 dark:text-green-400"
                    : "text-gray-500 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-400"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <Repeat2 className={`w-3 h-3 ${replyRecasted ? "stroke-[3]" : "stroke-[2]"}`} />
                {replyRecastsCount > 0 && <span className="text-[10px]">{replyRecastsCount}</span>}
              </button>

            </div>
          </div>
          {/* Reply text */}
          <Link
            href={`/cast/${reply.hash}`}
            onClick={(e) => e.stopPropagation()}
            className="block"
          >
            <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-2">
              {renderTextWithLinks(truncatedText, router)}
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}

interface DynamicImageGridProps {
  embeds: any[];
  indices: number[];
  embedMetadata: Map<string, { title: string | null; description: string | null; image: string | null; author_name?: string | null; author_url?: string | null }>;
  onImageClick: (url: string) => void;
}

function DynamicImageGrid({ embeds, indices, embedMetadata, onImageClick }: DynamicImageGridProps) {
  const [imageDimensions, setImageDimensions] = useState<Array<{ width: number; height: number; url: string; linkUrl: string } | null>>(
    embeds.map(() => null)
  );

  // Extract image URLs from embeds
  const extractImageUrl = (embed: any): { imageUrl: string | null; linkUrl: string } => {
    let imageUrl = embed.url;
    const linkUrl = embed.url;
    
    if (embed.metadata) {
      const metadata = embed.metadata;
      if (metadata.image || (metadata.content_type && metadata.content_type.startsWith('image/'))) {
        imageUrl = embed.url;
      } else {
        if (metadata.html?.ogImage) {
          const ogImages = Array.isArray(metadata.html.ogImage) ? metadata.html.ogImage : [metadata.html.ogImage];
          const nonEmojiImage = ogImages.find((img: any) => {
            if (!img.url) return false;
            if (img.type === 'svg') return false;
            if (img.url.includes('twimg.com/emoji') || img.url.includes('/svg/')) return false;
            return true;
          });
          if (nonEmojiImage) imageUrl = nonEmojiImage.url;
        }
        if (!imageUrl && metadata.image) {
          imageUrl = typeof metadata.image === 'string' ? metadata.image : metadata.image?.url || null;
        }
        if (!imageUrl && metadata.ogImage) {
          const ogImg = Array.isArray(metadata.ogImage) ? metadata.ogImage[0] : metadata.ogImage;
          imageUrl = typeof ogImg === 'string' ? ogImg : ogImg?.url || null;
        }
        if (!imageUrl) {
          const fetchedMeta = embedMetadata.get(embed.url);
          if (fetchedMeta?.image) {
            imageUrl = fetchedMeta.image;
          }
        }
      }
    }
    
    return { imageUrl, linkUrl };
  };

  // Load images and get dimensions
  useEffect(() => {
    const loadDimensions = async () => {
      const dimensions = await Promise.all(
        embeds.map(async (embed) => {
          const { imageUrl, linkUrl } = extractImageUrl(embed);
          if (!imageUrl) return null;

          return new Promise<{ width: number; height: number; url: string; linkUrl: string } | null>((resolve) => {
            const img = new Image();
            img.onload = () => {
              resolve({ width: img.naturalWidth, height: img.naturalHeight, url: imageUrl, linkUrl });
            };
            img.onerror = () => resolve(null);
            img.src = imageUrl;
          });
        })
      );

      setImageDimensions(dimensions);
    };

    loadDimensions();
  }, [embeds, embedMetadata]);

  // Calculate optimal layout based on image dimensions
  const calculateLayout = (dimensions: Array<{ width: number; height: number; url: string; linkUrl: string } | null>) => {
    const validDims = dimensions.filter((d): d is { width: number; height: number; url: string; linkUrl: string } => d !== null);
    const count = validDims.length;

    if (count === 0) return { cols: 6, rows: 6, spans: [] };

    // Calculate aspect ratios
    const aspectRatios = validDims.map(d => d.width / d.height);
    const isPortrait = (ratio: number) => ratio < 1;
    const isLandscape = (ratio: number) => ratio > 1.3;
    const isSquare = (ratio: number) => ratio >= 0.9 && ratio <= 1.1;

    // Using 6x6 grid (2:1 container ratio)
    const cols = 6;
    const rows = 6;

    if (count === 1) {
      return { cols, rows, spans: [{ col: 6, row: 6 }] };
    }

    if (count === 2) {
      const [r1, r2] = aspectRatios;
      const p1 = isPortrait(r1);
      const p2 = isPortrait(r2);
      const l1 = isLandscape(r1);
      const l2 = isLandscape(r2);
      
      // Both portraits: side by side
      if (p1 && p2) {
        return { cols, rows, spans: [{ col: 3, row: 6 }, { col: 3, row: 6 }] };
      }
      // Both landscape: stack vertically
      if (l1 && l2) {
        return { cols, rows, spans: [{ col: 6, row: 3 }, { col: 6, row: 3 }] };
      }
      // Mixed: optimize based on which is portrait/landscape
      // Portrait + Landscape: portrait takes less width, landscape takes more
      if (p1 && l2) {
        return { cols, rows, spans: [{ col: 2, row: 6 }, { col: 4, row: 6 }] };
      }
      if (l1 && p2) {
        return { cols, rows, spans: [{ col: 4, row: 6 }, { col: 2, row: 6 }] };
      }
      // Both square or mixed: equal split
      return { cols, rows, spans: [{ col: 3, row: 6 }, { col: 3, row: 6 }] };
    }

    if (count === 3) {
      const portraitCount = aspectRatios.filter(r => isPortrait(r)).length;
      const landscapeCount = aspectRatios.filter(r => isLandscape(r)).length;
      
      // If all portraits, side by side
      if (portraitCount === 3) {
        return { cols, rows, spans: [{ col: 2, row: 6 }, { col: 2, row: 6 }, { col: 2, row: 6 }] };
      }
      // If all landscape, stack
      if (landscapeCount === 3) {
        return { cols, rows, spans: [{ col: 6, row: 2 }, { col: 6, row: 2 }, { col: 6, row: 2 }] };
      }
      // Mixed: optimize based on aspect ratios
      // 2 portraits + 1 landscape: portraits narrower side by side, landscape full width below
      if (portraitCount === 2) {
        const landscapeIdx = aspectRatios.findIndex(r => isLandscape(r));
        const spans: Array<{ col: number; row: number }> = [];
        let portraitIdx = 0;
        for (let i = 0; i < 3; i++) {
          if (i === landscapeIdx) {
            spans.push({ col: 6, row: 3 }); // Landscape gets full width
          } else {
            spans.push({ col: 3, row: 3 }); // Portraits share top row
          }
        }
        return { cols, rows, spans };
      }
      // 1 portrait + 2 landscape: portrait narrow on left, landscapes wider on right
      if (portraitCount === 1) {
        const portraitIdx = aspectRatios.findIndex(r => isPortrait(r));
        const spans: Array<{ col: number; row: number }> = [];
        for (let i = 0; i < 3; i++) {
          if (i === portraitIdx) {
            spans.push({ col: 2, row: 6 }); // Portrait narrow, full height
          } else {
            spans.push({ col: 4, row: 3 }); // Landscapes wider, stacked
          }
        }
        return { cols, rows, spans };
      }
      // Fallback: balanced layout
      return { cols, rows, spans: [{ col: 2, row: 6 }, { col: 2, row: 6 }, { col: 2, row: 6 }] };
    }

    if (count === 4) {
      const portraitCount = aspectRatios.filter(r => isPortrait(r)).length;
      const landscapeCount = aspectRatios.filter(r => isLandscape(r)).length;
      
      // If mostly portraits (3+), use 2x2 grid
      if (portraitCount >= 3) {
        return {
          cols,
          rows,
          spans: [
            { col: 3, row: 3 },
            { col: 3, row: 3 },
            { col: 3, row: 3 },
            { col: 3, row: 3 }
          ]
        };
      }
      // If mostly landscape (3+), optimize for wider images
      if (landscapeCount >= 3) {
        // Top row: 2 landscapes side by side (wider)
        // Bottom row: 2 landscapes side by side (wider)
        return {
          cols,
          rows,
          spans: [
            { col: 3, row: 3 },
            { col: 3, row: 3 },
            { col: 3, row: 3 },
            { col: 3, row: 3 }
          ]
        };
      }
      // Mixed: 2 portraits + 2 landscapes
      // Arrange: portrait + landscape on top row, portrait + landscape on bottom row
      if (portraitCount === 2 && landscapeCount === 2) {
        // Build spans array in order of images
        const spans: Array<{ col: number; row: number }> = [];
        aspectRatios.forEach((r) => {
          if (isPortrait(r)) {
            spans.push({ col: 2, row: 3 }); // Portraits narrower
          } else if (isLandscape(r)) {
            spans.push({ col: 4, row: 3 }); // Landscapes wider
          } else {
            spans.push({ col: 3, row: 3 }); // Squares/default
          }
        });
        
        return { cols, rows, spans };
      }
      // Default: 2x2 grid
      return {
        cols,
        rows,
        spans: [
          { col: 3, row: 3 },
          { col: 3, row: 3 },
          { col: 3, row: 3 },
          { col: 3, row: 3 }
        ]
      };
    }

    // For 5+ images, use a balanced grid
    const spans: Array<{ col: number; row: number }> = [];
    let remaining = count;
    let currentRow = 0;

    while (remaining > 0 && currentRow < rows) {
      if (remaining >= 3) {
        spans.push({ col: 2, row: 2 }, { col: 2, row: 2 }, { col: 2, row: 2 });
        remaining -= 3;
        currentRow += 2;
      } else if (remaining === 2) {
        spans.push({ col: 3, row: 2 }, { col: 3, row: 2 });
        remaining -= 2;
        currentRow += 2;
      } else {
        spans.push({ col: 6, row: 2 });
        remaining -= 1;
        currentRow += 2;
      }
    }

    return { cols, rows, spans: spans.slice(0, count) };
  };

  const layout = calculateLayout(imageDimensions);
  const imageData = embeds.map((embed, idx) => {
    const dims = imageDimensions[idx];
    const { imageUrl, linkUrl } = extractImageUrl(embed);
    return { imageUrl, linkUrl, dimensions: dims };
  });

  return (
    <div
      className="w-full aspect-[2/1] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
        gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
        gap: '2px'
      }}
    >
      {imageData.map((data, imgIndex) => {
        if (!data.imageUrl) return null;
        const span = layout.spans[imgIndex] || { col: 2, row: 3 };

        return (
          <a
            key={indices[imgIndex]}
            href={data.linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block overflow-hidden bg-gray-100 dark:bg-gray-800 relative flex items-center justify-center"
            style={{
              gridColumn: `span ${span.col}`,
              gridRow: `span ${span.row}`
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onImageClick(data.imageUrl!);
            }}
          >
            <img
              src={data.imageUrl}
              alt="Embedded image"
              className="max-w-full max-h-full w-auto h-auto cursor-pointer hover:opacity-90 transition-opacity"
              style={{
                objectFit: 'contain'
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </a>
        );
      })}
    </div>
  );
}

interface CastCardProps {
  cast: Cast & { 
    _curatorFid?: number; 
    _curatorInfo?: { fid: number; username?: string; display_name?: string; pfp_url?: string };
    _topReplies?: any[];
    _repliesUpdatedAt?: Date | string;
  };
  showThread?: boolean;
  showTopReplies?: boolean;
  onUpdate?: () => void;
  feedType?: string; // 'curated' or other feed types
  curatorInfo?: { fid: number; username?: string; display_name?: string; pfp_url?: string };
}

export function CastCard({ cast, showThread = false, showTopReplies = true, onUpdate, feedType, curatorInfo }: CastCardProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showRecastMenu, setShowRecastMenu] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [isLiked, setIsLiked] = useState(cast.viewer_context?.liked || false);
  const [isRecasted, setIsRecasted] = useState(cast.viewer_context?.recasted || false);
  const [likesCount, setLikesCount] = useState(cast.reactions?.likes_count || 0);
  const [recastsCount, setRecastsCount] = useState(cast.reactions?.recasts_count || 0);
  const [isReacting, setIsReacting] = useState(false);
  const [isCurating, setIsCurating] = useState(false);
  const [isCurated, setIsCurated] = useState(false);
  const [curators, setCurators] = useState<Array<{ fid: number; username?: string; display_name?: string; pfp_url?: string }>>([]);
  const [showUncurateConfirm, setShowUncurateConfirm] = useState(false);
  const [isRefreshingReplies, setIsRefreshingReplies] = useState(false);
  const [topReplies, setTopReplies] = useState<any[]>(cast._topReplies || []);
  const [repliesUpdatedAt, setRepliesUpdatedAt] = useState<Date | string | null>(cast._repliesUpdatedAt || null);
  const [embedMetadata, setEmbedMetadata] = useState<Map<string, { title: string | null; description: string | null; image: string | null; author_name?: string | null; author_url?: string | null }>>(new Map());
  const fetchedUrlsRef = useRef<Set<string>>(new Set());
  const recastMenuRef = useRef<HTMLDivElement>(null);
  const shareMenuRef = useRef<HTMLDivElement>(null);
  const tagMenuRef = useRef<HTMLDivElement>(null);
  const { user } = useNeynarContext();
  const router = useRouter();
  const [preferencesVersion, setPreferencesVersion] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showTagMenu, setShowTagMenu] = useState(false);
  const [isTagging, setIsTagging] = useState(false);
  const [showAutoLikeNotification, setShowAutoLikeNotification] = useState(false);

  // Listen for preference changes to trigger re-render
  useEffect(() => {
    const handlePreferencesChange = () => {
      setPreferencesVersion((v) => v + 1);
    };
    window.addEventListener("feedPreferencesChanged", handlePreferencesChange);
    return () => {
      window.removeEventListener("feedPreferencesChanged", handlePreferencesChange);
    };
  }, []);

  // Fetch metadata for embeds that don't have it
  useEffect(() => {
    if (!cast.embeds) {
      return;
    }

    const fetchMetadataForEmbeds = async () => {
      const urlsToFetch: string[] = [];

      cast.embeds.forEach((embed: any, index: number) => {
        if (embed.url) {
          const metadata = embed.metadata;
          const urlObj = new URL(embed.url);
          const isXEmbed = urlObj.hostname === 'x.com' || urlObj.hostname === 'twitter.com' || urlObj.hostname === 'www.twitter.com' || urlObj.hostname === 'www.x.com';
          const hasMetadata = metadata?.html || metadata?.title || metadata?.description || metadata?.image || metadata?.ogImage;
          
          // For Twitter/X, check if we have oEmbed but missing thumbnail
          const hasOEmbed = metadata?.html?.oembed;
          const ogImages = metadata?.html?.ogImage;
          const isTwitterEmoji = (url: string) => {
            return url.includes('twimg.com/emoji') || url.includes('/svg/');
          };
          const hasRealImage = ogImages && Array.isArray(ogImages) && ogImages.some((img: any) => {
            if (!img.url) return false;
            if (img.type === 'svg') return false;
            if (isTwitterEmoji(img.url)) return false;
            return true;
          });
          const needsThumbnail = isXEmbed && hasOEmbed && !hasRealImage;
          
          // Only fetch if we don't have metadata and it's a link (not an image)
          // OR if it's Twitter/X with oEmbed but missing thumbnail
          // Also check if we've already fetched metadata for this URL
          if ((!hasMetadata || needsThumbnail) && !metadata?.image && !(metadata?.content_type && metadata.content_type.startsWith('image/'))) {
            // Check if we already have fetched metadata for this URL
            if (!fetchedUrlsRef.current.has(embed.url)) {
              urlsToFetch.push(embed.url);
              fetchedUrlsRef.current.add(embed.url);
            }
          }
        }
      });

      if (urlsToFetch.length === 0) {
        return;
      }

      // Fetch metadata for all URLs in parallel
      const metadataPromises = urlsToFetch.map(async (url) => {
        try {
          const apiUrl = `/api/metadata?url=${encodeURIComponent(url)}`;
          const response = await fetch(apiUrl);
          if (response.ok) {
            const data = await response.json();
            return { url, metadata: data };
          }
        } catch (error) {
          // Silently fail - metadata fetch is optional
        }
        return null;
      });

      const results = await Promise.all(metadataPromises);
      
      setEmbedMetadata((prevMetadata) => {
        const newMetadata = new Map(prevMetadata);
        
        results.forEach((result) => {
          if (result && result.metadata && !newMetadata.has(result.url)) {
            newMetadata.set(result.url, {
              title: result.metadata.title || null,
              description: result.metadata.description || null,
              image: result.metadata.image || null,
              author_name: result.metadata.author_name || null,
              author_url: result.metadata.author_url || null,
            });
          }
        });

        return newMetadata;
      });
    };

    fetchMetadataForEmbeds();
  }, [cast.embeds]);

  // Sync top replies and updated timestamp when cast prop changes
  useEffect(() => {
    if (cast._topReplies) {
      setTopReplies(cast._topReplies);
    }
    if (cast._repliesUpdatedAt) {
      setRepliesUpdatedAt(cast._repliesUpdatedAt);
    }
  }, [cast._topReplies, cast._repliesUpdatedAt]);

  // Check if cast is already curated on mount (check regardless of user login status)
  useEffect(() => {
    if (!cast.hash) {
      return;
    }

    const checkIfCurated = async () => {
      try {
        const response = await fetch(`/api/curate?castHash=${cast.hash}`);
        if (response.ok) {
          const data = await response.json();
          if (data.isCurated) {
            setIsCurated(true);
            // Use curators in chronological order (oldest first) from API
            setCurators(data.curatorInfo || []);
          } else {
            setIsCurated(false);
            setCurators([]);
          }
        }
      } catch (error) {
        // Silently fail - cast is not curated
        setIsCurated(false);
        setCurators([]);
      }
    };

    checkIfCurated();
  }, [cast.hash, user?.fid]);

  // Check if user is admin and fetch tags
  useEffect(() => {
    if (!user?.fid || !cast.hash) {
      return;
    }

    const checkAdminAndFetchTags = async () => {
      try {
        // Check admin status
        const adminResponse = await fetch(`/api/admin/check?fid=${user.fid}`);
        if (adminResponse.ok) {
          const adminData = await adminResponse.json();
          setIsAdmin(adminData.isAdmin || false);
        }

        // Fetch tags
        const tagsResponse = await fetch(`/api/tags?castHash=${cast.hash}`);
        if (tagsResponse.ok) {
          const tagsData = await tagsResponse.json();
          setTags(tagsData.tags?.map((t: any) => t.tag) || []);
        }
      } catch (error) {
        console.error("Failed to check admin status or fetch tags:", error);
      }
    };

    checkAdminAndFetchTags();
  }, [user?.fid, cast.hash]);

  // Prevent body scroll when confirmation modal is open
  useEffect(() => {
    if (showUncurateConfirm) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }

    return () => {
      document.body.style.overflow = "unset";
    };
  }, [showUncurateConfirm]);

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

  // Close share menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (shareMenuRef.current && !shareMenuRef.current.contains(event.target as Node)) {
        setShowShareMenu(false);
      }
    };

    if (showShareMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showShareMenu]);

  // Close tag menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tagMenuRef.current && !tagMenuRef.current.contains(event.target as Node)) {
        setShowTagMenu(false);
      }
    };

    if (showTagMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showTagMenu]);

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

  const handleOpenInFarcaster = () => {
    if (cast.hash) {
      window.open(`https://warpcast.com/~/conversations/${cast.hash}`, '_blank');
    }
    setShowShareMenu(false);
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(cast.text || '');
      setShowShareMenu(false);
      // Optionally show a toast notification
    } catch (error) {
      console.error('Failed to copy text:', error);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = cast.text || '';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setShowShareMenu(false);
    }
  };

  const handleUncurate = async () => {
    if (!user?.fid) {
      return;
    }

    setShowUncurateConfirm(false);

    try {
      setIsCurating(true);
      
      const response = await fetch(`/api/curate?castHash=${cast.hash}&curatorFid=${user.fid}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 403) {
          // Silently fail for non-curators
          return;
        } else {
          console.error("Uncurate error:", errorData.error || "Failed to uncurate cast");
        }
        return;
      }

            // Refresh curation status
            const checkResponse = await fetch(`/api/curate?castHash=${cast.hash}`);
            if (checkResponse.ok) {
              const data = await checkResponse.json();
              setIsCurated(data.isCurated);
              // Use curators in chronological order (oldest first) from API
              setCurators(data.curatorInfo || []);
            }

      if (onUpdate) {
        onUpdate();
      }
    } catch (error: any) {
      console.error("Uncurate error:", error);
    } finally {
      setIsCurating(false);
    }
  };

  const handleCurate = async () => {
    if (!user?.fid) {
      return;
    }

    // Check if current user has already curated this cast
    const isCuratedByCurrentUser = curators.some(c => c.fid === user.fid);

    // If already curated by current user, show confirmation to uncurate
    if (isCuratedByCurrentUser) {
      setShowUncurateConfirm(true);
      return;
    }

    // Curate the cast (either not curated, or curated by others)
    try {
      setIsCurating(true);
      
      const response = await fetch("/api/curate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          castHash: cast.hash,
          curatorFid: user.fid,
          castData: cast,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 403) {
          // Silently fail for non-curators
          return;
        } else if (response.status === 409) {
          // Already curated by this user, refresh status
          const checkResponse = await fetch(`/api/curate?castHash=${cast.hash}`);
          if (checkResponse.ok) {
            const data = await checkResponse.json();
            setIsCurated(data.isCurated);
            // Use curators in chronological order (oldest first) from API
            setCurators(data.curatorInfo || []);
          }
        } else {
          console.error("Curate error:", errorData.error || "Failed to curate cast");
        }
        return;
      }

      // Success - refresh curation status
      const checkResponse = await fetch(`/api/curate?castHash=${cast.hash}`);
      let updatedCurators: Array<{ fid: number; username?: string; display_name?: string; pfp_url?: string }> = [];
      if (checkResponse.ok) {
        const data = await checkResponse.json();
        setIsCurated(data.isCurated);
        // Use curators in chronological order (oldest first) from API
        updatedCurators = data.curatorInfo || [];
        setCurators(updatedCurators);
      }

      // Check if auto-like is enabled and handle auto-like
      if (user?.fid && user?.signer_uuid) {
        try {
          // Fetch user preferences
          const prefsResponse = await fetch(
            `/api/user/preferences?fid=${user.fid}&signerUuid=${user.signer_uuid}`
          );
          if (prefsResponse.ok) {
            const prefsData = await prefsResponse.json();
            const autoLikeEnabled = prefsData.autoLikeOnCurate !== undefined ? prefsData.autoLikeOnCurate : true;
            const hasSeenNotification = prefsData.hasSeenAutoLikeNotification || false;

            // Check if cast is curated by deepbot (use updated curators list)
            const isCuratedByDeepbot = updatedCurators.some(c => c.username?.toLowerCase() === "deepbot");

            // Auto-like if enabled and not curated by deepbot
            if (autoLikeEnabled && !isCuratedByDeepbot) {
              try {
                await fetch("/api/reaction", {
                  method: "POST",
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
              } catch (error) {
                console.error("Failed to auto-like cast:", error);
              }
            }

            // Show notification if first time
            if (!hasSeenNotification && autoLikeEnabled) {
              setShowAutoLikeNotification(true);
              // Update hasSeenAutoLikeNotification flag
              try {
                await fetch("/api/user/preferences", {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    fid: user.fid,
                    signerUuid: user.signer_uuid,
                    hasSeenAutoLikeNotification: true,
                  }),
                });
              } catch (error) {
                console.error("Failed to update notification flag:", error);
              }
            }
          }
        } catch (error) {
          console.error("Failed to fetch preferences for auto-like:", error);
        }
      }

      if (onUpdate) {
        onUpdate();
      }
    } catch (error: any) {
      console.error("Curate error:", error);
    } finally {
      setIsCurating(false);
    }
  };

  const handleTag = async (tag: string) => {
    if (!user?.fid || !cast.hash) {
      return;
    }

    const isTagged = tags.includes(tag);
    
    try {
      setIsTagging(true);
      setShowTagMenu(false);

      const url = isTagged 
        ? `/api/tags?castHash=${cast.hash}&tag=${encodeURIComponent(tag)}&adminFid=${user.fid}`
        : "/api/tags";
      
      const response = await fetch(url, {
        method: isTagged ? "DELETE" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: isTagged ? undefined : JSON.stringify({
          castHash: cast.hash,
          tag,
          adminFid: user.fid,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Tag error:", errorData.error || "Failed to toggle tag");
        return;
      }

      // Refresh tags
      const tagsResponse = await fetch(`/api/tags?castHash=${cast.hash}`);
      if (tagsResponse.ok) {
        const tagsData = await tagsResponse.json();
        setTags(tagsData.tags?.map((t: any) => t.tag) || []);
      }
    } catch (error: any) {
      console.error("Tag error:", error);
    } finally {
      setIsTagging(false);
    }
  };

  const author = cast.author;
  const timestamp = new Date(cast.timestamp);
  const timeAgo = formatDistanceToNow(timestamp, { addSuffix: true });

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking on interactive elements
    const target = e.target as HTMLElement;
    if (
      target.closest('a') ||
      target.closest('button') ||
      target.closest('[role="button"]') ||
      target.closest('.recast-menu') ||
      target.closest('.share-menu') ||
      target.closest('img[onClick]')
    ) {
      return;
    }
    
    if (cast.hash) {
      // Navigate to conversation view for curated casts, regular cast view otherwise
      const isCurated = feedType === "curated" || cast._curatorFid;
      router.push(isCurated ? `/conversation/${cast.hash}` : `/cast/${cast.hash}`);
    }
  };

  return (
    <>
      <div 
        className="border-b border-gray-200 dark:border-gray-800 py-4 sm:py-6 px-2 sm:px-4 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors relative cursor-pointer"
        onClick={handleCardClick}
      >
        {/* Share menu and Curator badge - top right corner */}
        <div className="absolute top-2 right-2 sm:top-4 sm:right-4 z-10 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {/* Share button */}
          <div className="relative share-menu" ref={shareMenuRef}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowShareMenu(!showShareMenu);
              }}
              className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
              title="Share"
            >
              <Share2 className="w-4 h-4" />
            </button>

            {/* Share dropdown menu */}
            {showShareMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 min-w-[180px]">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenInFarcaster();
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  Open in Farcaster
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopyText();
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border-t border-gray-200 dark:border-gray-700"
                >
                  Copy text
                </button>
              </div>
            )}
          </div>

          {/* Tags - show when cast has tags */}
          {tags.length > 0 && (
            <div className="flex items-center gap-1.5 px-2 sm:px-3 py-1 mb-2 flex-wrap">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full border border-blue-200 dark:border-blue-800"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Curated by pill - show when cast has curators */}
          {curators.length > 0 && (
            <div className="flex items-center gap-1.5 px-2 sm:px-3 py-1 bg-blue-50 dark:bg-blue-900/30 rounded-full border border-blue-200 dark:border-blue-800">
              {/* First curator name */}
              <span className="hidden sm:inline text-xs text-blue-700 dark:text-blue-300 font-medium">
                Curated by {curators[0]?.display_name || curators[0]?.username || `@user${curators[0]?.fid}`}
              </span>
              
              {/* First curator PFP - always show if available */}
              {curators[0]?.pfp_url && (
                <Link
                  href={`/profile/${curators[0].fid}`}
                  onClick={(e) => e.stopPropagation()}
                  className="relative"
                >
                  <img
                    src={curators[0].pfp_url}
                    alt={curators[0].username || "Curator"}
                    className="w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 border-white dark:border-gray-900"
                  />
                </Link>
              )}
              
              {/* Overlapping PFPs - show curators 2-5 (max 4 PFPs) */}
              {curators.length > 1 && (
                <div className="flex items-center -space-x-2">
                  {curators.slice(1, 5).map((curator) => (
                    <Link
                      key={curator.fid}
                      href={`/profile/${curator.fid}`}
                      onClick={(e) => e.stopPropagation()}
                      className="relative"
                    >
                      <img
                        src={curator.pfp_url || "/default-avatar.png"}
                        alt={curator.username || `Curator ${curator.fid}`}
                        className="w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 border-white dark:border-gray-900"
                      />
                    </Link>
                  ))}
                  {/* Show count if more than 5 curators total (1 name + 1 PFP + 4 PFPs) */}
                  {curators.length > 5 && (
                    <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 border-white dark:border-gray-900 bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        +{curators.length - 5}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className="flex gap-2 sm:gap-3">
          {/* Avatar */}
          <Link href={`/profile/${author.fid}`} onClick={(e) => e.stopPropagation()}>
            <img
              src={author.pfp_url || "/default-avatar.png"}
              alt={author.username}
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-full cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0"
            />
          </Link>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Author info */}
            <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2 flex-wrap">
              <Link href={`/profile/${author.fid}`} onClick={(e) => e.stopPropagation()}>
                <span className="font-semibold text-sm sm:text-base text-gray-900 dark:text-gray-100 hover:underline cursor-pointer">
                  {author.display_name || author.username}
                </span>
              </Link>
              <span className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm">
                @{author.username}
              </span>
              {author.power_badge && (
                <span className="text-blue-500 text-sm" title="Power Badge">
                  ⚡
                </span>
              )}
              <span className="text-gray-400 dark:text-gray-500 text-xs sm:text-sm">
                · {timeAgo}
              </span>
              {(cast as any)._isQuoteCast && (
                <span 
                  className="text-blue-500 dark:text-blue-400 text-xs sm:text-sm ml-0.5" 
                  title="Quote cast - This cast quotes the root cast of this conversation"
                  aria-label="Quote cast"
                >
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </span>
              )}
            </div>

            {/* Cast text */}
            <div className="text-gray-900 dark:text-gray-100 mb-2 sm:mb-3 whitespace-pre-wrap break-words text-sm sm:text-base leading-6 sm:leading-7">
              {renderTextWithLinks(cast.text, router)}
            </div>

            {/* Embeds */}
            {cast.embeds && cast.embeds.length > 0 && (() => {
              const hideImages = shouldHideImages();
              
              // First pass: group embeds by type
              const embedGroups: Array<{ type: 'images' | 'other', embeds: any[], indices: number[] }> = [];
              let currentImageGroup: { embeds: any[], indices: number[] } | null = null;
              
              cast.embeds.forEach((embed: any, index: number) => {
                // Check if this is a direct image embed
                const isDirectImage = embed.url && (
                  embed.metadata?.image || 
                  (embed.metadata?.content_type && embed.metadata.content_type.startsWith('image/'))
                );
                
                // Check if this is an image-only link embed (no title/description, just image)
                let isImageOnlyLink = false;
                if (embed.url && !isDirectImage) {
                  const metadata = embed.metadata;
                  let imageUrl: string | null = null;
                  let title: string | null = null;
                  let description: string | null = null;
                  
                  // Extract image URL
                  if (metadata?.html?.ogImage) {
                    const ogImages = Array.isArray(metadata.html.ogImage) ? metadata.html.ogImage : [metadata.html.ogImage];
                    const nonEmojiImage = ogImages.find((img: any) => {
                      if (!img.url) return false;
                      if (img.type === 'svg') return false;
                      if (img.url.includes('twimg.com/emoji') || img.url.includes('/svg/')) return false;
                      return true;
                    });
                    if (nonEmojiImage) imageUrl = nonEmojiImage.url;
                  }
                  
                  // Extract title/description
                  if (metadata?.html?.oembed) {
                    title = metadata.html.oembed.title || null;
                  }
                  if (metadata?.html && !metadata.html.oembed) {
                    title = metadata.html.ogTitle || metadata.html.title || null;
                    description = metadata.html.ogDescription || metadata.html.description || null;
                  }
                  if (!title && metadata?.title) title = metadata.title;
                  if (!description && metadata?.description) description = metadata.description;
                  
                  // Check fetched metadata if available
                  const fetchedMeta = embedMetadata.get(embed.url);
                  if (fetchedMeta) {
                    if (!title && fetchedMeta.title) title = fetchedMeta.title;
                    if (!description && fetchedMeta.description) description = fetchedMeta.description;
                    if (!imageUrl && fetchedMeta.image) imageUrl = fetchedMeta.image;
                  }
                  
                  // Consider it image-only if it has an image but no meaningful title/description
                  isImageOnlyLink = !!imageUrl && !title && !description;
                }
                
                if ((isDirectImage || isImageOnlyLink) && !hideImages) {
                  // Add to current image group or start new one
                  if (!currentImageGroup) {
                    currentImageGroup = { embeds: [], indices: [] };
                  }
                  currentImageGroup.embeds.push(embed);
                  currentImageGroup.indices.push(index);
                } else {
                  // Close current image group if exists
                  if (currentImageGroup) {
                    embedGroups.push({ type: 'images', embeds: currentImageGroup.embeds, indices: currentImageGroup.indices });
                    currentImageGroup = null;
                  }
                  // Add as other embed
                  embedGroups.push({ type: 'other', embeds: [embed], indices: [index] });
                }
              });
              
              // Close any remaining image group
              if (currentImageGroup) {
                const imageGroup: { embeds: any[], indices: number[] } = currentImageGroup;
                embedGroups.push({ 
                  type: 'images' as const, 
                  embeds: imageGroup.embeds, 
                  indices: imageGroup.indices 
                });
              }
              
              return (
                <div className="mb-3 space-y-2">
                  {embedGroups.map((group, groupIndex) => {
                    if (group.type === 'images') {
                      // Render image group with dynamic layout based on actual image dimensions
                      return (
                        <DynamicImageGrid
                          key={`image-group-${groupIndex}`}
                          embeds={group.embeds}
                          indices={group.indices}
                          embedMetadata={embedMetadata}
                          onImageClick={setSelectedImage}
                        />
                      );
                    } else {
                      // Render other embeds normally
                      return (
                        <div key={`embed-group-${groupIndex}`}>
                          {group.embeds.map((embed: any, embedIndex: number) => {
                        const index = group.indices[embedIndex];
                        
                        // URL embed (images, videos, links)
                        if (embed.url) {
                          const metadata = embed.metadata;
                          const urlObj = new URL(embed.url);
                          const isXEmbed = urlObj.hostname === 'x.com' || urlObj.hostname === 'twitter.com';
                          const isYouTube = urlObj.hostname === 'youtube.com' || urlObj.hostname === 'www.youtube.com' || urlObj.hostname === 'youtu.be' || urlObj.hostname === 'www.youtu.be';
                          
                          // Extract metadata from various possible structures
                          let imageUrl: string | null = null;
                          let title: string | null = null;
                          let description: string | null = null;
                          let authorName: string | null = null;
                    
                    // Check for Neynar's HTML metadata structure with oEmbed
                    if (metadata?.html?.oembed) {
                      const oembed = metadata.html.oembed;
                      authorName = oembed.author_name || null;
                      title = oembed.title || (authorName ? `Tweet by ${authorName}` : 'Tweet') || null;
                      
                      // Extract description from oEmbed HTML
                      if (oembed.html && !description) {
                        try {
                          // Parse the HTML to extract text content from the <p> tag
                          const htmlContent = oembed.html;
                          // Extract content from <p> tag inside blockquote
                          const pMatch = htmlContent.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
                          if (pMatch) {
                            let text = pMatch[1];
                            // Remove HTML tags
                            text = text.replace(/<[^>]+>/g, ' ');
                            // Decode HTML entities
                            text = text.replace(/&nbsp;/g, ' ')
                                      .replace(/&amp;/g, '&')
                                      .replace(/&lt;/g, '<')
                                      .replace(/&gt;/g, '>')
                                      .replace(/&quot;/g, '"')
                                      .replace(/&#39;/g, "'")
                                      .replace(/<br\s*\/?>/gi, '\n');
                            // Decode numeric entities
                            text = text.replace(/&#(\d+);/g, (_: string, dec: string) => String.fromCharCode(parseInt(dec, 10)));
                            // Clean up whitespace
                            text = text.replace(/\s+/g, ' ').trim();
                            if (text) {
                              description = text;
                            }
                          }
                        } catch (error) {
                        }
                      }
                    }
                    
                    // Check for HTML metadata structure (standard Open Graph)
                    if (metadata?.html && !metadata.html.oembed) {
                      const htmlMeta = metadata.html;
                      const ogImage = htmlMeta.ogImage && htmlMeta.ogImage.length > 0 ? htmlMeta.ogImage[0] : null;
                      imageUrl = ogImage?.url || null;
                      if (!title) {
                        title = htmlMeta.ogTitle || htmlMeta.title || null;
                      }
                      if (!description) {
                        description = htmlMeta.ogDescription || htmlMeta.description || null;
                      }
                    }
                    
                    // Extract image from Neynar's ogImage structure
                    if (!imageUrl && metadata?.html?.ogImage) {
                      const ogImages = Array.isArray(metadata.html.ogImage) ? metadata.html.ogImage : [metadata.html.ogImage];
                      // Filter out Twitter emoji SVGs (warning triangle, etc.)
                      const isTwitterEmoji = (url: string) => {
                        return url.includes('twimg.com/emoji') || url.includes('/svg/');
                      };
                      // Prefer non-emoji images (SVG emojis are usually small icons or placeholders)
                      const nonEmojiImage = ogImages.find((img: any) => {
                        if (!img.url) return false;
                        if (img.type === 'svg') return false;
                        if (isTwitterEmoji(img.url)) return false;
                        return true;
                      });
                      if (nonEmojiImage) {
                        imageUrl = nonEmojiImage.url;
                      } else {
                        // Fallback: use first non-emoji URL if available
                        const fallbackImage = ogImages.find((img: any) => img.url && !isTwitterEmoji(img.url));
                        if (fallbackImage) {
                          imageUrl = fallbackImage.url;
                        }
                      }
                    }
                    
                    // Fallback: check direct metadata properties
                    if (!title && metadata?.title) {
                      title = metadata.title;
                    }
                    if (!description && metadata?.description) {
                      description = metadata.description;
                    }
                    if (!imageUrl && metadata?.image) {
                      imageUrl = typeof metadata.image === 'string' ? metadata.image : metadata.image?.url || null;
                    }
                    
                    // Fallback: check for ogImage directly
                    if (!imageUrl && metadata?.ogImage) {
                      const ogImg = Array.isArray(metadata.ogImage) ? metadata.ogImage[0] : metadata.ogImage;
                      imageUrl = typeof ogImg === 'string' ? ogImg : ogImg?.url || null;
                    }
                    
                    // Use fetched metadata if available and we don't have it from Neynar
                    const fetchedMeta = embedMetadata.get(embed.url);
                    if (fetchedMeta) {
                      if (!title && fetchedMeta.title) title = fetchedMeta.title;
                      if (!description && fetchedMeta.description) description = fetchedMeta.description;
                      if (!imageUrl && fetchedMeta.image) imageUrl = fetchedMeta.image;
                      if (!authorName && fetchedMeta.author_name) authorName = fetchedMeta.author_name;
                    }
                    
                    // Show card layout if we have any metadata OR if it's a YouTube/X link (even without metadata)
                    if (metadata?.html || title || description || imageUrl || isXEmbed || isYouTube) {
                      
                      // Unified card layout for all link embeds with metadata
                      return (
                        <div 
                          key={index} 
                          className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-700 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <a
                            href={embed.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block"
                          >
                            <div className="flex">
                              {/* Image on the left - small, full height */}
                              {imageUrl && !hideImages && (
                                <div className="flex-shrink-0 w-32 sm:w-40 h-32 sm:h-40">
                                  <img
                                    src={imageUrl}
                                    alt={title || "Link preview"}
                                    className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setSelectedImage(imageUrl);
                                    }}
                                    onError={(e) => {
                                      // Hide image if it fails to load
                                      (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                  />
                                </div>
                              )}
                              
                              {/* Content on the right */}
                              <div className={`flex-1 min-w-0 p-3 sm:p-4 ${imageUrl ? '' : 'flex flex-col justify-between'}`}>
                                <div>
                                  {/* Domain/Platform indicator */}
                                  <div className="flex items-center gap-2 mb-2">
                                    {isXEmbed && (
                                      <svg className="w-4 h-4 text-gray-900 dark:text-gray-100 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                                      </svg>
                                    )}
                                    {isYouTube && (
                                      <svg className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                                      </svg>
                                    )}
                                    <span className="text-xs text-gray-500 dark:text-gray-400 font-medium truncate">
                                      {isXEmbed && authorName ? `@${authorName}` : isXEmbed ? 'x.com' : isYouTube ? 'youtube.com' : urlObj.hostname.replace('www.', '')}
                                    </span>
                                  </div>
                                  
                                  {/* Title */}
                                  {title && (
                                    <div className="font-semibold text-sm sm:text-base text-gray-900 dark:text-gray-100 mb-1.5 line-clamp-2">
                                      {title}
                                    </div>
                                  )}
                                  
                                  {/* Description */}
                                  {description && (
                                    <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                                      {description}
                                    </div>
                                  )}
                                  
                                  {/* Fallback: show URL if no title/description */}
                                  {!title && !description && (
                                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-1">
                                      {embed.url}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </a>
                        </div>
                      );
                    }
                    
                    // Image embed (direct image URL) - skip, already handled in grouping
                    if (metadata?.image || (metadata?.content_type && metadata.content_type.startsWith('image/'))) {
                      if (hideImages) {
                        // Show placeholder or link instead
                        return (
                          <div key={index} className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 bg-gray-50 dark:bg-gray-900">
                            <a
                              href={embed.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 dark:text-blue-400 hover:underline text-sm break-all"
                              onClick={(e) => e.stopPropagation()}
                            >
                              [Image hidden] {embed.url}
                            </a>
                          </div>
                        );
                      }
                      // This should not happen as direct images are grouped, but handle as fallback
                      return null;
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
                    
                    // Generic URL embed (fallback) - no metadata
                    const isYouTubeFallback = urlObj.hostname === 'youtube.com' || urlObj.hostname === 'www.youtube.com' || urlObj.hostname === 'youtu.be' || urlObj.hostname === 'www.youtu.be';
                    
                    if (isXEmbed || isYouTubeFallback) {
                      return (
                        <div 
                          key={index} 
                          className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-700 transition-colors p-4"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <a
                            href={embed.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block"
                          >
                            <div className="flex items-center gap-2 mb-2">
                              {isXEmbed && (
                                <svg className="w-5 h-5 text-gray-900 dark:text-gray-100" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                                </svg>
                              )}
                              {isYouTubeFallback && (
                                <svg className="w-5 h-5 text-red-600 dark:text-red-400" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                                </svg>
                              )}
                              <span className="font-semibold text-gray-900 dark:text-gray-100">
                                {isXEmbed ? 'View on X' : isYouTubeFallback ? 'View on YouTube' : 'View Link'}
                              </span>
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400 break-all">
                              {embed.url}
                            </div>
                          </a>
                        </div>
                      );
                    }
                    
                    return (
                      <div 
                        key={index} 
                        className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 bg-gray-50 dark:bg-gray-900"
                        onClick={(e) => e.stopPropagation()}
                      >
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
                      <div 
                        key={index} 
                        className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (quotedCastHash) {
                            router.push(`/cast/${quotedCastHash}`);
                          }
                        }}
                      >
                        <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                          Quoted cast
                        </div>
                        {embed.cast && (
                          <div className="pl-3 border-l-2 border-gray-300 dark:border-gray-700">
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
                                  const hideImages = shouldHideImages();
                                  const imageEmbeds: any[] = [];
                                  const imageIndices: number[] = [];
                                  
                                  embed.cast.embeds.forEach((quotedEmbed: any, idx: number) => {
                                    if (quotedEmbed.url) {
                                      const quotedMetadata = quotedEmbed.metadata;
                                      
                                      // Check if it's a direct image embed
                                      const isDirectImage = quotedMetadata?.image || 
                                        (quotedMetadata?.content_type && quotedMetadata.content_type.startsWith('image/'));
                                      
                                      // Check if it's an image-only link embed
                                      let isImageOnlyLink = false;
                                      if (!isDirectImage && quotedMetadata?.html?.ogImage) {
                                        const ogImages = Array.isArray(quotedMetadata.html.ogImage) ? quotedMetadata.html.ogImage : [quotedMetadata.html.ogImage];
                                        const hasImage = ogImages.some((img: any) => {
                                          if (!img.url) return false;
                                          if (img.type === 'svg') return false;
                                          if (img.url.includes('twimg.com/emoji') || img.url.includes('/svg/')) return false;
                                          return true;
                                        });
                                        
                                        // Check if it has title/description
                                        let hasTitle = false;
                                        let hasDescription = false;
                                        if (quotedMetadata.html?.oembed) {
                                          hasTitle = !!quotedMetadata.html.oembed.title;
                                        }
                                        if (quotedMetadata.html && !quotedMetadata.html.oembed) {
                                          hasTitle = !!(quotedMetadata.html.ogTitle || quotedMetadata.html.title);
                                          hasDescription = !!(quotedMetadata.html.ogDescription || quotedMetadata.html.description);
                                        }
                                        
                                        isImageOnlyLink = hasImage && !hasTitle && !hasDescription;
                                      }
                                      
                                      if (isDirectImage || isImageOnlyLink) {
                                        imageEmbeds.push(quotedEmbed);
                                        imageIndices.push(idx);
                                      }
                                    }
                                  });
                                  
                                  if (imageEmbeds.length > 0 && !hideImages) {
                                    return (
                                      <DynamicImageGrid
                                        embeds={imageEmbeds}
                                        indices={imageIndices}
                                        embedMetadata={embedMetadata}
                                        onImageClick={setSelectedImage}
                                      />
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
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                          })}
                        </div>
                      );
                    }
                  })}
                </div>
              );
            })()}

            {/* Channel */}
            {cast.channel && (
              <div className="mb-3" onClick={(e) => e.stopPropagation()}>
                <Link
                  href={`/channel/${cast.channel.id}`}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  <span>#{cast.channel.name}</span>
                </Link>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-3 sm:gap-6 mt-3 sm:mt-4 flex-wrap" onClick={(e) => e.stopPropagation()}>
              {/* Reply */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!user) {
                      alert("Please sign in to reply");
                      return;
                    }
                    setShowReplyBox(!showReplyBox);
                  }}
                  className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors py-1 px-1 sm:px-0"
                >
                  <MessageCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span>{cast.replies?.count || 0}</span>
                </button>
              </div>

              {/* Like */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleLike();
                }}
                disabled={isReacting || !user}
                className={`flex items-center gap-1 sm:gap-2 text-xs sm:text-sm transition-colors py-1 px-1 sm:px-0 ${
                  isLiked
                    ? "text-red-600 dark:text-red-400"
                    : "text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <Heart className={`w-4 h-4 sm:w-5 sm:h-5 ${isLiked ? "fill-current" : ""}`} />
                <span>{likesCount}</span>
              </button>

              {/* Recast menu */}
              <div className="relative recast-menu" ref={recastMenuRef}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowRecastMenu(!showRecastMenu);
                  }}
                  disabled={isReacting || !user}
                  className={`flex items-center gap-1 sm:gap-2 text-xs sm:text-sm transition-colors py-1 px-1 sm:px-0 ${
                    isRecasted
                      ? "text-green-600 dark:text-green-400"
                      : "text-gray-500 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-400"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <Repeat2 className={`w-4 h-4 sm:w-5 sm:h-5 ${isRecasted ? "stroke-[3]" : "stroke-[2]"}`} />
                  <span>{recastsCount}</span>
                </button>

                {/* Dropdown menu */}
                {showRecastMenu && user && (
                  <div className="absolute left-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 min-w-[160px]">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRecast();
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      {isRecasted ? "Undo Recast" : "Recast"}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleQuote();
                      }}
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
                  className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 hover:underline hidden sm:inline"
                >
                  View thread →
                </Link>
              )}

              {/* Curate and Tag buttons - positioned on the right */}
              <div className="flex items-center gap-2 ml-auto">
                {user && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCurate();
                    }}
                    onTouchEnd={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      handleCurate();
                    }}
                    disabled={isCurating}
                    className={`flex items-center gap-1 sm:gap-2 text-xs sm:text-sm transition-colors py-1 px-1 sm:px-0 ${
                      isCurated && curators.some(c => c.fid === user.fid)
                        ? "text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300"
                        : "text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                    title={
                      isCurated && curators.some(c => c.fid === user.fid)
                        ? "Remove from curated feed"
                        : isCurated
                        ? "Add your curation"
                        : "Add to curated feed"
                    }
                  >
                    <span className={isCurated && curators.some(c => c.fid === user.fid) ? "text-purple-600 dark:text-purple-400" : "text-gray-400 dark:text-gray-500"}>
                      {isCurated ? "Curated" : "Curate"}
                    </span>
                    <Star className={`w-4 h-4 sm:w-5 sm:h-5 ${isCurated && curators.some(c => c.fid === user.fid) ? "fill-current" : ""}`} />
                  </button>
                )}
                
                {/* Tag button - only visible to admins */}
                {user && isAdmin && (
                  <div className="relative tag-menu" ref={tagMenuRef}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowTagMenu(!showTagMenu);
                      }}
                      disabled={isTagging}
                      className={`flex items-center gap-1 sm:gap-2 text-xs sm:text-sm transition-colors py-1 px-1 sm:px-0 ${
                        tags.length > 0
                          ? "text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                          : "text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                      title="Tag cast"
                    >
                      <Tag className={`w-4 h-4 sm:w-5 sm:h-5 ${tags.length > 0 ? "fill-current" : ""}`} />
                      {tags.length > 0 && (
                        <span className="text-xs">{tags.length}</span>
                      )}
                    </button>

                    {/* Tag dropdown menu */}
                    {showTagMenu && (
                      <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 min-w-[180px]">
                        <div className="p-2">
                          <div className="text-xs text-gray-500 dark:text-gray-400 mb-2 px-2">Tags</div>
                          {tags.length > 0 && (
                            <div className="mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                              {tags.map((tag) => (
                                <button
                                  key={tag}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleTag(tag);
                                  }}
                                  className="w-full text-left px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors flex items-center justify-between"
                                >
                                  <span>{tag}</span>
                                  <span className="text-xs text-gray-500">Remove</span>
                                </button>
                              ))}
                            </div>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTag("build-idea");
                            }}
                            className={`w-full text-left px-3 py-1.5 text-sm rounded transition-colors ${
                              tags.includes("build-idea")
                                ? "text-gray-500 dark:text-gray-400 cursor-not-allowed"
                                : "text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700"
                            }`}
                            disabled={tags.includes("build-idea")}
                          >
                            {tags.includes("build-idea") ? "✓ build-idea" : "+ build-idea"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Top Replies Section */}
        {showTopReplies && (feedType === "curated" || cast._curatorFid) && (
          <div className="mt-3 border-t border-gray-200 dark:border-gray-800 pt-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2 px-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-400">Top replies</span>
                {repliesUpdatedAt && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    Updated {formatDistanceToNow(new Date(repliesUpdatedAt), { addSuffix: true })}
                  </span>
                )}
                {!repliesUpdatedAt && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    Not loaded yet
                  </span>
                )}
              </div>
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  if (!cast.hash || isRefreshingReplies) return;
                  
                  setIsRefreshingReplies(true);
                  try {
                    const response = await fetch("/api/curate/refresh-replies", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ castHash: cast.hash }),
                    });
                    
                    if (response.ok) {
                      const data = await response.json();
                      setTopReplies(data.replies || []);
                      setRepliesUpdatedAt(data.updatedAt || new Date());
                      
                      // Update cast data with refreshed values (likes, replies count, etc.)
                      if (data.cast) {
                        // Update reaction counts
                        if (data.cast.reactions) {
                          setLikesCount(data.cast.reactions.likes_count || 0);
                          setRecastsCount(data.cast.reactions.recasts_count || 0);
                        }
                        // Update replies count
                        if (data.cast.replies) {
                          // The replies count is in the cast object
                        }
                        // Update viewer context (liked/recasted status)
                        if (data.cast.viewer_context) {
                          setIsLiked(data.cast.viewer_context.liked || false);
                          setIsRecasted(data.cast.viewer_context.recasted || false);
                        }
                      }
                      
                      if (onUpdate) {
                        onUpdate();
                      }
                    }
                  } catch (error) {
                    console.error("Error refreshing replies:", error);
                  } finally {
                    setIsRefreshingReplies(false);
                  }
                }}
                disabled={isRefreshingReplies}
                className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors disabled:opacity-50"
                title="Refresh replies"
              >
                <RefreshCw className={`w-3 h-3 ${isRefreshingReplies ? "animate-spin" : ""}`} />
              </button>
            </div>
            {topReplies && topReplies.length > 0 ? (
              <>
                {(() => {
                  // Build threaded tree structure from replies
                  interface ThreadedReply {
                    hash: string;
                    parent_hash?: string;
                    [key: string]: any;
                    children?: ThreadedReply[];
                  }

                  function buildThreadTree(replies: ThreadedReply[], rootHash: string): ThreadedReply[] {
                    const replyMap = new Map<string, ThreadedReply>();
                    replies.forEach(reply => {
                      replyMap.set(reply.hash, { ...reply, children: [] });
                    });

                    const rootReplies: ThreadedReply[] = [];
                    replies.forEach(reply => {
                      const threadedReply = replyMap.get(reply.hash)!;
                      const parentHash = reply.parent_hash;

                      if (!parentHash || parentHash === rootHash) {
                        rootReplies.push(threadedReply);
                      } else {
                        const parent = replyMap.get(parentHash);
                        if (parent) {
                          if (!parent.children) {
                            parent.children = [];
                          }
                          parent.children.push(threadedReply);
                        } else {
                          rootReplies.push(threadedReply);
                        }
                      }
                    });

                    // Sort by timestamp
                    rootReplies.sort((a, b) => {
                      const aTime = new Date(a.timestamp || a.created_at || 0).getTime();
                      const bTime = new Date(b.timestamp || b.created_at || 0).getTime();
                      return aTime - bTime;
                    });

                    function sortChildren(reply: ThreadedReply) {
                      if (reply.children && reply.children.length > 0) {
                        reply.children.sort((a, b) => {
                          const aTime = new Date(a.timestamp || a.created_at || 0).getTime();
                          const bTime = new Date(b.timestamp || b.created_at || 0).getTime();
                          return aTime - bTime;
                        });
                        reply.children.forEach(sortChildren);
                      }
                    }
                    rootReplies.forEach(sortChildren);

                    return rootReplies;
                  }

                  function renderThreadedReply(reply: ThreadedReply, depth: number = 1, isLastChild: boolean = false, parentHasMore: boolean = false, hasChildren: boolean = false) {
                    const indentPx = depth > 1 ? 48 : 0;
                    const showVerticalLine = !isLastChild || hasChildren || parentHasMore;

                    return (
                      <div key={reply.hash} className="relative">
                        <div className="flex relative">
                          {/* Thread line area */}
                          <div className="flex-shrink-0 relative" style={{ width: depth > 1 ? '24px' : '8px' }}>
                            {depth > 1 && showVerticalLine && (
                              <div className="absolute top-0 left-0 bottom-0 w-px bg-gray-300 dark:bg-gray-600" />
                            )}
                            {depth === 1 && showVerticalLine && (
                              <div className="absolute top-0 left-0 bottom-0 w-px bg-gray-300 dark:bg-gray-600" />
                            )}
                          </div>
                          
                          {/* Reply content */}
                          <div className="flex-1 min-w-0" style={{ marginLeft: `${indentPx}px` }}>
                            <MinimalReplyCard
                              reply={reply}
                              onUpdate={onUpdate}
                              parentCastHash={cast.hash}
                            />
                          </div>
                        </div>
                        
                        {/* Render children */}
                        {reply.children && reply.children.length > 0 && (
                          <div className="relative" style={{ marginLeft: depth > 1 ? '24px' : '8px' }}>
                            {reply.children.length > 0 && (
                              <div className="absolute left-0 top-0 bottom-0 w-px bg-gray-300 dark:bg-gray-600" />
                            )}
                            <div style={{ marginLeft: '24px' }}>
                              {reply.children.map((child, index) => 
                                renderThreadedReply(
                                  child,
                                  depth + 1,
                                  index === reply.children!.length - 1,
                                  index < reply.children!.length - 1,
                                  (child.children && child.children.length > 0) || false
                                )
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }

                  const threadedReplies = buildThreadTree(topReplies as ThreadedReply[], cast.hash || '');

                  return (
                    <div className="space-y-0">
                      {threadedReplies.map((reply, index) => 
                        renderThreadedReply(
                          reply,
                          1,
                          index === threadedReplies.length - 1,
                          index < threadedReplies.length - 1,
                          (reply.children && reply.children.length > 0) || false
                        )
                      )}
                    </div>
                  );
                })()}
                {cast.hash && (
                  <Link
                    href={feedType === "curated" || cast._curatorFid ? `/conversation/${cast.hash}` : `/cast/${cast.hash}`}
                    className="block mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline text-center"
                  >
                    View all replies →
                  </Link>
                )}
              </>
            ) : (
              <div className="py-2 text-center">
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
                  {repliesUpdatedAt ? "No replies yet" : "Click refresh to load replies"}
                </p>
                {cast.hash && (
                  <Link
                    href={feedType === "curated" || cast._curatorFid ? `/conversation/${cast.hash}` : `/cast/${cast.hash}`}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    View thread →
                  </Link>
                )}
              </div>
            )}
          </div>
        )}

        {/* Reply box */}
        {showReplyBox && (
          <div className="mt-2 pl-0 sm:pl-14 border-t border-gray-200 dark:border-gray-800 pt-3 sm:pt-4" onClick={(e) => e.stopPropagation()}>
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

      {/* Uncurate Confirmation Modal */}
      {showUncurateConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setShowUncurateConfirm(false)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-sm w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Remove from curated feed?
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Are you sure you want to remove this cast from the curated feed?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowUncurateConfirm(false)}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUncurate}
                disabled={isCurating}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCurating ? "Removing..." : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}

      <AutoLikeNotification
        isOpen={showAutoLikeNotification}
        onClose={() => setShowAutoLikeNotification(false)}
        onDisable={async () => {
          if (!user?.fid || !user?.signer_uuid) return;
          try {
            await fetch("/api/user/preferences", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                fid: user.fid,
                signerUuid: user.signer_uuid,
                autoLikeOnCurate: false,
              }),
            });
          } catch (error) {
            console.error("Failed to disable auto-like:", error);
          }
        }}
      />
    </>
  );
}
