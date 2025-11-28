import { getUserRoles } from "./roles";
import { db } from "./db";
import { curatedCasts, curatedCastInteractions, castReplies } from "./schema";
import { eq } from "drizzle-orm";

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
if (!NEYNAR_API_KEY) {
  throw new Error("NEYNAR_API_KEY is not set in environment variables");
}

const NEYNAR_API_BASE_URL = "https://snapchain-api.neynar.com";

interface ReactionResponse {
  messages?: Array<{
    hash?: string;
    data?: {
      reactionBody?: {
        type?: string;
        targetCastId?: {
          hash?: string;
          fid?: number;
        };
        targetUrl?: string;
      };
    };
  }>;
  nextPageToken?: string;
}

/**
 * Fetch all reactions for a user by reaction type
 * Handles pagination even though API may return all in one payload
 */
export async function fetchUserReactions(
  fid: number,
  reactionType: "Like" | "Recast"
): Promise<Array<{ castHash: string }>> {
  const allReactions: Array<{ castHash: string }> = [];
  let cursor: string | undefined;

  do {
    try {
      const params = new URLSearchParams({
        reaction_type: reactionType,
        fid: fid.toString(),
      });

      if (cursor) {
        params.append("pageToken", cursor);
      }

      const url = `${NEYNAR_API_BASE_URL}/v1/reactionsByFid?${params.toString()}`;
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "x-api-key": NEYNAR_API_KEY as string,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to fetch ${reactionType} reactions for FID ${fid}: ${response.status} ${errorText}`
        );
      }

      const data: ReactionResponse = await response.json();
      const messages = data.messages || [];

      // Extract cast hashes from reaction messages
      for (const message of messages) {
        const targetCastHash = message.data?.reactionBody?.targetCastId?.hash;
        if (targetCastHash) {
          allReactions.push({ castHash: targetCastHash });
        }
      }

      // Check for pagination
      cursor = data.nextPageToken;
    } catch (error) {
      console.error(
        `Error fetching ${reactionType} reactions for FID ${fid}:`,
        error
      );
      // Break on error to avoid infinite loops
      break;
    }
  } while (cursor);

  return allReactions;
}

/**
 * Sync all reactions for a user (likes and recasts)
 * Only syncs if user has a role, and only stores reactions to curated casts or replies
 */
export async function syncUserReactions(fid: number): Promise<{
  likesSynced: number;
  recastsSynced: number;
  errors: number;
}> {
  const stats = {
    likesSynced: 0,
    recastsSynced: 0,
    errors: 0,
  };

  // Check if user has any role
  const userRoles = await getUserRoles(fid);
  if (userRoles.length === 0) {
    console.log(`[Reaction Sync] User ${fid} has no roles, skipping reaction sync`);
    return stats;
  }

  console.log(`[Reaction Sync] Starting sync for user ${fid} (roles: ${userRoles.join(", ")})`);

  // Fetch likes
  try {
    console.log(`[Reaction Sync] Fetching likes for user ${fid}...`);
    const likeReactions = await fetchUserReactions(fid, "Like");
    console.log(`[Reaction Sync] Found ${likeReactions.length} like reactions for user ${fid}`);

    for (const reaction of likeReactions) {
      try {
        let curatedCastHash: string | null = null;

        // Check if cast is in curatedCasts table
        const curatedCast = await db
          .select({ castHash: curatedCasts.castHash })
          .from(curatedCasts)
          .where(eq(curatedCasts.castHash, reaction.castHash))
          .limit(1);

        if (curatedCast.length > 0) {
          curatedCastHash = curatedCast[0].castHash;
        } else {
          // Check if cast is in castReplies table
          const reply = await db
            .select({ curatedCastHash: castReplies.curatedCastHash })
            .from(castReplies)
            .where(eq(castReplies.replyCastHash, reaction.castHash))
            .limit(1);

          if (reply.length > 0) {
            curatedCastHash = reply[0].curatedCastHash;
          }
        }

        // If found in either table, record the reaction
        if (curatedCastHash) {
          await db.insert(curatedCastInteractions).values({
            curatedCastHash,
            targetCastHash: reaction.castHash,
            interactionType: "like",
            userFid: fid,
          }).onConflictDoNothing();
          stats.likesSynced++;
        }
      } catch (error) {
        console.error(
          `[Reaction Sync] Error processing like reaction ${reaction.castHash} for user ${fid}:`,
          error
        );
        stats.errors++;
      }
    }
  } catch (error) {
    console.error(`[Reaction Sync] Error fetching likes for user ${fid}:`, error);
    stats.errors++;
  }

  // Fetch recasts
  try {
    console.log(`[Reaction Sync] Fetching recasts for user ${fid}...`);
    const recastReactions = await fetchUserReactions(fid, "Recast");
    console.log(`[Reaction Sync] Found ${recastReactions.length} recast reactions for user ${fid}`);

    for (const reaction of recastReactions) {
      try {
        let curatedCastHash: string | null = null;

        // Check if cast is in curatedCasts table
        const curatedCast = await db
          .select({ castHash: curatedCasts.castHash })
          .from(curatedCasts)
          .where(eq(curatedCasts.castHash, reaction.castHash))
          .limit(1);

        if (curatedCast.length > 0) {
          curatedCastHash = curatedCast[0].castHash;
        } else {
          // Check if cast is in castReplies table
          const reply = await db
            .select({ curatedCastHash: castReplies.curatedCastHash })
            .from(castReplies)
            .where(eq(castReplies.replyCastHash, reaction.castHash))
            .limit(1);

          if (reply.length > 0) {
            curatedCastHash = reply[0].curatedCastHash;
          }
        }

        // If found in either table, record the reaction
        if (curatedCastHash) {
          await db.insert(curatedCastInteractions).values({
            curatedCastHash,
            targetCastHash: reaction.castHash,
            interactionType: "recast",
            userFid: fid,
          }).onConflictDoNothing();
          stats.recastsSynced++;
        }
      } catch (error) {
        console.error(
          `[Reaction Sync] Error processing recast reaction ${reaction.castHash} for user ${fid}:`,
          error
        );
        stats.errors++;
      }
    }
  } catch (error) {
    console.error(`[Reaction Sync] Error fetching recasts for user ${fid}:`, error);
    stats.errors++;
  }

  console.log(
    `[Reaction Sync] Completed sync for user ${fid}: ${stats.likesSynced} likes, ${stats.recastsSynced} recasts, ${stats.errors} errors`
  );

  return stats;
}

