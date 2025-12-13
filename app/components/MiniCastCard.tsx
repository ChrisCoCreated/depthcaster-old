"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { AvatarImage } from "./AvatarImage";
import { Cast } from "@neynar/nodejs-sdk/build/api";

interface MiniCastCardProps {
  cast: Cast;
  onClick?: () => void;
}

// Extract first image from embeds
function getFirstImageUrl(cast: Cast): string | null {
  if (!cast.embeds || cast.embeds.length === 0) return null;

  for (const embed of cast.embeds) {
    if (embed.url) {
      // Check if it's a direct image URL
      if (embed.url.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i)) {
        return embed.url;
      }
      
      // Check metadata for images
      const metadata = (embed as any).metadata;
      if (metadata) {
        // Check for og:image
        const ogImage = metadata.ogImage;
        if (ogImage) {
          const imgUrl = typeof ogImage === 'string' ? ogImage : ogImage.url;
          if (imgUrl && !imgUrl.includes('twimg.com/emoji') && !imgUrl.includes('/svg/')) {
            return imgUrl;
          }
        }
        
        // Check for image property
        const image = metadata.image;
        if (image) {
          const imgUrl = typeof image === 'string' ? image : image.url;
          if (imgUrl) return imgUrl;
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
