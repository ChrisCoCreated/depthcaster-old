"use client";

import Link from "next/link";
import { AvatarImage } from "./AvatarImage";

interface MentionedProfileCardProps {
  profile: {
    fid: number;
    username?: string;
    display_name?: string;
    pfp_url?: string;
    profile?: {
      bio?: {
        text?: string;
      };
      banner?: {
        url?: string;
      };
    };
    score?: number;
    follower_count?: number;
    following_count?: number;
    url?: string;
  };
}

export function MentionedProfileCard({ profile }: MentionedProfileCardProps) {
  const bannerUrl = profile.profile?.banner?.url;
  const bio = profile.profile?.bio?.text;
  const displayName = profile.display_name || profile.username || `User ${profile.fid}`;
  const username = profile.username || `fid${profile.fid}`;
  const score = profile.score;
  const followerCount = profile.follower_count ?? 0;
  const followingCount = profile.following_count ?? 0;
  const url = profile.url;

  return (
    <Link
      href={`/profile/${profile.fid}`}
      onClick={(e) => e.stopPropagation()}
      className="block w-full mb-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden hover:shadow-md transition-shadow"
    >
      {/* Banner */}
      {bannerUrl && (
        <div className="w-full bg-gray-200 dark:bg-gray-700 relative" style={{ aspectRatio: '3 / 1' }}>
          <img
            src={bannerUrl}
            alt={`${displayName} banner`}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* PFP */}
          <div className="flex-shrink-0 -mt-2">
            <AvatarImage
              src={profile.pfp_url}
              alt={displayName}
              size={64}
              className="w-16 h-16 rounded-full border-2 border-white dark:border-gray-800 object-cover"
            />
          </div>
          
          {/* Profile Info */}
          <div className="flex-1 min-w-0">
            {/* Display Name and Username */}
            <div className="mb-2">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
                {displayName}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                @{username}
              </p>
            </div>
            
            {/* Bio */}
            {bio && (
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-3 line-clamp-2">
                {bio}
              </p>
            )}
            
            {/* Stats and URL */}
            <div className="flex flex-wrap items-center gap-4 text-sm">
              {/* Score */}
              {score !== undefined && (
                <div className="flex items-center gap-1">
                  <span className="text-gray-500 dark:text-gray-400">Score:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {score.toFixed(2)}
                  </span>
                </div>
              )}
              
              {/* Followers */}
              <div className="flex items-center gap-1">
                <span className="text-gray-500 dark:text-gray-400">Followers:</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {followerCount.toLocaleString()}
                </span>
              </div>
              
              {/* Following */}
              <div className="flex items-center gap-1">
                <span className="text-gray-500 dark:text-gray-400">Following:</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {followingCount.toLocaleString()}
                </span>
              </div>
              
              {/* URL */}
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-blue-600 dark:text-blue-400 hover:underline truncate max-w-xs"
                >
                  {url}
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

