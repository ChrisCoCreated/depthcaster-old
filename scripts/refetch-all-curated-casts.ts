/**
 * One-time script to simulate re-curation of all currently curated casts
 * This will refetch cast data and conversations to update reaction counts and replies
 * 
 * Usage:
 *   - Full refetch (default): npx tsx scripts/refetch-all-curated-casts.ts
 *   - Webhooks only: npx tsx scripts/refetch-all-curated-casts.ts webhooks
 */

import { config } from "dotenv";
import { resolve } from "path";

// Load environment variables from .env.local or .env
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { curatedCasts } from "../lib/schema";
import { eq } from "drizzle-orm";
import { neynarClient } from "../lib/neynar";
import { LookupCastConversationTypeEnum } from "@neynar/nodejs-sdk/build/api";
import { fetchAndStoreConversation } from "../lib/conversation";
import { refreshUnifiedCuratedWebhooks } from "../lib/webhooks-unified";

/**
 * Create/update webhooks for all curated casts
 */
async function createWebhooksForAllCuratedCasts() {
  console.log("Starting webhook creation for all curated casts...\n");

  try {
    // Get all curated casts
    const allCuratedCasts = await db
      .select({
        castHash: curatedCasts.castHash,
      })
      .from(curatedCasts);

    console.log(`Found ${allCuratedCasts.length} curated cast(s)\n`);

    if (allCuratedCasts.length === 0) {
      console.log("No curated casts found. Exiting.");
      return;
    }

    // Create unified webhooks for all curated casts
    console.log("Creating unified webhooks for all curated casts...\n");
    
    try {
      await refreshUnifiedCuratedWebhooks();
      console.log("✓ Successfully created/updated unified webhooks\n");
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      const statusCode = error?.response?.status || error?.status || "unknown";
      console.error(`✗ Error creating unified webhooks: ${errorMessage} (status: ${statusCode})\n`);
      throw error;
    }

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("WEBHOOK CREATION SUMMARY");
    console.log("=".repeat(60));
    console.log(`Total curated casts: ${allCuratedCasts.length}`);
    console.log(`Unified webhooks created/updated: 2 (replies + quotes)`);
    console.log("\nWebhook creation complete!");
  } catch (error: any) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

async function refetchAllCuratedCasts() {
  console.log("Starting refetch of all curated casts...\n");

  // Special placeholder hash for parent casts - skip this
  const PARENT_CAST_PLACEHOLDER_HASH = "0x0000000000000000000000000000000000000000";

  try {
    // Get all curated casts
    const allCuratedCasts = await db
      .select({
        castHash: curatedCasts.castHash,
        createdAt: curatedCasts.createdAt,
      })
      .from(curatedCasts);

    // Filter out the placeholder hash
    const castsToRefetch = allCuratedCasts.filter(
      (cast) => cast.castHash.toLowerCase() !== PARENT_CAST_PLACEHOLDER_HASH.toLowerCase()
    );

    console.log(`Found ${allCuratedCasts.length} curated cast(s) total`);
    console.log(`Skipping ${allCuratedCasts.length - castsToRefetch.length} placeholder cast(s)`);
    console.log(`Refetching ${castsToRefetch.length} cast(s)\n`);

    if (castsToRefetch.length === 0) {
      console.log("No curated casts to refetch. Exiting.");
      return;
    }

    let successCount = 0;
    let errorCount = 0;
    const errors: Array<{ castHash: string; error: string }> = [];

    // Process each cast
    for (let i = 0; i < castsToRefetch.length; i++) {
      const curatedCast = castsToRefetch[i];
      const castHash = curatedCast.castHash;
      
      console.log(`[${i + 1}/${castsToRefetch.length}] Processing cast ${castHash}...`);

      try {
        // Step 1: Refetch cast data to update reaction counts
        console.log(`  → Refetching cast data...`);
        const conversation = await neynarClient.lookupCastConversation({
          identifier: castHash,
          type: LookupCastConversationTypeEnum.Hash,
          replyDepth: 0,
          includeChronologicalParentCasts: false,
        });

        const updatedCastData = conversation.conversation?.cast;
        if (!updatedCastData) {
          throw new Error("Cast not found in Neynar API");
        }

        // Update cast data in database
        await db
          .update(curatedCasts)
          .set({
            castData: updatedCastData,
          })
          .where(eq(curatedCasts.castHash, castHash));

        console.log(`  ✓ Updated cast data`);

        // Step 2: Refetch conversation (replies and quotes)
        console.log(`  → Refetching conversation...`);
        const result = await fetchAndStoreConversation(castHash, 5, 50);
        
        // Update conversationFetchedAt timestamp
        await db
          .update(curatedCasts)
          .set({
            conversationFetchedAt: new Date(),
          })
          .where(eq(curatedCasts.castHash, castHash));

        console.log(`  ✓ Refetched conversation (stored: ${result.stored}, total: ${result.total})`);
        console.log(`  ✓ Successfully refetched cast ${castHash}\n`);

        successCount++;
      } catch (error: any) {
        const errorMessage = error?.message || String(error);
        console.error(`  ✗ Error processing cast ${castHash}: ${errorMessage}\n`);
        errors.push({ castHash, error: errorMessage });
        errorCount++;
      }

      // Add a small delay to avoid rate limiting
      if (i < castsToRefetch.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("REFETCH SUMMARY");
    console.log("=".repeat(60));
    console.log(`Total casts: ${allCuratedCasts.length}`);
    console.log(`Placeholder casts skipped: ${allCuratedCasts.length - castsToRefetch.length}`);
    console.log(`Casts processed: ${castsToRefetch.length}`);
    console.log(`Successful: ${successCount}`);
    console.log(`Errors: ${errorCount}`);

    if (errors.length > 0) {
      console.log("\nErrors:");
      errors.forEach(({ castHash, error }) => {
        console.log(`  - ${castHash}: ${error}`);
      });
    }

    console.log("\nRefetch complete!");
  } catch (error: any) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

// Check command line arguments to determine which function to run
const args = process.argv.slice(2);
const command = args[0] || "refetch";

if (command === "webhooks" || command === "create-webhooks") {
  // Run only webhook creation
  createWebhooksForAllCuratedCasts()
    .then(() => {
      console.log("\nScript finished successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\nScript failed:", error);
      process.exit(1);
    });
} else {
  // Run full refetch (default)
  refetchAllCuratedCasts()
    .then(() => {
      console.log("\nScript finished successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\nScript failed:", error);
      process.exit(1);
    });
}

