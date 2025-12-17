/**
 * Script to rescore all recasts (quote casts) of already-curated casts
 * 
 * This script finds all casts that quote casts that are already in curatedCasts,
 * and re-analyzes them using the new logic that only evaluates the additional text
 * (not the embedded cast content).
 * 
 * Usage:
 *   npx tsx scripts/rescore-recasts-of-curated-casts.ts
 */

import { config } from "dotenv";
import { resolve } from "path";

// Load environment variables from .env.local or .env
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { curatedCasts, castReplies } from "../lib/schema";
import { eq, isNotNull, sql } from "drizzle-orm";
import { analyzeCastQuality } from "../lib/deepseek-quality";
import { extractQuotedCastHashes, isQuoteCast } from "../lib/conversation";
import { Cast } from "@neynar/nodejs-sdk/build/api";

/**
 * Rescore all recasts of curated casts
 */
async function rescoreRecastsOfCuratedCasts() {
  console.log("Starting quality rescore for recasts of curated casts...\n");

  try {
    // First, get all curated cast hashes for quick lookup
    const allCuratedCasts = await db
      .select({
        castHash: curatedCasts.castHash,
      })
      .from(curatedCasts);
    
    const curatedCastHashes = new Set(allCuratedCasts.map(c => c.castHash.toLowerCase()));
    console.log(`Found ${curatedCastHashes.size} curated casts in database\n`);

    // Find all quote casts in curatedCasts that quote a curated cast
    const curatedCastsToRescore: Array<{ castHash: string; castData: any }> = [];
    
    const allCuratedCastsWithData = await db
      .select({
        castHash: curatedCasts.castHash,
        castData: curatedCasts.castData,
      })
      .from(curatedCasts);
    
    for (const cast of allCuratedCastsWithData) {
      if (cast.castData && isQuoteCast(cast.castData as Cast)) {
        const quotedHashes = extractQuotedCastHashes(cast.castData as Cast);
        // Check if any quoted cast is in curatedCasts
        const quotesCuratedCast = quotedHashes.some(hash => 
          curatedCastHashes.has(hash.toLowerCase())
        );
        
        if (quotesCuratedCast) {
          curatedCastsToRescore.push({
            castHash: cast.castHash,
            castData: cast.castData,
          });
        }
      }
    }

    console.log(`Found ${curatedCastsToRescore.length} curated casts that are recasts of curated casts`);

    // Find all quote casts in castReplies that quote a curated cast
    const replyCastsToRescore: Array<{ replyCastHash: string; castData: any }> = [];
    
    const allQuoteReplies = await db
      .select({
        replyCastHash: castReplies.replyCastHash,
        castData: castReplies.castData,
        quotedCastHash: castReplies.quotedCastHash,
      })
      .from(castReplies)
      .where(eq(castReplies.isQuoteCast, true));
    
    for (const reply of allQuoteReplies) {
      // Check if quotedCastHash is in curatedCasts
      if (reply.quotedCastHash && curatedCastHashes.has(reply.quotedCastHash.toLowerCase())) {
        replyCastsToRescore.push({
          replyCastHash: reply.replyCastHash,
          castData: reply.castData,
        });
      } else if (reply.castData && isQuoteCast(reply.castData as Cast)) {
        // Also check embeds in case quotedCastHash wasn't set
        const quotedHashes = extractQuotedCastHashes(reply.castData as Cast);
        const quotesCuratedCast = quotedHashes.some(hash => 
          curatedCastHashes.has(hash.toLowerCase())
        );
        
        if (quotesCuratedCast) {
          replyCastsToRescore.push({
            replyCastHash: reply.replyCastHash,
            castData: reply.castData,
          });
        }
      }
    }

    console.log(`Found ${replyCastsToRescore.length} reply casts that are recasts of curated casts\n`);

    const totalToRescore = curatedCastsToRescore.length + replyCastsToRescore.length;
    console.log(`Total casts to rescore: ${totalToRescore}\n`);

    if (totalToRescore === 0) {
      console.log("No recasts of curated casts found. Exiting.");
      return { processed: 0, failed: 0 };
    }

    let processed = 0;
    let failed = 0;

    // Rescore curated casts
    if (curatedCastsToRescore.length > 0) {
      console.log(`Rescoring ${curatedCastsToRescore.length} curated casts...`);
      for (const cast of curatedCastsToRescore) {
        try {
          const result = await analyzeCastQuality(cast.castData);
          if (result) {
            await db
              .update(curatedCasts)
              .set({
                qualityScore: result.qualityScore,
                category: result.category,
                qualityAnalyzedAt: new Date(),
              })
              .where(eq(curatedCasts.castHash, cast.castHash));
            
            processed++;
            console.log(`✓ Rescored curated cast ${cast.castHash}: score=${result.qualityScore}, category=${result.category}`);
          } else {
            failed++;
            console.log(`✗ Failed to analyze curated cast ${cast.castHash}`);
          }
        } catch (error: any) {
          failed++;
          console.error(`✗ Error rescoring curated cast ${cast.castHash}:`, error.message);
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // Rescore reply casts
    if (replyCastsToRescore.length > 0) {
      console.log(`\nRescoring ${replyCastsToRescore.length} reply casts...`);
      for (const reply of replyCastsToRescore) {
        try {
          const result = await analyzeCastQuality(reply.castData);
          if (result) {
            await db
              .update(castReplies)
              .set({
                qualityScore: result.qualityScore,
                category: result.category,
                qualityAnalyzedAt: new Date(),
              })
              .where(eq(castReplies.replyCastHash, reply.replyCastHash));
            
            processed++;
            console.log(`✓ Rescored reply cast ${reply.replyCastHash}: score=${result.qualityScore}, category=${result.category}`);
          } else {
            failed++;
            console.log(`✗ Failed to analyze reply cast ${reply.replyCastHash}`);
          }
        } catch (error: any) {
          failed++;
          console.error(`✗ Error rescoring reply cast ${reply.replyCastHash}:`, error.message);
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("RECASTS OF CURATED CASTS RESCORE SUMMARY");
    console.log("=".repeat(60));
    console.log(`Total casts to rescore: ${totalToRescore}`);
    console.log(`  - Curated casts: ${curatedCastsToRescore.length}`);
    console.log(`  - Reply casts: ${replyCastsToRescore.length}`);
    console.log(`Successfully processed: ${processed}`);
    console.log(`Failed: ${failed}`);
    console.log("\nRescore complete!");

    return { processed, failed };
  } catch (error: any) {
    console.error("Fatal error rescoring recasts of curated casts:", error);
    throw error;
  }
}

// Run the rescore
rescoreRecastsOfCuratedCasts()
  .then(() => {
    console.log("\nScript finished successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nScript failed:", error);
    process.exit(1);
  });

