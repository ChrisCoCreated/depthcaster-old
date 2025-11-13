import { Cast } from "@neynar/nodejs-sdk/build/api";

const DEFAULT_HIDDEN_BOTS = ["betonbangers", "deepbot", "bracky"];

/**
 * Check if a cast should be hidden based on bot filtering preferences
 * Checks both author username and mentioned profiles
 */
export async function shouldHideBotCast(
  cast: Cast,
  viewerFid?: number
): Promise<boolean> {
  if (!viewerFid) {
    // Default behavior: hide default bots if no viewer
    return checkBotMatch(cast, DEFAULT_HIDDEN_BOTS);
  }

  try {
    // Lazy import to avoid loading db.ts in client components
    const { getUser } = await import("./users");
    const user = await getUser(viewerFid);
    const preferences = (user?.preferences || {}) as { hideBots?: boolean; hiddenBots?: string[] };
    
    // If hideBots is false, don't hide anything
    if (preferences.hideBots === false) {
      return false;
    }
    
    // Default to true if not set
    const hideBots = preferences.hideBots !== undefined ? preferences.hideBots : true;
    if (!hideBots) {
      return false;
    }

    const hiddenBots = preferences.hiddenBots || DEFAULT_HIDDEN_BOTS;
    return checkBotMatch(cast, hiddenBots);
  } catch (error) {
    console.error("Error checking bot preferences:", error);
    // Fallback to default behavior
    return checkBotMatch(cast, DEFAULT_HIDDEN_BOTS);
  }
}

/**
 * Check if a cast matches any of the hidden bot usernames
 * Checks both author username and mentioned profiles
 */
function checkBotMatch(cast: Cast, hiddenBots: string[]): boolean {
  if (!hiddenBots || hiddenBots.length === 0) {
    return false;
  }

  const hiddenBotsLower = hiddenBots.map((b) => b.toLowerCase());

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
 * Client-side version that uses cached preferences
 * For use in client components where we can't easily access user preferences
 */
export function shouldHideBotCastClient(
  cast: Cast,
  hiddenBots?: string[],
  hideBots?: boolean
): boolean {
  // If hideBots is explicitly false, don't hide
  if (hideBots === false) {
    return false;
  }

  // Default to hiding if not specified (undefined or true)
  const botsToCheck = hiddenBots || DEFAULT_HIDDEN_BOTS;
  return checkBotMatch(cast, botsToCheck);
}

