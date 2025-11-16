import { neynarClient } from "./neynar";
import { db } from "./db";
import { webhooks, userWatches, curatedCasts } from "./schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { refreshUnifiedCuratedWebhooks } from "./webhooks-unified";

/**
 * Get watched FIDs for a watcher user
 */
export async function getWatchedFids(watcherFid: number): Promise<number[]> {
  const watches = await db
    .select({ watchedFid: userWatches.watchedFid })
    .from(userWatches)
    .where(eq(userWatches.watcherFid, watcherFid));

  return watches.map((w) => w.watchedFid);
}


/**
 * Delete all webhooks related to a curated cast
 * Finds webhooks where type is 'curated-reply' or 'curated-quote'
 * and config->>'curatedCastHash' equals the cast hash
 */
export async function deleteCuratedCastWebhooks(castHash: string): Promise<number> {
  // Find all webhooks related to this cast
  const relatedWebhooks = await db
    .select()
    .from(webhooks)
    .where(
      and(
        inArray(webhooks.type, ["curated-reply", "curated-quote"]),
        sql`${webhooks.config}->>'curatedCastHash' = ${castHash}`
      )
    );

  let deletedCount = 0;

  // Delete each webhook from Neynar and database
  for (const webhook of relatedWebhooks) {
    try {
      // Delete from Neynar API
      try {
        await neynarClient.deleteWebhook({
          webhookId: webhook.neynarWebhookId,
        });
      } catch (neynarError: any) {
        // Continue with database deletion even if Neynar deletion fails
        // (webhook may already be deleted, network issues, etc.)
        console.error(`Error deleting webhook ${webhook.neynarWebhookId} from Neynar:`, neynarError);
      }

      // Delete from database
      await db.delete(webhooks).where(eq(webhooks.id, webhook.id));
      deletedCount++;
    } catch (error: any) {
      console.error(`Error deleting webhook ${webhook.id}:`, error);
      // Continue with next webhook even if one fails
    }
  }

  return deletedCount;
}

/**
 * Clean up orphaned webhooks that reference casts no longer in curated_casts table
 * Returns count of cleaned up webhooks
 */
export async function cleanupOrphanedWebhooks(): Promise<number> {
  // Get all curated-reply and curated-quote webhooks
  const curatedWebhooks = await db
    .select()
    .from(webhooks)
    .where(
      inArray(webhooks.type, ["curated-reply", "curated-quote"])
    );

  let cleanedCount = 0;

  for (const webhook of curatedWebhooks) {
    try {
      // Extract curatedCastHash from config
      const config = webhook.config as any;
      const curatedCastHash = config?.curatedCastHash;

      if (!curatedCastHash) {
        // Skip webhooks without curatedCastHash in config
        continue;
      }

      // Check if the cast still exists in curated_casts table
      const existingCast = await db
        .select()
        .from(curatedCasts)
        .where(eq(curatedCasts.castHash, curatedCastHash))
        .limit(1);

      // If cast doesn't exist, delete the webhook
      if (existingCast.length === 0) {
        try {
          // Delete from Neynar API
          try {
            await neynarClient.deleteWebhook({
              webhookId: webhook.neynarWebhookId,
            });
          } catch (neynarError: any) {
            // Continue with database deletion even if Neynar deletion fails
            console.error(`Error deleting orphaned webhook ${webhook.neynarWebhookId} from Neynar:`, neynarError);
          }

          // Delete from database
          await db.delete(webhooks).where(eq(webhooks.id, webhook.id));
          cleanedCount++;
        } catch (error: any) {
          console.error(`Error deleting orphaned webhook ${webhook.id}:`, error);
        }
      }
    } catch (error: any) {
      console.error(`Error processing webhook ${webhook.id}:`, error);
      // Continue with next webhook
    }
  }

  return cleanedCount;
}

