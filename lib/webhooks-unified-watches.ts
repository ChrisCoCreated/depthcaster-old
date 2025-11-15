import { neynarClient } from "./neynar";
import { db } from "./db";
import { webhooks, userWatches } from "./schema";
import { eq } from "drizzle-orm";

const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://depthcaster.vercel.app";

/**
 * Get all unique watched FIDs from the user_watches table
 */
async function getAllWatchedFids(): Promise<number[]> {
  const watches = await db
    .select({ watchedFid: userWatches.watchedFid })
    .from(userWatches);
  
  // Get unique FIDs
  const uniqueFids = Array.from(new Set(watches.map(w => w.watchedFid)));
  return uniqueFids;
}

/**
 * Create or update unified webhook for all user watches
 * Uses a single webhook with all watched FIDs
 */
export async function createUnifiedUserWatchWebhook() {
  // Ensure we use production URL, not localhost
  const baseUrl = process.env.WEBHOOK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://depthcaster.vercel.app";
  const webhookUrl = `${baseUrl}/api/webhooks`;
  const webhookName = "user-watches-unified";
  
  // Validate URL is not localhost
  if (webhookUrl.includes("localhost") || webhookUrl.includes("127.0.0.1")) {
    throw new Error(`Invalid webhook URL: ${webhookUrl}. Webhooks must use a public URL. Set WEBHOOK_BASE_URL or NEXT_PUBLIC_APP_URL environment variable.`);
  }
  
  console.log(`[Webhook] Using webhook URL: ${webhookUrl}`);

  // Get all unique watched FIDs
  const allWatchedFids = await getAllWatchedFids();
  
  if (allWatchedFids.length === 0) {
    console.log("[Webhook] No watched users found, skipping webhook creation");
    return null;
  }

  console.log(`[Webhook] Building unified watch subscription with ${allWatchedFids.length} watched FIDs`);
  console.log(`[Webhook] Sample FIDs:`, allWatchedFids.slice(0, 10));

  // Build subscription object
  const subscription = {
    "cast.created": {
      author_fids: allWatchedFids,
    },
  };

  // Check if unified webhook already exists (by type or by specific webhook ID)
  // First check for existing webhook by type
  let existingWebhook = await db
    .select()
    .from(webhooks)
    .where(eq(webhooks.type, "user-watch"))
    .limit(1);
  
  // If no webhook found by type, check if we have a specific webhook ID to use
  const SPECIFIC_WEBHOOK_ID = "01K9ZAVSDN1XWTT90B6PMR0T18";
  if (existingWebhook.length === 0) {
    // Try to find webhook by the specific ID
    const specificWebhook = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.neynarWebhookId, SPECIFIC_WEBHOOK_ID))
      .limit(1);
    
    if (specificWebhook.length > 0) {
      console.log(`[Webhook] Found existing webhook with ID ${SPECIFIC_WEBHOOK_ID}, will update it`);
      existingWebhook = specificWebhook;
      // Update the type to user-watch if it's not already
      if (specificWebhook[0].type !== "user-watch") {
        await db
          .update(webhooks)
          .set({ type: "user-watch" })
          .where(eq(webhooks.id, specificWebhook[0].id));
      }
    } else {
      // Try to use the webhook ID directly (it might exist in Neynar but not in our DB)
      console.log(`[Webhook] Attempting to use existing webhook ID ${SPECIFIC_WEBHOOK_ID} from Neynar`);
      try {
        // Try to update it - if it exists in Neynar, this will work
        const testUpdate = await neynarClient.updateWebhook({
          webhookId: SPECIFIC_WEBHOOK_ID,
          name: webhookName,
          url: webhookUrl,
          subscription,
        });
        console.log(`[Webhook] Successfully updated existing Neynar webhook ${SPECIFIC_WEBHOOK_ID}`);
        
        // Create database record for it
        const webhookData = (testUpdate as any).webhook || testUpdate;
        const secrets = webhookData?.secrets || [];
        let secret = null;
        if (secrets.length > 0) {
          const secretObj = secrets[0];
          secret = secretObj?.value || secretObj?.secret || (typeof secretObj === 'string' ? secretObj : null);
        }
        
        await db.insert(webhooks).values({
          neynarWebhookId: SPECIFIC_WEBHOOK_ID,
          type: "user-watch",
          config: { watchedFids: allWatchedFids },
          url: webhookUrl,
          secret,
        });
        
        console.log(`[Webhook] Created database record for existing Neynar webhook ${SPECIFIC_WEBHOOK_ID}`);
        return { neynarWebhookId: SPECIFIC_WEBHOOK_ID, webhookResult: testUpdate };
      } catch (error: any) {
        // Webhook doesn't exist in Neynar, will create new one below
        console.log(`[Webhook] Webhook ${SPECIFIC_WEBHOOK_ID} not found in Neynar, will create new one`);
      }
    }
  }

  console.log(`[Webhook] Subscription structure:`, JSON.stringify({
    subscription: subscription,
  }, null, 2));

  let neynarWebhookId: string | undefined;
  let webhookResult: any = null;

  if (existingWebhook.length > 0) {
    // Update existing webhook with all current watched FIDs
    const existing = existingWebhook[0];
    console.log(`[Webhook] Updating existing unified watch webhook ${existing.neynarWebhookId}`);
    
    // If the existing webhook has a localhost URL, delete it and recreate
    if (existing.url?.includes("localhost") || existing.url?.includes("127.0.0.1")) {
      console.log(`[Webhook] Existing webhook has localhost URL, deleting and recreating...`);
      try {
        await neynarClient.deleteWebhook({ webhookId: existing.neynarWebhookId });
      } catch (deleteError: any) {
        console.error(`[Webhook] Error deleting old webhook:`, deleteError);
      }
      // Fall through to create new webhook
    } else {
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
            config: { watchedFids: allWatchedFids },
            url: webhookUrl,
            secret: secret || existing.secret,
            updatedAt: new Date(),
          })
          .where(eq(webhooks.id, existing.id));
        
        console.log(`[Webhook] Updated unified watch webhook with ${allWatchedFids.length} watched FIDs`);
      } catch (error: any) {
        console.error("Error updating unified user watch webhook:", error);
        console.error("Error details:", {
          message: error?.message,
          response: error?.response?.data,
          status: error?.response?.status,
          webhookId: existing.neynarWebhookId,
          subscription,
          watchedFidsCount: allWatchedFids.length,
          sampleFids: allWatchedFids.slice(0, 10),
        });
        
        // If webhook not found, delete and recreate
        if (error?.response?.data?.code === "InvalidField" || error?.response?.data?.message?.includes("not found")) {
          console.log(`[Webhook] Webhook not found, deleting and recreating...`);
          try {
            await neynarClient.deleteWebhook({ webhookId: existing.neynarWebhookId });
          } catch (deleteError: any) {
            console.error(`[Webhook] Error deleting invalid webhook:`, deleteError);
          }
          // Fall through to create new webhook - set webhookResult to null
          webhookResult = null;
        } else {
          throw error;
        }
      }
    }
  }
  
  // Create new webhook (either first time or after deleting invalid one)
  if (!webhookResult) {
    // Create new unified webhook
    try {
      console.log(`[Webhook] Creating new unified watch webhook...`);
      webhookResult = await neynarClient.publishWebhook({
        name: webhookName,
        url: webhookUrl,
        subscription,
      });
      neynarWebhookId = (webhookResult.webhook as any).webhook_id || (webhookResult as any).webhook_id;

      if (!neynarWebhookId) {
        throw new Error("Failed to get webhook ID from Neynar response");
      }

      const webhookData = (webhookResult as any).webhook || webhookResult;
      const secrets = webhookData?.secrets || [];
      let secret = null;
      if (secrets.length > 0) {
        const secretObj = secrets[0];
        secret = secretObj?.value || secretObj?.secret || (typeof secretObj === 'string' ? secretObj : null);
      }

      await db.insert(webhooks).values({
        neynarWebhookId,
        type: "user-watch",
        config: { watchedFids: allWatchedFids },
        url: webhookUrl,
        secret,
      });
      
      console.log(`[Webhook] Created unified watch webhook with ${allWatchedFids.length} watched FIDs`);
    } catch (error: any) {
      console.error("Error creating unified user watch webhook:", error);
      console.error("Error details:", {
        message: error?.message,
        response: error?.response?.data,
        status: error?.response?.status,
        subscription,
        watchedFidsCount: allWatchedFids.length,
        sampleFids: allWatchedFids.slice(0, 10),
      });
      throw error;
    }
  }

  if (!neynarWebhookId) {
    throw new Error("Webhook ID is required but was not set");
  }
  
  return { neynarWebhookId, webhookResult };
}

/**
 * Refresh unified user watch webhook with current watched FIDs
 */
export async function refreshUnifiedUserWatchWebhook() {
  try {
    await createUnifiedUserWatchWebhook();
    console.log("[Webhook] Successfully refreshed unified user watch webhook");
  } catch (error: any) {
    console.error("[Webhook] Error refreshing unified user watch webhook:", error);
    throw error;
  }
}

