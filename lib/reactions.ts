import { getUserRoles } from "./roles";
import { db } from "./db";
import { curatedCasts, curatedCastInteractions, castReplies, userReactionSyncState, apiCallStats } from "./schema";
import { eq, and, desc, sql } from "drizzle-orm";

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

  // Initialize sync state with the most recent reaction after full sync
  try {
    // Find the most recent reaction we just synced (by checking our DB)
    const mostRecentLike = await db
      .select({ targetCastHash: curatedCastInteractions.targetCastHash, createdAt: curatedCastInteractions.createdAt })
      .from(curatedCastInteractions)
      .where(and(
        eq(curatedCastInteractions.userFid, fid),
        eq(curatedCastInteractions.interactionType, "like")
      ))
      .orderBy(desc(curatedCastInteractions.createdAt))
      .limit(1);

    const mostRecentRecast = await db
      .select({ targetCastHash: curatedCastInteractions.targetCastHash, createdAt: curatedCastInteractions.createdAt })
      .from(curatedCastInteractions)
      .where(and(
        eq(curatedCastInteractions.userFid, fid),
        eq(curatedCastInteractions.interactionType, "recast")
      ))
      .orderBy(desc(curatedCastInteractions.createdAt))
      .limit(1);

    // Determine which is more recent
    let mostRecentReaction: { targetCastHash: string; createdAt: Date; type: string } | null = null;
    if (mostRecentLike.length > 0 && mostRecentRecast.length > 0) {
      if (mostRecentLike[0].createdAt > mostRecentRecast[0].createdAt) {
        mostRecentReaction = { ...mostRecentLike[0], type: "like" };
      } else {
        mostRecentReaction = { ...mostRecentRecast[0], type: "recast" };
      }
    } else if (mostRecentLike.length > 0) {
      mostRecentReaction = { ...mostRecentLike[0], type: "like" };
    } else if (mostRecentRecast.length > 0) {
      mostRecentReaction = { ...mostRecentRecast[0], type: "recast" };
    }

    // Update or create sync state
    if (mostRecentReaction) {
      await db.insert(userReactionSyncState).values({
        userFid: fid,
        lastReactionHash: mostRecentReaction.targetCastHash,
        lastReactionType: mostRecentReaction.type,
        lastReactionTimestamp: mostRecentReaction.createdAt,
        lastCheckedAt: new Date(),
      }).onConflictDoUpdate({
        target: userReactionSyncState.userFid,
        set: {
          lastReactionHash: mostRecentReaction.targetCastHash,
          lastReactionType: mostRecentReaction.type,
          lastReactionTimestamp: mostRecentReaction.createdAt,
          lastCheckedAt: new Date(),
          updatedAt: new Date(),
        },
      });
      console.log(`[Reaction Sync] Initialized sync state for user ${fid} with reaction ${mostRecentReaction.targetCastHash}`);
    }
  } catch (error) {
    console.error(`[Reaction Sync] Error initializing sync state for user ${fid}:`, error);
    // Don't fail the sync if state initialization fails
  }

  return stats;
}

/**
 * Fetch a single reaction for incremental sync (uses REST API with limit:1)
 */
