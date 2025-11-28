import { neynarClient } from "./neynar";
import { db } from "./db";
import { webhooks, curatedCasts, castReplies } from "./schema";
import { eq, inArray } from "drizzle-orm";
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
 * Uses a single webhook with multiple parent_hashes filters
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

  // Include quote casts so we can capture replies to their threads as well
  const quoteCastRows = await db
    .select({ replyCastHash: castReplies.replyCastHash })
    .from(castReplies)
    .where(eq(castReplies.isQuoteCast, true));

  const quoteConversationHashes = Array.from(
    new Set(
      quoteCastRows
        .map((row) => row.replyCastHash)
        .filter((hash): hash is string => Boolean(hash))
    )
  );

  // Get all existing reply hashes from the database to include in the webhook
  const existingReplyRows = await db
    .select({ replyCastHash: castReplies.replyCastHash })
    .from(castReplies)
    .where(eq(castReplies.isQuoteCast, false));

  const existingReplyHashes = Array.from(
    new Set(
      existingReplyRows
        .map((row) => row.replyCastHash)
        .filter((hash): hash is string => Boolean(hash))
    )
  );

  // Combine all parent hashes (curated casts + quote casts + existing replies)
  const parentHashes = Array.from(
    new Set([
      ...allCuratedHashes,
      ...quoteConversationHashes,
      ...existingReplyHashes,
    ])
  );

  console.log(
    `[Webhook] Building subscription with ${parentHashes.length} parent_hashes (${allCuratedHashes.length} curated, ${quoteConversationHashes.length} quote roots, ${existingReplyHashes.length} existing replies)`
  );
  console.log(`[Webhook] Sample hashes:`, parentHashes.slice(0, 3));

  // Check if unified webhook already exists
  const existingWebhook = await db
    .select()
    .from(webhooks)
    .where(eq(webhooks.type, "curated-reply"))
    .limit(1);

  const subscription = {
    "cast.created": {
      parent_hashes: parentHashes,
      author_score_min: MIN_USER_SCORE_THRESHOLD,
    },
  };

  const configPayload = {
    curatedCastHashes: allCuratedHashes,
    quoteConversationHashes,
    replyHashes: existingReplyHashes,
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
          config: configPayload,
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
        parentHashesCount: parentHashes.length,
        sampleHashes: parentHashes.slice(0, 3),
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
        config: configPayload,
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
        parentHashesCount: parentHashes.length,
        sampleHashes: parentHashes.slice(0, 3),
      });
      throw error;
    }
  }

  return { neynarWebhookId, webhookResult };
}

/**
 * Append a new quote cast hash to the unified reply webhook without rebuilding the entire subscription.
 */
export async function addQuoteCastToUnifiedReplyWebhook(quoteCastHash: string) {
  if (!quoteCastHash) {
    return null;
  }

  const baseUrl =
    process.env.WEBHOOK_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://depthcaster.vercel.app";
  const webhookUrl = `${baseUrl}/api/webhooks`;

  const existingWebhook = await db
    .select()
    .from(webhooks)
    .where(eq(webhooks.type, "curated-reply"))
    .limit(1);

  if (existingWebhook.length === 0) {
    console.log(
      "[Webhook] Unified reply webhook missing; rebuilding before adding quote cast"
    );
    await createUnifiedCuratedReplyWebhook();
    return;
  }

  const existing = existingWebhook[0];
  const existingConfig = (existing.config as any) || {};
  let curatedCastHashes: string[] = Array.isArray(existingConfig.curatedCastHashes)
    ? existingConfig.curatedCastHashes
    : [];
  let quoteConversationHashes: string[] = Array.isArray(
    existingConfig.quoteConversationHashes
  )
    ? existingConfig.quoteConversationHashes
    : [];
  let replyHashes: string[] = Array.isArray(existingConfig.replyHashes)
    ? existingConfig.replyHashes
    : [];

  // If curated casts are missing from config, fetch them to avoid stripping filters
  if (curatedCastHashes.length === 0) {
    curatedCastHashes = await getAllCuratedCastHashes();
  }

  if (quoteConversationHashes.includes(quoteCastHash)) {
    console.log(
      `[Webhook] Quote cast ${quoteCastHash} already tracked by unified reply webhook`
    );
    return;
  }

  quoteConversationHashes = [...quoteConversationHashes, quoteCastHash];

  // Combine all parent hashes (curated casts + quote casts + replies)
  const parentHashes = Array.from(
    new Set([
      ...curatedCastHashes,
      ...quoteConversationHashes,
      ...replyHashes,
    ])
  );

  const subscription = {
    "cast.created": {
      parent_hashes: parentHashes,
      author_score_min: MIN_USER_SCORE_THRESHOLD,
    },
  };

  const payload = {
    curatedCastHashes,
    quoteConversationHashes,
    replyHashes,
  };

  console.log(
    `[Webhook] Adding quote cast ${quoteCastHash} to unified reply webhook (${quoteConversationHashes.length} quote roots total)`
  );

  const webhookResult = await neynarClient.updateWebhook({
    webhookId: existing.neynarWebhookId,
    name: "curated-replies-unified",
    url: webhookUrl,
    subscription,
  });

  const webhookData = (webhookResult as any).webhook || webhookResult;
  const secrets = webhookData?.secrets || [];
  let secret = null;
  if (secrets.length > 0) {
    const secretObj = secrets[0];
    secret =
      secretObj?.value ||
      secretObj?.secret ||
      (typeof secretObj === "string" ? secretObj : null);
  }

  await db
    .update(webhooks)
    .set({
      config: payload,
      url: webhookUrl,
      secret: secret || existing.secret,
      updatedAt: new Date(),
    })
    .where(eq(webhooks.id, existing.id));
}

