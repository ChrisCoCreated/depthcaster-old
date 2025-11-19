/**
 * Extract metadata from cast data for database storage
 * These functions extract commonly queried fields from JSONB to enable
 * database-level filtering and reduce JSONB parsing overhead
 */

import { calculateEngagementScore } from "./engagement";

export interface CastMetadata {
  castText: string | null;
  castTextLength: number;
  authorFid: number | null;
  likesCount: number;
  recastsCount: number;
  repliesCount: number;
  engagementScore: number;
  parentHash: string | null;
}

/**
 * Extract all metadata from cast data
 */
export function extractCastMetadata(castData: any): CastMetadata {
  const castText = castData?.text || null;
  const castTextLength = castText ? castText.length : 0;
  
  const authorFid = castData?.author?.fid 
    ? (typeof castData.author.fid === 'number' ? castData.author.fid : parseInt(castData.author.fid))
    : null;
  
  // Extract engagement metrics (handle both count and array formats)
  const likesCount = castData?.reactions?.likes_count ?? 
    (Array.isArray(castData?.reactions?.likes) ? castData.reactions.likes.length : 0);
  
  const recastsCount = castData?.reactions?.recasts_count ?? 
    (Array.isArray(castData?.reactions?.recasts) ? castData.reactions.recasts.length : 0);
  
  const repliesCount = castData?.replies?.count ?? 0;
  
  // Calculate engagement score
  const engagementScore = calculateEngagementScore({
    reactions: {
      likes_count: likesCount,
      recasts_count: recastsCount,
    },
    replies: {
      count: repliesCount,
    },
  });
  
  const parentHash = castData?.parent_hash || null;
  
  return {
    castText,
    castTextLength,
    authorFid,
    likesCount,
    recastsCount,
    repliesCount,
    engagementScore,
    parentHash,
  };
}

/**
 * Extract only text fields (for lightweight queries)
 */
export function extractCastText(castData: any): { castText: string | null; castTextLength: number } {
  const castText = castData?.text || null;
  const castTextLength = castText ? castText.length : 0;
  return { castText, castTextLength };
}

/**
 * Extract only engagement metrics (for sorting/filtering)
 */
export function extractCastEngagement(castData: any): {
  likesCount: number;
  recastsCount: number;
  repliesCount: number;
  engagementScore: number;
} {
  const likesCount = castData?.reactions?.likes_count ?? 
    (Array.isArray(castData?.reactions?.likes) ? castData.reactions.likes.length : 0);
  
  const recastsCount = castData?.reactions?.recasts_count ?? 
    (Array.isArray(castData?.reactions?.recasts) ? castData.reactions.recasts.length : 0);
  
  const repliesCount = castData?.replies?.count ?? 0;
  
  const engagementScore = calculateEngagementScore({
    reactions: {
      likes_count: likesCount,
      recasts_count: recastsCount,
    },
    replies: {
      count: repliesCount,
    },
  });
  
  return {
    likesCount,
    recastsCount,
    repliesCount,
    engagementScore,
  };
}





