import { neynarClient } from "./neynar";
import { db } from "./db";
import { webhooks, userWatches } from "./schema";
import { eq, and, sql } from "drizzle-orm";

const WEBHOOK_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/**
 * Create or update a webhook for a user watching multiple users
 * Subscribes to all casts from watched users (parent casts filtered in webhook handler)
 */
export async function createUserWatchWebhook(watcherFid: number, watchedFids: number[]) {
  if (watchedFids.length === 0) {
    // No users to watch, delete webhook if exists
    await deleteUserWatchWebhook(watcherFid);
    return null;
  }

  const webhookUrl = `${WEBHOOK_BASE_URL}/api/webhooks`;
  const webhookName = `user-watch-${watcherFid}`;

  // Check if webhook already exists for this watcher
  const existingWebhook = await db
    .select()
    .from(webhooks)
    .where(
      and(
        eq(webhooks.type, "user-watch"),
        sql`${webhooks.config}->>'watcherFid' = ${watcherFid.toString()}`
      )
    )
    .limit(1);

  let neynarWebhookId: string;
  let webhookResult;

  // Use correct Neynar API format: author_fids instead of fids
  // Note: parent_hashes filtering isn't available for "parent casts only" at subscription level
  // We filter for parent casts in the webhook handler instead
  const subscription = {
    "cast.created": {
      author_fids: watchedFids,
    },
  };

  if (existingWebhook.length > 0) {
    // Update existing webhook
    const existing = existingWebhook[0];
    try {
      // Update webhook via Neynar API
      webhookResult = await neynarClient.updateWebhook({
        webhookId: existing.neynarWebhookId,
        name: webhookName,
        url: webhookUrl,
        subscription,
      });
      neynarWebhookId = existing.neynarWebhookId;
      
      // Extract secret from response (secrets array contains secret objects)
      const webhookData = (webhookResult as any).webhook || webhookResult;
      const secrets = webhookData?.secrets || [];
      let secret = null;
      if (secrets.length > 0) {
        const secretObj = secrets[0];
        // Secret can be an object with 'value' field or a string
        secret = secretObj?.value || secretObj?.secret || (typeof secretObj === 'string' ? secretObj : null);
        console.log(`[Webhook] Extracted secret for webhook ${neynarWebhookId}: ${secret ? '***' + secret.slice(-4) : 'null'}`);
      }
      
      // Update database record
      await db
        .update(webhooks)
        .set({
          config: { watcherFid, watchedFids },
          url: webhookUrl,
          secret: secret || existing.secret, // Keep existing secret if not provided
          updatedAt: new Date(),
        })
        .where(eq(webhooks.id, existing.id));
    } catch (error: any) {
      console.error("Error updating webhook:", error);
      // If update fails, delete old webhook from Neynar first to prevent duplicates
      try {
        await neynarClient.deleteWebhook({
          webhookId: existing.neynarWebhookId,
        });
      } catch (deleteError) {
        console.error("Error deleting old webhook:", deleteError);
      }
      
      // Create new webhook
      webhookResult = await neynarClient.publishWebhook({
        name: webhookName,
        url: webhookUrl,
        subscription,
      });
      neynarWebhookId = (webhookResult.webhook as any).webhook_id || (webhookResult as any).webhook_id;
      
      // Extract secret from response
      const webhookData = (webhookResult as any).webhook || webhookResult;
      const secrets = webhookData?.secrets || [];
      let secret = null;
      if (secrets.length > 0) {
        const secretObj = secrets[0];
        // Secret can be an object with 'value' field or a string
        secret = secretObj?.value || secretObj?.secret || (typeof secretObj === 'string' ? secretObj : null);
        console.log(`[Webhook] Extracted secret for webhook ${neynarWebhookId}: ${secret ? '***' + secret.slice(-4) : 'null'}`);
      }
      
      // Update database with new webhook ID
      await db
        .update(webhooks)
        .set({
          neynarWebhookId,
          config: { watcherFid, watchedFids },
          url: webhookUrl,
          secret: secret || existing.secret, // Keep existing secret if not provided
          updatedAt: new Date(),
        })
        .where(eq(webhooks.id, existing.id));
    }
  } else {
    // Create new webhook
    webhookResult = await neynarClient.publishWebhook({
      name: webhookName,
      url: webhookUrl,
      subscription,
    });
    neynarWebhookId = (webhookResult.webhook as any).webhook_id || (webhookResult as any).webhook_id;

    // Extract secret from response (secrets array contains secret objects)
    const webhookData = (webhookResult as any).webhook || webhookResult;
    const secrets = webhookData?.secrets || [];
    let secret = null;
    if (secrets.length > 0) {
      const secretObj = secrets[0];
      // Secret can be an object with 'value' field or a string
      secret = secretObj?.value || secretObj?.secret || (typeof secretObj === 'string' ? secretObj : null);
      console.log(`[Webhook] Extracted secret for webhook ${neynarWebhookId}: ${secret ? '***' + secret.slice(-4) : 'null'}`);
    }

    // Store webhook in database
    await db.insert(webhooks).values({
      neynarWebhookId,
      type: "user-watch",
      config: { watcherFid, watchedFids },
      url: webhookUrl,
      secret,
    });
  }

  return { neynarWebhookId, webhookResult };
}

/**
 * Delete webhook for a user when they stop watching all users
 */
export async function deleteUserWatchWebhook(watcherFid: number) {
  const existingWebhook = await db
    .select()
    .from(webhooks)
    .where(
      and(
        eq(webhooks.type, "user-watch"),
        sql`${webhooks.config}->>'watcherFid' = ${watcherFid.toString()}`
      )
    )
    .limit(1);

  if (existingWebhook.length === 0) {
    return null;
  }

  const webhook = existingWebhook[0];

  try {
    // Delete from Neynar
    await neynarClient.deleteWebhook({
      webhookId: webhook.neynarWebhookId,
    });

    // Delete from database
    await db.delete(webhooks).where(eq(webhooks.id, webhook.id));

    return { success: true };
  } catch (error: any) {
    console.error("Error deleting webhook:", error);
    // Still delete from database even if Neynar deletion fails
    await db.delete(webhooks).where(eq(webhooks.id, webhook.id));
    throw error;
  }
}

// Note: Curated reply webhook functions removed - reply tracking is now handled via interaction tracking

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
 * Refresh user watch webhook - call after adding/removing watched users
 */
export async function refreshUserWatchWebhook(watcherFid: number) {
  const watchedFids = await getWatchedFids(watcherFid);
  
  if (watchedFids.length === 0) {
    await deleteUserWatchWebhook(watcherFid);
    return null;
  }

  return await createUserWatchWebhook(watcherFid, watchedFids);
}

