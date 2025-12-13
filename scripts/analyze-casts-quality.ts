/**
 * Batch script to analyze quality and categorize existing casts and replies using DeepSeek
 * 
 * Usage:
 *   - Analyze all: npx tsx scripts/analyze-casts-quality.ts
 *   - Analyze only curated casts: npx tsx scripts/analyze-casts-quality.ts casts
 *   - Analyze only replies: npx tsx scripts/analyze-casts-quality.ts replies
 *   - Reanalyze low quality (< 50): npx tsx scripts/analyze-casts-quality.ts reanalyze-low
 *   - Reanalyze low quality casts only: npx tsx scripts/analyze-casts-quality.ts reanalyze-low-casts
 *   - Reanalyze low quality replies only: npx tsx scripts/analyze-casts-quality.ts reanalyze-low-replies
 */

import { config } from "dotenv";
import { resolve } from "path";

// Load environment variables from .env.local or .env
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { curatedCasts, castReplies } from "../lib/schema";
import { isNull, eq, and, lt } from "drizzle-orm";
import { analyzeBatch } from "../lib/deepseek-quality";
import { sendPushNotificationToUser } from "../lib/pushNotifications";

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
          .where(
            and(
              eq(curatedCasts.castHash, castHash),
              isNull(curatedCasts.qualityScore) // Only update if qualityScore is still null
            )
          );
        
        // Notify cast author about quality score
        const castRecord = await db
          .select({ authorFid: curatedCasts.authorFid, castData: curatedCasts.castData })
          .from(curatedCasts)
          .where(eq(curatedCasts.castHash, castHash))
          .limit(1);
        
        if (castRecord[0]?.authorFid) {
          sendPushNotificationToUser(castRecord[0].authorFid, {
            title: "Your cast has been curated",
            body: `Quality score: ${analysisResult.qualityScore}. DM @chris if this doesn't seem right.`,
            icon: "/icon-192x192.webp",
            badge: "/icon-96x96.webp",
            data: {
              type: "cast_curated_quality",
              castHash: castHash,
              qualityScore: analysisResult.qualityScore,
              url: `/cast/${castHash}`
            },
          }).catch((error) => {
            console.error(`[Analyze] Error sending quality score notification to author ${castRecord[0].authorFid}:`, error);
          });
        }

        // Notify curators about quality score
        if (castRecord[0]?.castData) {
          try {
            const { notifyCuratorsAboutQualityScore } = await import("@/lib/notifications");
            notifyCuratorsAboutQualityScore(
              castHash,
              castRecord[0].castData,
              analysisResult.qualityScore
            ).catch((error) => {
              console.error(`[Analyze] Error notifying curators about quality score for cast ${castHash}:`, error);
            });
          } catch (error) {
            console.error(`[Analyze] Error importing or calling notifyCuratorsAboutQualityScore for cast ${castHash}:`, error);
          }
        }
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
          .where(
            and(
              eq(castReplies.replyCastHash, replyCastHash),
              isNull(castReplies.qualityScore) // Only update if qualityScore is still null
            )
          );
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
 * Reanalyze curated casts with quality score < 50
 */
async function reanalyzeLowQualityCasts() {
  console.log("Starting reanalysis for curated casts with quality score < 50...\n");

  try {
    // Get all curated casts with quality score < 50
    const castsToReanalyze = await db
      .select({
        castHash: curatedCasts.castHash,
        castData: curatedCasts.castData,
        currentScore: curatedCasts.qualityScore,
      })
      .from(curatedCasts)
      .where(lt(curatedCasts.qualityScore, 50));

    console.log(`Found ${castsToReanalyze.length} curated cast(s) with quality score < 50\n`);

    if (castsToReanalyze.length === 0) {
      console.log("No casts to reanalyze. Exiting.");
      return { processed: 0, failed: 0 };
    }

    // Process in batches
    const result = await analyzeBatch(
      castsToReanalyze.map((cast) => ({
        castHash: cast.castHash,
        castData: cast.castData,
      })),
      async (castHash, analysisResult) => {
        // Only update if qualityScore is still < 50 (safety check)
        await db
          .update(curatedCasts)
          .set({
            qualityScore: analysisResult.qualityScore,
            category: analysisResult.category,
            qualityAnalyzedAt: new Date(),
          })
          .where(
            and(
              eq(curatedCasts.castHash, castHash),
              lt(curatedCasts.qualityScore, 50) // Only update if still < 50
            )
          );
      },
      {
        batchSize: 5,
        delayBetweenBatches: 1000,
      }
    );

    console.log("\n" + "=".repeat(60));
    console.log("LOW QUALITY CASTS REANALYSIS SUMMARY");
    console.log("=".repeat(60));
    console.log(`Total casts to reanalyze: ${castsToReanalyze.length}`);
    console.log(`Successfully processed: ${result.processed}`);
    console.log(`Failed: ${result.failed}`);
    console.log("\nReanalysis complete!");

    return result;
  } catch (error: any) {
    console.error("Fatal error reanalyzing low quality casts:", error);
    throw error;
  }
}

