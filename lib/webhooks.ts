import { neynarClient } from "./neynar";
import { db } from "./db";
import { webhooks, userWatches } from "./schema";
import { eq, and, sql } from "drizzle-orm";
import { MIN_USER_SCORE_THRESHOLD } from "./cast-quality";

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

/**
 * Convert cast hash to Neynar root parent URL format
 * Neynar uses chain:// URLs for root_parent_urls filter
 */
function castHashToRootParentUrl(castHash: string): string {
  // Neynar uses chain://eip155:1/erc721:{hash} format for root parent URLs
  // However, for casts, we may need to use a different format
  // Based on Neynar docs, root_parent_urls can be cast URLs
  // For now, we'll use the cast hash directly as the URL identifier
  // The actual format may need to be verified with Neynar API
  return `chain://eip155:1/erc721:${castHash}`;
}

/**
 * Create webhook for replies to a curated conversation
 * Filters by root_parent_urls and minimum author score
 */
export async function createCuratedConversationWebhook(curatedCastHash: string) {
  const webhookUrl = `${WEBHOOK_BASE_URL}/api/webhooks`;
  const webhookName = `curated-reply-${curatedCastHash}`;
  const rootParentUrl = castHashToRootParentUrl(curatedCastHash);

  // Check if webhook already exists
  const existingWebhook = await db
    .select()
    .from(webhooks)
    .where(
      and(
        eq(webhooks.type, "curated-reply"),
        sql`${webhooks.config}->>'curatedCastHash' = ${curatedCastHash}`
      )
    )
    .limit(1);

  const subscription = {
    "cast.created": {
      root_parent_urls: [rootParentUrl],
      author_score_min: MIN_USER_SCORE_THRESHOLD,
    },
  };

  let neynarWebhookId: string;
  let webhookResult;

  if (existingWebhook.length > 0) {
    // Update existing webhook
    const existing = existingWebhook[0];
    try {
      webhookResult = await neynarClient.updateWebhook({
        webhookId: existing.neynarWebhookId,
        name: webhookName,
        url: webhookUrl,
        subscription,
      });
      neynarWebhookId = existing.neynarWebhookId;

      const webhookData = (webhookResult as any).webhook || webhookResult;
      const secrets = webhookData?.secrets || [];
      let secret = null;
      if (secrets.length > 0) {
        const secretObj = secrets[0];
        secret = secretObj?.value || secretObj?.secret || (typeof secretObj === 'string' ? secretObj : null);
      }

      await db
        .update(webhooks)
        .set({
          config: { curatedCastHash, rootCastHash: curatedCastHash },
          url: webhookUrl,
          secret: secret || existing.secret,
          updatedAt: new Date(),
        })
        .where(eq(webhooks.id, existing.id));
    } catch (error: any) {
      console.error("Error updating curated reply webhook:", error);
      // Try to delete and recreate
      try {
        await neynarClient.deleteWebhook({ webhookId: existing.neynarWebhookId });
      } catch (deleteError) {
        console.error("Error deleting old webhook:", deleteError);
      }

      webhookResult = await neynarClient.publishWebhook({
        name: webhookName,
        url: webhookUrl,
        subscription,
      });
      neynarWebhookId = (webhookResult.webhook as any).webhook_id || (webhookResult as any).webhook_id;

      const webhookData = (webhookResult as any).webhook || webhookResult;
      const secrets = webhookData?.secrets || [];
      let secret = null;
      if (secrets.length > 0) {
        const secretObj = secrets[0];
        secret = secretObj?.value || secretObj?.secret || (typeof secretObj === 'string' ? secretObj : null);
      }

      await db
        .update(webhooks)
        .set({
          neynarWebhookId,
          config: { curatedCastHash, rootCastHash: curatedCastHash },
          url: webhookUrl,
          secret: secret || existing.secret,
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

    const webhookData = (webhookResult as any).webhook || webhookResult;
    const secrets = webhookData?.secrets || [];
    let secret = null;
    if (secrets.length > 0) {
      const secretObj = secrets[0];
      secret = secretObj?.value || secretObj?.secret || (typeof secretObj === 'string' ? secretObj : null);
    }

    await db.insert(webhooks).values({
      neynarWebhookId,
      type: "curated-reply",
      config: { curatedCastHash, rootCastHash: curatedCastHash },
      url: webhookUrl,
      secret,
    });
  }

  return { neynarWebhookId, webhookResult };
}

/**
 * Create webhook for quote casts that quote a curated cast
 * Filters by root_parent_urls and minimum author score
 * Note: Quote cast detection happens in webhook handler (check embeds array)
 */
export async function createQuoteCastWebhook(curatedCastHash: string) {
  const webhookUrl = `${WEBHOOK_BASE_URL}/api/webhooks`;
  const webhookName = `curated-quote-${curatedCastHash}`;
  const rootParentUrl = castHashToRootParentUrl(curatedCastHash);

  // Check if webhook already exists
  const existingWebhook = await db
    .select()
    .from(webhooks)
    .where(
      and(
        eq(webhooks.type, "curated-quote"),
        sql`${webhooks.config}->>'curatedCastHash' = ${curatedCastHash}`
      )
    )
    .limit(1);

  const subscription = {
    "cast.created": {
      root_parent_urls: [rootParentUrl],
      author_score_min: MIN_USER_SCORE_THRESHOLD,
    },
  };

  let neynarWebhookId: string;
  let webhookResult;

  if (existingWebhook.length > 0) {
    // Update existing webhook
    const existing = existingWebhook[0];
    try {
      webhookResult = await neynarClient.updateWebhook({
        webhookId: existing.neynarWebhookId,
        name: webhookName,
        url: webhookUrl,
        subscription,
      });
      neynarWebhookId = existing.neynarWebhookId;

      const webhookData = (webhookResult as any).webhook || webhookResult;
      const secrets = webhookData?.secrets || [];
      let secret = null;
      if (secrets.length > 0) {
        const secretObj = secrets[0];
        secret = secretObj?.value || secretObj?.secret || (typeof secretObj === 'string' ? secretObj : null);
      }

      await db
        .update(webhooks)
        .set({
          config: { curatedCastHash, rootCastHash: curatedCastHash },
          url: webhookUrl,
          secret: secret || existing.secret,
          updatedAt: new Date(),
        })
        .where(eq(webhooks.id, existing.id));
    } catch (error: any) {
      console.error("Error updating curated quote webhook:", error);
      // Try to delete and recreate
      try {
        await neynarClient.deleteWebhook({ webhookId: existing.neynarWebhookId });
      } catch (deleteError) {
        console.error("Error deleting old webhook:", deleteError);
      }

      webhookResult = await neynarClient.publishWebhook({
        name: webhookName,
        url: webhookUrl,
        subscription,
      });
      neynarWebhookId = (webhookResult.webhook as any).webhook_id || (webhookResult as any).webhook_id;

      const webhookData = (webhookResult as any).webhook || webhookResult;
      const secrets = webhookData?.secrets || [];
      let secret = null;
      if (secrets.length > 0) {
        const secretObj = secrets[0];
        secret = secretObj?.value || secretObj?.secret || (typeof secretObj === 'string' ? secretObj : null);
      }

      await db
        .update(webhooks)
        .set({
          neynarWebhookId,
          config: { curatedCastHash, rootCastHash: curatedCastHash },
          url: webhookUrl,
          secret: secret || existing.secret,
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

    const webhookData = (webhookResult as any).webhook || webhookResult;
    const secrets = webhookData?.secrets || [];
    let secret = null;
    if (secrets.length > 0) {
      const secretObj = secrets[0];
      secret = secretObj?.value || secretObj?.secret || (typeof secretObj === 'string' ? secretObj : null);
    }

    await db.insert(webhooks).values({
      neynarWebhookId,
      type: "curated-quote",
      config: { curatedCastHash, rootCastHash: curatedCastHash },
      url: webhookUrl,
      secret,
    });
  }

  return { neynarWebhookId, webhookResult };
}

/**
 * Create webhook for replies to a quote cast conversation
 * Called when a quote cast fires and quotes a curated cast
 */
export async function createReplyWebhookForQuote(quotedCastHash: string, quoteCastHash: string) {
  const webhookUrl = `${WEBHOOK_BASE_URL}/api/webhooks`;
  const webhookName = `curated-reply-quote-${quoteCastHash}`;
  const rootParentUrl = castHashToRootParentUrl(quoteCastHash);

  // Check if webhook already exists
  const existingWebhook = await db
    .select()
    .from(webhooks)
    .where(
      and(
        eq(webhooks.type, "curated-reply"),
        sql`${webhooks.config}->>'quoteCastHash' = ${quoteCastHash}`
      )
    )
    .limit(1);

  const subscription = {
    "cast.created": {
      root_parent_urls: [rootParentUrl],
      author_score_min: MIN_USER_SCORE_THRESHOLD,
    },
  };

  if (existingWebhook.length > 0) {
    // Webhook already exists
    return { neynarWebhookId: existingWebhook[0].neynarWebhookId };
  }

  // Create new webhook
  const webhookResult = await neynarClient.publishWebhook({
    name: webhookName,
    url: webhookUrl,
    subscription,
  });
  const neynarWebhookId = (webhookResult.webhook as any).webhook_id || (webhookResult as any).webhook_id;

  const webhookData = (webhookResult as any).webhook || webhookResult;
  const secrets = webhookData?.secrets || [];
  let secret = null;
  if (secrets.length > 0) {
    const secretObj = secrets[0];
    secret = secretObj?.value || secretObj?.secret || (typeof secretObj === 'string' ? secretObj : null);
  }

  await db.insert(webhooks).values({
    neynarWebhookId,
    type: "curated-reply",
    config: { quotedCastHash, quoteCastHash, rootCastHash: quoteCastHash },
    url: webhookUrl,
    secret,
  });

  return { neynarWebhookId, webhookResult };
}