async function fetchSingleUserReaction(
  fid: number,
  reactionType: "Like" | "Recast",
  cursor?: string
): Promise<{ reactions: Array<{ castHash: string; hash?: string; timestamp?: string; type: string }>; nextPageToken?: string }> {
  const params = new URLSearchParams({
    reaction_type: reactionType,
    fid: fid.toString(),
    limit: "1", // Fetch one at a time for cost efficiency
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

  // Extract reaction details
  const reactions = messages.map((message) => {
    const targetCastHash = message.data?.reactionBody?.targetCastId?.hash;
    const reactionHash = message.hash;
    // Timestamp may not be available in the API response, will be null if not present
    const timestamp = undefined; // API doesn't provide timestamp in this endpoint
    return {
      castHash: targetCastHash || "",
      hash: reactionHash,
      timestamp,
      type: reactionType.toLowerCase() as string,
    };
  }).filter(r => r.castHash); // Filter out reactions without target cast

  return {
    reactions,
    nextPageToken: data.nextPageToken,
  };
}

/**
 * Incrementally sync reactions for a user since last check
 * Uses REST API with limit:1 for cost efficiency, checking both likes and recasts
 * Only syncs if user has a role, and only stores reactions to curated casts or replies
 */
export async function syncUserReactionsIncremental(fid: number): Promise<{
  reactionsSynced: number;
  errors: number;
}> {
  const stats = {
    reactionsSynced: 0,
    errors: 0,
  };

  // Check if user has any role
  const userRoles = await getUserRoles(fid);
  if (userRoles.length === 0) {
    console.log(`[Incremental Reaction Sync] User ${fid} has no roles, skipping reaction sync`);
    return stats;
  }

  console.log(`[Incremental Reaction Sync] Starting incremental sync for user ${fid} (roles: ${userRoles.join(", ")})`);

  // Get last sync state
  const syncState = await db
    .select()
    .from(userReactionSyncState)
    .where(eq(userReactionSyncState.userFid, fid))
    .limit(1);

  const lastReactionHash = syncState.length > 0 ? syncState[0].lastReactionHash : null;
  const lastReactionTimestamp = syncState.length > 0 ? syncState[0].lastReactionTimestamp : null;

  let newestReactionHash: string | null = null;
  let newestReactionType: string | null = null;
  let newestReactionTimestamp: Date | null = null;
  let reactionsChecked = 0;
  const MAX_REACTIONS_TO_CHECK = 100; // Fallback limit when timestamp not available

  // Process both likes and recasts, alternating to get the most recent overall
  const reactionTypes: Array<"Like" | "Recast"> = ["Like", "Recast"];
  
  try {
    for (const reactionType of reactionTypes) {
      let cursor: string | undefined;
      let typeReactionsChecked = 0;

      do {
        try {
          const response = await fetchSingleUserReaction(fid, reactionType, cursor);
          
          // Track reaction fetch in statistics
          try {
            await db.insert(apiCallStats).values({
              callType: "reaction_fetch",
              count: 1,
            }).onConflictDoUpdate({
              target: apiCallStats.callType,
              set: {
                count: sql`api_call_stats.count + 1`,
                updatedAt: sql`now()`,
              },
            });
          } catch (error) {
            // Silently fail - statistics tracking shouldn't break the sync
            console.error("[Incremental Reaction Sync] Error tracking API call stat:", error);
          }
          
          const reactions = response.reactions || [];

          if (reactions.length === 0) {
            break; // No more reactions of this type
          }

          const reaction = reactions[0];
          reactionsChecked++;
          typeReactionsChecked++;

          const reactionHash = reaction.hash || null;
          const reactionTypeLower = (reaction.type || reactionType.toLowerCase()) || null;
          const targetCastHash = reaction.castHash;
          const reactionTimestamp = reaction.timestamp ? new Date(reaction.timestamp) : null;

          if (!targetCastHash) {
            cursor = response.nextPageToken;
            continue;
          }

          // Track newest reaction seen across all types
          if (!newestReactionHash || (reactionTimestamp && (!newestReactionTimestamp || reactionTimestamp > newestReactionTimestamp))) {
            newestReactionHash = reactionHash;
            newestReactionType = reactionTypeLower;
            newestReactionTimestamp = reactionTimestamp;
          }

          // Check if we've reached our stopping point
          let shouldStop = false;

          // Primary: Check if this reaction is already in our DB
          const existingInteraction = await db
            .select()
            .from(curatedCastInteractions)
            .where(and(
              eq(curatedCastInteractions.userFid, fid),
              eq(curatedCastInteractions.targetCastHash, targetCastHash),
              eq(curatedCastInteractions.interactionType, reactionTypeLower || "")
            ))
            .limit(1);

          if (existingInteraction.length > 0) {
            console.log(`[Incremental Reaction Sync] Found existing reaction ${targetCastHash}, stopping ${reactionType}`);
            shouldStop = true;
          }

          // Secondary: Check if we've hit the last known reaction hash
          if (!shouldStop && lastReactionHash && reactionHash === lastReactionHash) {
            console.log(`[Incremental Reaction Sync] Reached last known reaction ${lastReactionHash}, stopping ${reactionType}`);
            shouldStop = true;
          }

          // Tertiary: Use timestamp comparison if available (prioritized over count)
          if (!shouldStop && lastReactionTimestamp && reactionTimestamp) {
            if (reactionTimestamp <= lastReactionTimestamp) {
              console.log(`[Incremental Reaction Sync] Reached timestamp threshold (${reactionTimestamp} <= ${lastReactionTimestamp}), stopping ${reactionType}`);
              shouldStop = true;
            }
          }

          // Fallback: Use reasonable number check only if timestamp not available
          if (!shouldStop && !lastReactionTimestamp && reactionsChecked >= MAX_REACTIONS_TO_CHECK) {
            console.log(`[Incremental Reaction Sync] Reached max check limit (${MAX_REACTIONS_TO_CHECK}), stopping ${reactionType}`);
            shouldStop = true;
          }

          // Process the reaction if it's new
          if (!shouldStop || !existingInteraction.length) {
            try {
              let curatedCastHash: string | null = null;

              // Check if cast is in curatedCasts table
              const curatedCast = await db
                .select({ castHash: curatedCasts.castHash })
                .from(curatedCasts)
                .where(eq(curatedCasts.castHash, targetCastHash))
                .limit(1);

              if (curatedCast.length > 0) {
                curatedCastHash = curatedCast[0].castHash;
              } else {
                // Check if cast is in castReplies table
                const reply = await db
                  .select({ curatedCastHash: castReplies.curatedCastHash })
                  .from(castReplies)
                  .where(eq(castReplies.replyCastHash, targetCastHash))
                  .limit(1);

                if (reply.length > 0) {
                  curatedCastHash = reply[0].curatedCastHash;
                }
              }

              // If found in either table, record the reaction
              if (curatedCastHash && reactionTypeLower) {
                await db.insert(curatedCastInteractions).values({
                  curatedCastHash,
                  targetCastHash,
                  interactionType: reactionTypeLower,
                  userFid: fid,
                }).onConflictDoNothing();
                stats.reactionsSynced++;
              }
            } catch (error) {
              console.error(
                `[Incremental Reaction Sync] Error processing reaction ${targetCastHash} for user ${fid}:`,
                error
              );
              stats.errors++;
            }
          }

          if (shouldStop) {
            break;
          }

          cursor = response.nextPageToken;
        } catch (error) {
          console.error(
            `[Incremental Reaction Sync] Error fetching ${reactionType} reactions for user ${fid}:`,
            error
          );
          stats.errors++;
          break; // Break on error to avoid infinite loops
        }
      } while (cursor);

      // If we've checked enough reactions or hit a stopping point, break early
      if (reactionsChecked >= MAX_REACTIONS_TO_CHECK && !lastReactionTimestamp) {
        break;
      }
    }

    // Update sync state with newest reaction found
    if (newestReactionHash) {
      await db.insert(userReactionSyncState).values({
        userFid: fid,
        lastReactionHash: newestReactionHash,
        lastReactionType: newestReactionType,
        lastReactionTimestamp: newestReactionTimestamp,
        lastCheckedAt: new Date(),
      }).onConflictDoUpdate({
        target: userReactionSyncState.userFid,
        set: {
          lastReactionHash: newestReactionHash,
          lastReactionType: newestReactionType,
          lastReactionTimestamp: newestReactionTimestamp,
          lastCheckedAt: new Date(),
          updatedAt: new Date(),
        },
      });
    } else {
      // Update lastCheckedAt even if no new reactions found
      if (syncState.length > 0) {
        await db.update(userReactionSyncState)
          .set({ lastCheckedAt: new Date(), updatedAt: new Date() })
          .where(eq(userReactionSyncState.userFid, fid));
      }
    }

    console.log(
      `[Incremental Reaction Sync] Completed sync for user ${fid}: ${stats.reactionsSynced} reactions synced, ${stats.errors} errors, ${reactionsChecked} reactions checked`
    );
  } catch (error) {
    console.error(`[Incremental Reaction Sync] Error in incremental sync for user ${fid}:`, error);
    stats.errors++;
  }

  return stats;
}

