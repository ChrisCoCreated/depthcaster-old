"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { AvatarImage } from "./AvatarImage";
import { Cast } from "@neynar/nodejs-sdk/build/api";

interface MiniCastCardProps {
  cast: Cast;
  onClick?: () => void;
}

// Extract first image from embeds - matches CastCard logic
function getFirstImageUrl(cast: Cast): string | null {
  if (!cast.embeds || cast.embeds.length === 0) return null;

  for (const embed of cast.embeds) {
    const embedAny = embed as any;
    const embedUrl = embedAny.url;
    
    if (!embedUrl) continue;
    
    const metadata = embedAny.metadata;
    
    // Check if it's a direct image URL (file extension)
    if (embedUrl.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i)) {
      return embedUrl;
    }
    
    // Check metadata for image content type or image property
    if (metadata) {
      // If metadata has image property or content_type is image, use the embed URL
      if (metadata.image || (metadata.content_type && metadata.content_type.startsWith('image/'))) {
        // Filter out Twitter emoji SVGs
        if (embedUrl.includes('twimg.com/emoji') || embedUrl.includes('/svg/')) {
          continue;
        }
        return embedUrl;
      }
      
      // Check for og:image in html metadata
      if (metadata.html?.ogImage) {
        const ogImages = Array.isArray(metadata.html.ogImage) ? metadata.html.ogImage : [metadata.html.ogImage];
        const nonEmojiImage = ogImages.find((img: any) => {
          if (!img.url) return false;
          if (img.type === 'svg') return false;
          if (img.url.includes('twimg.com/emoji') || img.url.includes('/svg/')) return false;
          return true;
        });
        if (nonEmojiImage) return nonEmojiImage.url;
      }
      
      // Check for image property in metadata
      if (metadata.image) {
        const imgUrl = typeof metadata.image === 'string' ? metadata.image : metadata.image?.url || null;
        if (imgUrl && !imgUrl.includes('twimg.com/emoji') && !imgUrl.includes('/svg/')) {
          return imgUrl;
        }
      }
      
      // Check for ogImage property
      if (metadata.ogImage) {
        const ogImg = Array.isArray(metadata.ogImage) ? metadata.ogImage[0] : metadata.ogImage;
        const imgUrl = typeof ogImg === 'string' ? ogImg : ogImg?.url || null;
        if (imgUrl && !imgUrl.includes('twimg.com/emoji') && !imgUrl.includes('/svg/')) {
          return imgUrl;
        }
      }
    }
  }
  
  return null;
}

export function MiniCastCard({ cast, onClick }: MiniCastCardProps) {
  const author = cast.author;
  const imageUrl = getFirstImageUrl(cast);
  const castText = cast.text || "";
  const previewText = castText.length > 150 ? `${castText.slice(0, 150)}...` : castText;
  const timestamp = cast.timestamp ? new Date(cast.timestamp) : null;
  
  // Debug: log image extraction
  if (process.env.NODE_ENV === 'development' && cast.embeds && cast.embeds.length > 0) {
    console.log('MiniCastCard embeds:', cast.embeds);
    console.log('Extracted imageUrl:', imageUrl);
  }

  const handleClick = () => {
    if (onClick) {
      onClick();
    }
  };

  return (
    <div
      className="flex gap-3 p-3 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors cursor-pointer"
      onClick={handleClick}
    >
      {/* Image on left (if exists) */}
      {imageUrl && (
        <div className="shrink-0 w-20 self-stretch">
          <img
            src={imageUrl}
            alt=""
            className="w-full h-full object-cover rounded min-h-[80px]"
            onError={(e) => {
              // Hide image if it fails to load
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}
      
      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* User details */}
        <div className="flex items-center gap-2 mb-2">
          <AvatarImage
            src={author?.pfp_url}
            alt={author?.display_name || author?.username || ""}
            size={24}
          />
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
              {author?.display_name || author?.username || `fid:${author?.fid}`}
            </span>
            {author?.username && (
              <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                @{author.username}
              </span>
            )}
          </div>
            {timestamp && (
            <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto shrink-0">
              {formatDistanceToNow(timestamp, { addSuffix: true })}
            </span>
          )}
        </div>
        
        {/* Text preview */}
        {previewText && (
          <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3">
            {previewText}
          </p>
        )}
      </div>
    </div>
  );
}
