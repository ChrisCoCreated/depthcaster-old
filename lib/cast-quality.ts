import { Cast } from "@neynar/nodejs-sdk/build/api";

/**
 * Unified constants for cast quality thresholds
 */
export const MIN_USER_SCORE_THRESHOLD = 0.5;
export const MIN_CAST_LENGTH_THRESHOLD = 150;

/**
 * Check if a cast meets the quality threshold
 * Cast meets threshold if: user score > 0.5 OR cast length > 150 characters
 * 
 * @param cast - The cast to check
 * @returns true if cast meets quality threshold, false otherwise
 */
export function meetsCastQualityThreshold(cast: Cast): boolean {
  // Check user score (using cast.author.score, deprecated: cast.author.experimental?.neynar_user_score)
  const userScore = cast.author.score;
  if (userScore !== undefined && userScore > MIN_USER_SCORE_THRESHOLD) {
    return true;
  }

  // Check cast length
  const castLength = cast.text?.length || 0;
  if (castLength > MIN_CAST_LENGTH_THRESHOLD) {
    return true;
  }

  return false;
}