/**
 * Append a new reply hash to the unified reply webhook so nested replies are captured.
 */
export async function addReplyToUnifiedReplyWebhook(replyCastHash: string) {
  if (!replyCastHash) {
    return null;
  }

  const baseUrl =
    process.env.WEBHOOK_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://depthcaster.vercel.app";
  const webhookUrl = `${baseUrl}/api/webhooks`;

  const existingWebhook = await db
    .select()
    .from(webhooks)
    .where(eq(webhooks.type, "curated-reply"))
    .limit(1);

  if (existingWebhook.length === 0) {
    console.log(
      "[Webhook] Unified reply webhook missing; rebuilding before adding reply"
    );
    await createUnifiedCuratedReplyWebhook();
    return;
  }

  const existing = existingWebhook[0];
  const existingConfig = (existing.config as any) || {};
  let curatedCastHashes: string[] = Array.isArray(existingConfig.curatedCastHashes)
    ? existingConfig.curatedCastHashes
    : [];
  let quoteConversationHashes: string[] = Array.isArray(
    existingConfig.quoteConversationHashes
  )
    ? existingConfig.quoteConversationHashes
    : [];
  let replyHashes: string[] = Array.isArray(existingConfig.replyHashes)
    ? existingConfig.replyHashes
    : [];

  // If curated casts are missing from config, fetch them to avoid stripping filters
  if (curatedCastHashes.length === 0) {
    curatedCastHashes = await getAllCuratedCastHashes();
  }

  if (replyHashes.includes(replyCastHash)) {
    console.log(
      `[Webhook] Reply ${replyCastHash} already tracked by unified reply webhook`
    );
    return;
  }

  replyHashes = [...replyHashes, replyCastHash];

  // Combine all parent hashes (curated casts + quote casts + replies)
  const parentHashes = Array.from(
    new Set([
      ...curatedCastHashes,
      ...quoteConversationHashes,
      ...replyHashes,
    ])
  );

  const subscription = {
    "cast.created": {
      parent_hashes: parentHashes,
      author_score_min: MIN_USER_SCORE_THRESHOLD,
    },
  };

  const payload = {
    curatedCastHashes,
    quoteConversationHashes,
    replyHashes,
  };

  console.log(
    `[Webhook] Adding reply ${replyCastHash} to unified reply webhook (${replyHashes.length} replies total)`
  );

  const webhookResult = await neynarClient.updateWebhook({
    webhookId: existing.neynarWebhookId,
    name: "curated-replies-unified",
    url: webhookUrl,
    subscription,
  });

  const webhookData = (webhookResult as any).webhook || webhookResult;
  const secrets = webhookData?.secrets || [];
  let secret = null;
  if (secrets.length > 0) {
    const secretObj = secrets[0];
    secret =
      secretObj?.value ||
      secretObj?.secret ||
      (typeof secretObj === "string" ? secretObj : null);
  }

  await db
    .update(webhooks)
    .set({
      config: payload,
      url: webhookUrl,
      secret: secret || existing.secret,
      updatedAt: new Date(),
    })
    .where(eq(webhooks.id, existing.id));
}

/**
 * Remove a reply hash from the unified reply webhook.
 * Also removes any child replies that were replies to this reply.
 */