/**
 * Reanalyze replies with quality score < 50
 */
async function reanalyzeLowQualityReplies() {
  console.log("Starting reanalysis for replies with quality score < 50...\n");

  try {
    // Get all replies with quality score < 50
    const repliesToReanalyze = await db
      .select({
        replyCastHash: castReplies.replyCastHash,
        castData: castReplies.castData,
        currentScore: castReplies.qualityScore,
      })
      .from(castReplies)
      .where(lt(castReplies.qualityScore, 50));

    console.log(`Found ${repliesToReanalyze.length} reply/reply(ies) with quality score < 50\n`);

    if (repliesToReanalyze.length === 0) {
      console.log("No replies to reanalyze. Exiting.");
      return { processed: 0, failed: 0 };
    }

    // Process in batches
    const result = await analyzeBatch(
      repliesToReanalyze.map((reply) => ({
        castHash: reply.replyCastHash,
        castData: reply.castData,
      })),
      async (replyCastHash, analysisResult) => {
        // Only update if qualityScore is still < 50 (safety check)
        await db
          .update(castReplies)
          .set({
            qualityScore: analysisResult.qualityScore,
            category: analysisResult.category,
            qualityAnalyzedAt: new Date(),
          })
          .where(
            and(
              eq(castReplies.replyCastHash, replyCastHash),
              lt(castReplies.qualityScore, 50) // Only update if still < 50
            )
          );
      },
      {
        batchSize: 5,
        delayBetweenBatches: 1000,
      }
    );

    console.log("\n" + "=".repeat(60));
    console.log("LOW QUALITY REPLIES REANALYSIS SUMMARY");
    console.log("=".repeat(60));
    console.log(`Total replies to reanalyze: ${repliesToReanalyze.length}`);
    console.log(`Successfully processed: ${result.processed}`);
    console.log(`Failed: ${result.failed}`);
    console.log("\nReanalysis complete!");

    return result;
  } catch (error: any) {
    console.error("Fatal error reanalyzing low quality replies:", error);
    throw error;
  }
}

/**
 * Reanalyze both casts and replies with quality score < 50
 */
async function reanalyzeLowQualityAll() {
  console.log("Starting reanalysis for all casts and replies with quality score < 50...\n");

  const castsResult = await reanalyzeLowQualityCasts();
  console.log("\n");
  const repliesResult = await reanalyzeLowQualityReplies();

  console.log("\n" + "=".repeat(60));
  console.log("OVERALL LOW QUALITY REANALYSIS SUMMARY");
  console.log("=".repeat(60));
  console.log(`Curated casts processed: ${castsResult.processed}`);
  console.log(`Curated casts failed: ${castsResult.failed}`);
  console.log(`Replies processed: ${repliesResult.processed}`);
  console.log(`Replies failed: ${repliesResult.failed}`);
  console.log(`Total processed: ${castsResult.processed + repliesResult.processed}`);
  console.log(`Total failed: ${castsResult.failed + repliesResult.failed}`);
  console.log("\nAll reanalysis complete!");
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
} else if (command === "reanalyze-low") {
  // Reanalyze both casts and replies with quality score < 50
  reanalyzeLowQualityAll()
    .then(() => {
      console.log("\nScript finished successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\nScript failed:", error);
      process.exit(1);
    });
} else if (command === "reanalyze-low-casts") {
  // Reanalyze only curated casts with quality score < 50
  reanalyzeLowQualityCasts()
    .then(() => {
      console.log("\nScript finished successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\nScript failed:", error);
      process.exit(1);
    });
} else if (command === "reanalyze-low-replies") {
  // Reanalyze only replies with quality score < 50
  reanalyzeLowQualityReplies()
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








