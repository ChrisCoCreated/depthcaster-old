/**
 * Engagement scoring constants and utilities
 */

// Engagement weight multipliers
export const ENGAGEMENT_WEIGHTS = {
  REPLIES: 4,
  RECASTS: 2,
  LIKES: 1,
} as const;

/**
 * Calculate engagement score for a cast/reply
 * Handles both count-based and array-based reaction formats from Neynar API
 * 
 * @param cast - Cast object with reactions and replies
 * @returns Weighted engagement score
 */
export function calculateEngagementScore(cast: {
  reactions?: {
    likes_count?: number;
    likes?: any[];
    recasts_count?: number;
    recasts?: any[];
  };
  replies?: {
    count?: number;
  };
}): number {
  // Get likes count (handle both formats: count or array length)
  const likes = cast.reactions?.likes_count ?? 
                (Array.isArray(cast.reactions?.likes) ? cast.reactions.likes.length : 0);

  // Get recasts count (handle both formats: count or array length)
  const recasts = cast.reactions?.recasts_count ?? 
                  (Array.isArray(cast.reactions?.recasts) ? cast.reactions.recasts.length : 0);

  // Get replies count
  const replies = cast.replies?.count ?? 0;

  // Calculate weighted score
  return (
    replies * ENGAGEMENT_WEIGHTS.REPLIES +
    recasts * ENGAGEMENT_WEIGHTS.RECASTS +
    likes * ENGAGEMENT_WEIGHTS.LIKES
  );
}