export async function removeReplyFromUnifiedReplyWebhook(replyCastHash: string) {
  if (!replyCastHash) {
    return null;
  }

  const baseUrl =
    process.env.WEBHOOK_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://depthcaster.vercel.app";
  const webhookUrl = `${baseUrl}/api/webhooks`;

  const existingWebhook = await db
    .select()
    .from(webhooks)
    .where(eq(webhooks.type, "curated-reply"))
    .limit(1);

  if (existingWebhook.length === 0) {
    console.log(
      "[Webhook] Unified reply webhook missing; nothing to remove"
    );
    return;
  }

  const existing = existingWebhook[0];
  const existingConfig = (existing.config as any) || {};
  let curatedCastHashes: string[] = Array.isArray(existingConfig.curatedCastHashes)
    ? existingConfig.curatedCastHashes
    : [];
  let quoteConversationHashes: string[] = Array.isArray(
    existingConfig.quoteConversationHashes
  )
    ? existingConfig.quoteConversationHashes
    : [];
  let replyHashes: string[] = Array.isArray(existingConfig.replyHashes)
    ? existingConfig.replyHashes
    : [];

  // If curated casts are missing from config, fetch them to avoid stripping filters
  if (curatedCastHashes.length === 0) {
    curatedCastHashes = await getAllCuratedCastHashes();
  }

  // Recursively find all descendant replies (children, grandchildren, etc.)
  const allDescendantHashes = new Set<string>([replyCastHash]);
  let currentLevelHashes = [replyCastHash];
  
  // Traverse the reply tree level by level until no more children are found
  while (currentLevelHashes.length > 0) {
    const childReplies = await db
      .select({ replyCastHash: castReplies.replyCastHash })
      .from(castReplies)
      .where(inArray(castReplies.parentCastHash, currentLevelHashes));

    const childHashes = childReplies
      .map((row) => row.replyCastHash)
      .filter((hash): hash is string => Boolean(hash) && !allDescendantHashes.has(hash));

    // Add new children to the set and continue to next level
    childHashes.forEach((hash) => allDescendantHashes.add(hash));
    currentLevelHashes = childHashes;
  }

  // Remove the reply and all its descendants from the webhook
  const hashesToRemoveSet = new Set(Array.from(allDescendantHashes));
  replyHashes = replyHashes.filter((hash) => !hashesToRemoveSet.has(hash));

  // Combine all parent hashes (curated casts + quote casts + remaining replies)
  const parentHashes = Array.from(
    new Set([
      ...curatedCastHashes,
      ...quoteConversationHashes,
      ...replyHashes,
    ])
  );

  const subscription = {
    "cast.created": {
      parent_hashes: parentHashes,
      author_score_min: MIN_USER_SCORE_THRESHOLD,
    },
  };

  const payload = {
    curatedCastHashes,
    quoteConversationHashes,
    replyHashes,
  };

  const descendantCount = hashesToRemoveSet.size - 1; // Exclude the reply itself
  console.log(
    `[Webhook] Removing reply ${replyCastHash} and ${descendantCount} descendant(s) from unified reply webhook (${replyHashes.length} replies remaining)`
  );

  const webhookResult = await neynarClient.updateWebhook({
    webhookId: existing.neynarWebhookId,
    name: "curated-replies-unified",
    url: webhookUrl,
    subscription,
  });

  const webhookData = (webhookResult as any).webhook || webhookResult;
  const secrets = webhookData?.secrets || [];
  let secret = null;
  if (secrets.length > 0) {
    const secretObj = secrets[0];
    secret =
      secretObj?.value ||
      secretObj?.secret ||
      (typeof secretObj === "string" ? secretObj : null);
  }

  await db
    .update(webhooks)
    .set({
      config: payload,
      url: webhookUrl,
      secret: secret || existing.secret,
      updatedAt: new Date(),
    })
    .where(eq(webhooks.id, existing.id));
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

  const configPayload = {
    curatedCastHashes: allCuratedHashes,
    type: "curated-quote",
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
          config: configPayload,
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
 * Create or update unified webhook for reactions on all curated casts
 * Uses a single webhook with multiple parent_hashes filters
 */
export async function createUnifiedCuratedReactionWebhook() {
  // Ensure we use production URL, not localhost
  // Force production URL for webhooks - localhost won't work
  const baseUrl = process.env.WEBHOOK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://depthcaster.vercel.app";
  const webhookUrl = `${baseUrl}/api/webhooks`;
  const webhookName = "curated-reactions-unified";
  
  // Validate URL is not localhost
  if (webhookUrl.includes("localhost") || webhookUrl.includes("127.0.0.1")) {
    throw new Error(`Invalid webhook URL: ${webhookUrl}. Webhooks must use a public URL. Set WEBHOOK_BASE_URL or NEXT_PUBLIC_APP_URL environment variable.`);
  }
  
  console.log(`[Webhook] Using webhook URL: ${webhookUrl}`);

  // Get all curated cast hashes
  const allCuratedHashes = await getAllCuratedCastHashes();
  
  if (allCuratedHashes.length === 0) {
    console.log("[Webhook] No curated casts found, skipping reaction webhook creation");
    return null;
  }

  // Also include all reply hashes so we can capture reactions to replies in curated threads
  const existingReplyRows = await db
    .select({ replyCastHash: castReplies.replyCastHash })
    .from(castReplies);

  const existingReplyHashes = Array.from(
    new Set(
      existingReplyRows
        .map((row) => row.replyCastHash)
        .filter((hash): hash is string => Boolean(hash))
    )
  );

  // Combine all target hashes (curated casts + replies)
  const targetHashes = Array.from(
    new Set([
      ...allCuratedHashes,
      ...existingReplyHashes,
    ])
  );

  console.log(
    `[Webhook] Building reaction subscription with ${targetHashes.length} target_hashes (${allCuratedHashes.length} curated, ${existingReplyHashes.length} replies)`
  );
  console.log(`[Webhook] Sample hashes:`, targetHashes.slice(0, 3));

  // Check if unified webhook already exists
  const existingWebhook = await db
    .select()
    .from(webhooks)
    .where(eq(webhooks.type, "curated-reaction"))
    .limit(1);

  const subscription = {
    "reaction.created": {
      target_cast_hashes: targetHashes,
    },
    "reaction.deleted": {
      target_cast_hashes: targetHashes,
    },
  };

  const configPayload = {
    curatedCastHashes: allCuratedHashes,
    replyHashes: existingReplyHashes,
  };

  console.log(`[Webhook] Reaction subscription structure:`, JSON.stringify({
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
          config: configPayload,
          url: webhookUrl,
          secret: secret || existing.secret,
          updatedAt: new Date(),
        })
        .where(eq(webhooks.id, existing.id));
      
      console.log(`[Webhook] Updated unified reaction webhook with ${allCuratedHashes.length} curated casts`);
    } catch (error: any) {
      console.error("Error updating unified curated reaction webhook:", error);
      console.error("Error details:", {
        message: error?.message,
        response: error?.response?.data,
        status: error?.response?.status,
        webhookId: existing.neynarWebhookId,
        subscription,
        targetHashesCount: targetHashes.length,
        sampleHashes: targetHashes.slice(0, 3),
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
      console.log(`[Webhook] Creating new reaction webhook...`);
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
        type: "curated-reaction",
        config: configPayload,
        url: webhookUrl,
        secret,
      });
      
      console.log(`[Webhook] Created unified reaction webhook with ${allCuratedHashes.length} curated casts`);
    } catch (error: any) {
      console.error("Error creating unified curated reaction webhook:", error);
      console.error("Error details:", {
        message: error?.message,
        response: error?.response?.data,
        status: error?.response?.status,
        subscription,
        targetHashesCount: targetHashes.length,
        sampleHashes: targetHashes.slice(0, 3),
      });
      throw error;
    }
  }

  return { neynarWebhookId, webhookResult };
}

/**
 * Refresh unified reaction webhook with current curated casts
 */
export async function refreshUnifiedCuratedReactionWebhook() {
  try {
    await createUnifiedCuratedReactionWebhook();
    console.log("[Webhook] Successfully refreshed unified reaction webhook");
  } catch (error: any) {
    console.error("[Webhook] Error refreshing unified reaction webhook:", error);
    throw error;
  }
}

/**
 * Refresh both unified webhooks with current curated casts
 */
export async function refreshUnifiedCuratedWebhooks() {
  try {
    await createUnifiedCuratedReplyWebhook();
    await createUnifiedCuratedQuoteWebhook();
    await createUnifiedCuratedReactionWebhook();
    console.log("[Webhook] Successfully refreshed unified curated webhooks");
  } catch (error: any) {
    console.error("[Webhook] Error refreshing unified curated webhooks:", error);
    throw error;
  }
}

