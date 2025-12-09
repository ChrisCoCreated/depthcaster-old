/**
 * Script to rescore all quote cast replies using the updated scoring logic
 * 
 * This script rescores all quote casts to apply the new logic that differentiates:
 * - Quote casts quoting the parent (only additional text is scored)
 * - Quote casts quoting a different cast (scored as adding to conversation)
 * 
 * Usage:
 *   npx tsx scripts/rescore-quote-casts.ts
 */

import { config } from "dotenv";
import { resolve } from "path";

// Load environment variables from .env.local or .env
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { castReplies } from "../lib/schema";
import { eq } from "drizzle-orm";
import { analyzeBatch } from "../lib/deepseek-quality";

/**
 * Rescore all quote cast replies
 */
async function rescoreQuoteCasts() {
  console.log("Starting quality rescore for quote casts...\n");

  try {
    // Get all quote cast replies
    const quoteCastsToRescore = await db
      .select({
        replyCastHash: castReplies.replyCastHash,
        castData: castReplies.castData,
      })
      .from(castReplies)
      .where(eq(castReplies.isQuoteCast, true));

    console.log(`Found ${quoteCastsToRescore.length} quote cast(s) to rescore\n`);

    if (quoteCastsToRescore.length === 0) {
      console.log("No quote casts to rescore. Exiting.");
      return { processed: 0, failed: 0 };
    }

    // Process in batches
    const result = await analyzeBatch(
      quoteCastsToRescore.map((quoteCast) => ({
        castHash: quoteCast.replyCastHash,
        castData: quoteCast.castData,
      })),
      async (replyCastHash, analysisResult) => {
        await db
          .update(castReplies)
          .set({
            qualityScore: analysisResult.qualityScore,
            category: analysisResult.category,
            qualityAnalyzedAt: new Date(),
          })
          .where(eq(castReplies.replyCastHash, replyCastHash));
      },
      {
        batchSize: 5,
        delayBetweenBatches: 1000, // 1 second delay between batches
      }
    );

    console.log("\n" + "=".repeat(60));
    console.log("QUOTE CASTS RESCORE SUMMARY");
    console.log("=".repeat(60));
    console.log(`Total quote casts to rescore: ${quoteCastsToRescore.length}`);
    console.log(`Successfully processed: ${result.processed}`);
    console.log(`Failed: ${result.failed}`);
    console.log("\nRescore complete!");

    return result;
  } catch (error: any) {
    console.error("Fatal error rescoring quote casts:", error);
    throw error;
  }
}

// Run the rescore
rescoreQuoteCasts()
  .then(() => {
    console.log("\nScript finished successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nScript failed:", error);
    process.exit(1);
  });









