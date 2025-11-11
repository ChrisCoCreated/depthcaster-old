import { Cast } from "@neynar/nodejs-sdk/build/api";
import { CURATED_FIDS, MIN_DEEP_THOUGHT_LENGTH, MIN_USER_SCORE, MIN_REPLY_COUNT } from "./curated";

export interface FilterOptions {
  minLength?: number;
  minUserScore?: number;
  minReplies?: number;
  requireCuratedFid?: boolean;
  requireCuratedChannel?: boolean;
}

export function filterCast(cast: Cast, options: FilterOptions = {}): boolean {
  const {
    minLength = MIN_DEEP_THOUGHT_LENGTH,
    minUserScore = MIN_USER_SCORE,
    minReplies = MIN_REPLY_COUNT,
    requireCuratedFid = false,
    requireCuratedChannel = false,
  } = options;

  // Check user quality score
  const userScore = cast.author.experimental?.neynar_user_score;
  if (userScore !== undefined && userScore < minUserScore) {
    return false;
  }

  // Check cast length
  if (cast.text && cast.text.length < minLength) {
    return false;
  }

  // Check if from curated FID
  if (requireCuratedFid && !CURATED_FIDS.includes(cast.author.fid)) {
    return false;
  }

  // Check if from curated channel
  if (requireCuratedChannel && cast.channel) {
    // Channel check would need channel_id comparison
    // For now, we'll check in the feed fetching logic
  }

  // Check reply count for conversation quality
  if (minReplies > 0 && (cast.replies?.count || 0) < minReplies) {
    return false;
  }

  return true;
}

export function scoreCast(cast: Cast): number {
  let score = 0;

  // Base score from user quality
  const userScore = cast.author.experimental?.neynar_user_score || 0;
  score += userScore * 30;

  // Length bonus (longer = more thoughtful)
  const length = cast.text?.length || 0;
  score += Math.min(length / 10, 20); // Max 20 points for length

  // Engagement quality (replies > likes > recasts)
  const replies = cast.replies?.count || 0;
  const likes = cast.reactions?.likes_count || 0;
  const recasts = cast.reactions?.recasts_count || 0;
  
  score += replies * 5; // Replies are most valuable
  score += likes * 1;
  score += recasts * 0.5;

  // Curated FID bonus
  if (CURATED_FIDS.includes(cast.author.fid)) {
    score += 15;
  }

  // Power badge bonus
  if (cast.author.power_badge) {
    score += 10;
  }

  return score;
}

export function sortCastsByQuality(casts: Cast[]): Cast[] {
  return [...casts].sort((a, b) => {
    const scoreA = scoreCast(a);
    const scoreB = scoreCast(b);
    return scoreB - scoreA; // Descending order
  });
}


