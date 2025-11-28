/**
 * Batch script to analyze quality and categorize existing casts and replies using DeepSeek
 * 
 * Usage:
 *   - Analyze all: npx tsx scripts/analyze-casts-quality.ts
 *   - Analyze only curated casts: npx tsx scripts/analyze-casts-quality.ts casts
 *   - Analyze only replies: npx tsx scripts/analyze-casts-quality.ts replies
 */

import { config } from "dotenv";
import { resolve } from "path";

// Load environment variables from .env.local or .env
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { curatedCasts, castReplies } from "../lib/schema";
import { isNull, eq } from "drizzle-orm";
import { analyzeBatch } from "../lib/deepseek-quality";

/**
 * Analyze quality for curated casts
 */
async function analyzeCuratedCasts() {
  console.log("Starting quality analysis for curated casts...\n");

  try {
    // Get all curated casts without quality scores
    const castsToAnalyze = await db
      .select({
        castHash: curatedCasts.castHash,
        castData: curatedCasts.castData,
      })
      .from(curatedCasts)
      .where(isNull(curatedCasts.qualityScore));

    console.log(`Found ${castsToAnalyze.length} curated cast(s) without quality scores\n`);

    if (castsToAnalyze.length === 0) {
      console.log("No casts to analyze. Exiting.");
      return { processed: 0, failed: 0 };
    }

    // Process in batches
    const result = await analyzeBatch(
      castsToAnalyze.map((cast) => ({
        castHash: cast.castHash,
        castData: cast.castData,
      })),
      async (castHash, analysisResult) => {
        await db
          .update(curatedCasts)
          .set({
            qualityScore: analysisResult.qualityScore,
            category: analysisResult.category,
            qualityAnalyzedAt: new Date(),
          })
          .where(eq(curatedCasts.castHash, castHash));
      },
      {
        batchSize: 5,
        delayBetweenBatches: 1000, // 1 second delay between batches
      }
    );

    console.log("\n" + "=".repeat(60));
    console.log("CURATED CASTS ANALYSIS SUMMARY");
    console.log("=".repeat(60));
    console.log(`Total casts to analyze: ${castsToAnalyze.length}`);
    console.log(`Successfully processed: ${result.processed}`);
    console.log(`Failed: ${result.failed}`);
    console.log("\nAnalysis complete!");

    return result;
  } catch (error: any) {
    console.error("Fatal error analyzing curated casts:", error);
    throw error;
  }
}

/**
 * Analyze quality for cast replies
 */
async function analyzeCastReplies() {
  console.log("Starting quality analysis for cast replies...\n");

  try {
    // Get all replies without quality scores
    const repliesToAnalyze = await db
      .select({
        replyCastHash: castReplies.replyCastHash,
        castData: castReplies.castData,
      })
      .from(castReplies)
      .where(isNull(castReplies.qualityScore));

    console.log(`Found ${repliesToAnalyze.length} reply/reply(ies) without quality scores\n`);

    if (repliesToAnalyze.length === 0) {
      console.log("No replies to analyze. Exiting.");
      return { processed: 0, failed: 0 };
    }

    // Process in batches
    const result = await analyzeBatch(
      repliesToAnalyze.map((reply) => ({
        castHash: reply.replyCastHash,
        castData: reply.castData,
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
    console.log("CAST REPLIES ANALYSIS SUMMARY");
    console.log("=".repeat(60));
    console.log(`Total replies to analyze: ${repliesToAnalyze.length}`);
    console.log(`Successfully processed: ${result.processed}`);
    console.log(`Failed: ${result.failed}`);
    console.log("\nAnalysis complete!");

    return result;
  } catch (error: any) {
    console.error("Fatal error analyzing cast replies:", error);
    throw error;
  }
}

/**
 * Main function to analyze both casts and replies
 */
async function analyzeAll() {
  console.log("Starting quality analysis for all casts and replies...\n");

  const castsResult = await analyzeCuratedCasts();
  console.log("\n");
  const repliesResult = await analyzeCastReplies();

  console.log("\n" + "=".repeat(60));
  console.log("OVERALL ANALYSIS SUMMARY");
  console.log("=".repeat(60));
  console.log(`Curated casts processed: ${castsResult.processed}`);
  console.log(`Curated casts failed: ${castsResult.failed}`);
  console.log(`Replies processed: ${repliesResult.processed}`);
  console.log(`Replies failed: ${repliesResult.failed}`);
  console.log(`Total processed: ${castsResult.processed + repliesResult.processed}`);
  console.log(`Total failed: ${castsResult.failed + repliesResult.failed}`);
  console.log("\nAll analysis complete!");
}

// Check command line arguments to determine what to analyze
const args = process.argv.slice(2);
const command = args[0] || "all";

if (command === "casts" || command === "curated") {
  // Analyze only curated casts
  analyzeCuratedCasts()
    .then(() => {
      console.log("\nScript finished successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\nScript failed:", error);
      process.exit(1);
    });
} else if (command === "replies") {
  // Analyze only replies
  analyzeCastReplies()
    .then(() => {
      console.log("\nScript finished successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\nScript failed:", error);
      process.exit(1);
    });
} else {
  // Analyze both (default)
  analyzeAll()
    .then(() => {
      console.log("\nScript finished successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\nScript failed:", error);
      process.exit(1);
    });
}
