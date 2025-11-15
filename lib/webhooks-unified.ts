import { neynarClient } from "./neynar";
import { db } from "./db";
import { webhooks, curatedCasts } from "./schema";
import { eq } from "drizzle-orm";
import { MIN_USER_SCORE_THRESHOLD } from "./cast-quality";

/**
 * Convert cast hash to Neynar root parent URL format
 * Neynar uses chain://eip155:1/erc721:{hash} format for root_parent_urls
 */
function castHashToRootParentUrl(castHash: string): string {
  return `chain://eip155:1/erc721:${castHash}`;
}

/**
 * Get all curated cast hashes
 */
async function getAllCuratedCastHashes(): Promise<string[]> {
  const casts = await db
    .select({ castHash: curatedCasts.castHash })
    .from(curatedCasts);
  return casts.map(c => c.castHash);
}

/**
 * Create or update unified webhook for replies to all curated casts
 * Uses a single webhook with multiple root_parent_urls filters
 */
export async function createUnifiedCuratedReplyWebhook() {
  // Ensure we use production URL, not localhost
  // Force production URL for webhooks - localhost won't work
  const baseUrl = process.env.WEBHOOK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://depthcaster.vercel.app";
  const webhookUrl = `${baseUrl}/api/webhooks`;
  const webhookName = "curated-replies-unified";
  
  // Validate URL is not localhost
  if (webhookUrl.includes("localhost") || webhookUrl.includes("127.0.0.1")) {
    throw new Error(`Invalid webhook URL: ${webhookUrl}. Webhooks must use a public URL. Set WEBHOOK_BASE_URL or NEXT_PUBLIC_APP_URL environment variable.`);
  }
  
  console.log(`[Webhook] Using webhook URL: ${webhookUrl}`);

  // Get all curated cast hashes
  const allCuratedHashes = await getAllCuratedCastHashes();
  
  if (allCuratedHashes.length === 0) {
    console.log("[Webhook] No curated casts found, skipping webhook creation");
    return null;
  }

  // Convert all cast hashes to root parent URLs
  const rootParentUrls = allCuratedHashes.map(castHashToRootParentUrl);

  console.log(`[Webhook] Building subscription with ${rootParentUrls.length} root_parent_urls`);
  console.log(`[Webhook] Sample URLs:`, rootParentUrls.slice(0, 3));

  // Check if unified webhook already exists
  const existingWebhook = await db
    .select()
    .from(webhooks)
    .where(eq(webhooks.type, "curated-reply"))
    .limit(1);

  const subscription = {
    "cast.created": {
      root_parent_urls: rootParentUrls,
      author_score_min: MIN_USER_SCORE_THRESHOLD,
    },
  };

  console.log(`[Webhook] Subscription structure:`, JSON.stringify({
    subscription: subscription,
  }, null, 2));

  let neynarWebhookId: string | undefined;
  let webhookResult: any = null;

  if (existingWebhook.length > 0) {
    // Update existing webhook with all current curated casts
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
          config: { curatedCastHashes: allCuratedHashes },
          url: webhookUrl,
          secret: secret || existing.secret,
          updatedAt: new Date(),
        })
        .where(eq(webhooks.id, existing.id));
      
      console.log(`[Webhook] Updated unified reply webhook with ${allCuratedHashes.length} curated casts`);
    } catch (error: any) {
      console.error("Error updating unified curated reply webhook:", error);
      console.error("Error details:", {
        message: error?.message,
        response: error?.response?.data,
        status: error?.response?.status,
        webhookId: existing.neynarWebhookId,
        subscription,
        rootParentUrlsCount: rootParentUrls.length,
        sampleUrls: rootParentUrls.slice(0, 3),
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
  
  // Create new webhook (either first time or after deleting invalid one)
  if (!webhookResult) {
    // Create new unified webhook
    try {
      console.log(`[Webhook] Creating new reply webhook...`);
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
        type: "curated-reply",
        config: { curatedCastHashes: allCuratedHashes },
        url: webhookUrl,
        secret,
      });
      
      console.log(`[Webhook] Created unified reply webhook with ${allCuratedHashes.length} curated casts`);
    } catch (error: any) {
      console.error("Error creating unified curated reply webhook:", error);
      console.error("Error details:", {
        message: error?.message,
        response: error?.response?.data,
        status: error?.response?.status,
        subscription,
        rootParentUrlsCount: rootParentUrls.length,
        sampleUrls: rootParentUrls.slice(0, 3),
      });
      throw error;
    }
  }

  return { neynarWebhookId, webhookResult };
}

