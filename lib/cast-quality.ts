import { Cast } from "@neynar/nodejs-sdk/build/api";

/**
 * Unified constants for cast quality thresholds
 */
export const MIN_USER_SCORE_THRESHOLD = 0.5;
export const MIN_CAST_LENGTH_THRESHOLD = 150;
export const MIN_BOT_CAST_LENGTH_THRESHOLD = 100;

/**
 * Default hidden bots list
 */
const DEFAULT_HIDDEN_BOTS = ["betonbangers", "deepbot", "bracky"];

/**
 * Check if a cast is from a bot in the default hidden bots list
 */
function isBotCast(cast: Cast): boolean {
  const hiddenBotsLower = DEFAULT_HIDDEN_BOTS.map((b) => b.toLowerCase());

  // Check author username
  if (cast.author?.username) {
    const authorUsername = cast.author.username.toLowerCase();
    if (hiddenBotsLower.includes(authorUsername)) {
      return true;
    }
  }

  // Check mentioned profiles
  if (cast.mentioned_profiles && Array.isArray(cast.mentioned_profiles)) {
    for (const profile of cast.mentioned_profiles) {
      if (profile?.username) {
        const mentionedUsername = profile.username.toLowerCase();
        if (hiddenBotsLower.includes(mentionedUsername)) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Check if a cast meets the quality threshold
 * Cast meets threshold if: user score > 0.5 OR cast length > 150 characters
 * Exception: If cast is from a bot AND length < 100 characters, it's considered low quality
 * 
 * @param cast - The cast to check
 * @returns true if cast meets quality threshold, false otherwise
 */
export function meetsCastQualityThreshold(cast: Cast): boolean {
  const castLength = cast.text?.length || 0;
  const isBot = isBotCast(cast);

  // Bot casts with less than 100 characters are considered low quality
  if (isBot && castLength < MIN_BOT_CAST_LENGTH_THRESHOLD) {
    return false;
  }

  // Check user score (using cast.author.score, deprecated: cast.author.experimental?.neynar_user_score)
  const userScore = cast.author.score;
  if (userScore !== undefined && userScore > MIN_USER_SCORE_THRESHOLD) {
    return true;
  }

  // Check cast length
  if (castLength > MIN_CAST_LENGTH_THRESHOLD) {
    return true;
  }

  return false;
}

