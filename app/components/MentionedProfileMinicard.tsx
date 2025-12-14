"use client";

import Link from "next/link";
import { AvatarImage } from "./AvatarImage";

interface MentionedProfileMinicardProps {
  profile: {
    fid: number;
    username?: string;
    display_name?: string;
    pfp_url?: string;
    profile?: {
      bio?: {
        text?: string;
      };
    };
    follower_count?: number;
  };
}

export function MentionedProfileMinicard({ profile }: MentionedProfileMinicardProps) {
  const displayName = profile.display_name || profile.username || `User ${profile.fid}`;
  const username = profile.username || `fid${profile.fid}`;
  const followerCount = profile.follower_count ?? 0;

  return (
    <Link
      href={`/profile/${profile.fid}`}
      onClick={(e) => e.stopPropagation()}
      className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:shadow-sm transition-shadow"
    >
      <AvatarImage
        src={profile.pfp_url}
        alt={displayName}
        size={40}
        className="w-10 h-10 rounded-full flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
          {displayName}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
          @{username} · {followerCount.toLocaleString()} followers
        </div>
      </div>
    </Link>
  );
}