/**
 * Create or update unified webhook for quote casts that quote any curated cast
 * Uses a single webhook with multiple embedded_cast_hashes filters
 */
export async function createUnifiedCuratedQuoteWebhook() {
  // Ensure we use production URL, not localhost
  // Force production URL for webhooks - localhost won't work
  const baseUrl = process.env.WEBHOOK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://depthcaster.vercel.app";
  const webhookUrl = `${baseUrl}/api/webhooks`;
  const webhookName = "curated-quotes-unified";
  
  // Validate URL is not localhost
  if (webhookUrl.includes("localhost") || webhookUrl.includes("127.0.0.1")) {
    throw new Error(`Invalid webhook URL: ${webhookUrl}. Webhooks must use a public URL. Set WEBHOOK_BASE_URL or NEXT_PUBLIC_APP_URL environment variable.`);
  }
  
  console.log(`[Webhook] Using webhook URL: ${webhookUrl}`);

  // Get all curated cast hashes
  const allCuratedHashes = await getAllCuratedCastHashes();
  
  if (allCuratedHashes.length === 0) {
    console.log("[Webhook] No curated casts found, skipping webhook creation");
    return null;
  }

  console.log(`[Webhook] Building quote subscription with ${allCuratedHashes.length} embedded_cast_hashes`);
  console.log(`[Webhook] Sample hashes:`, allCuratedHashes.slice(0, 3));

  // Check if unified webhook already exists
  const existingWebhook = await db
    .select()
    .from(webhooks)
    .where(eq(webhooks.type, "curated-quote"))
    .limit(1);

  const subscription = {
    "cast.created": {
      embedded_cast_hashes: allCuratedHashes,
      author_score_min: MIN_USER_SCORE_THRESHOLD,
    },
  };

  console.log(`[Webhook] Quote subscription structure:`, JSON.stringify({
    subscription: subscription,
  }, null, 2));

  let neynarWebhookId: string | undefined;
  let webhookResult: any = null;

  if (existingWebhook.length > 0) {
    // Update existing webhook with all current curated casts
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
          config: { curatedCastHashes: allCuratedHashes },
          url: webhookUrl,
          secret: secret || existing.secret,
          updatedAt: new Date(),
        })
        .where(eq(webhooks.id, existing.id));
      
      console.log(`[Webhook] Updated unified quote webhook with ${allCuratedHashes.length} curated casts`);
    } catch (error: any) {
      console.error("Error updating unified curated quote webhook:", error);
      console.error("Error details:", {
        message: error?.message,
        response: error?.response?.data,
        status: error?.response?.status,
        webhookId: existing.neynarWebhookId,
        subscription,
        hashesCount: allCuratedHashes.length,
        sampleHashes: allCuratedHashes.slice(0, 3),
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
  
  // Create new webhook (either first time or after deleting invalid one)
  if (!webhookResult) {
    // Create new unified webhook
    try {
      console.log(`[Webhook] Creating new quote webhook...`);
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
        type: "curated-quote",
        config: { curatedCastHashes: allCuratedHashes },
        url: webhookUrl,
        secret,
      });
      
      console.log(`[Webhook] Created unified quote webhook with ${allCuratedHashes.length} curated casts`);
    } catch (error: any) {
      console.error("Error creating unified curated quote webhook:", error);
      throw error;
    }
  }

  return { neynarWebhookId, webhookResult };
}

/**
 * Refresh both unified webhooks with current curated casts
 */
export async function refreshUnifiedCuratedWebhooks() {
  try {
    await createUnifiedCuratedReplyWebhook();
    await createUnifiedCuratedQuoteWebhook();
    console.log("[Webhook] Successfully refreshed unified curated webhooks");
  } catch (error: any) {
    console.error("[Webhook] Error refreshing unified curated webhooks:", error);
    throw error;
  }
}

