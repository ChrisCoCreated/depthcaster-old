/**
 * Backfill reactions for all existing users with roles
 * 
 * Usage: npx tsx scripts/sync-user-reactions.ts
 */
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { users, userRoles } from "../lib/schema";
import { eq, sql } from "drizzle-orm";
import { syncUserReactions } from "../lib/reactions";

async function backfillUserReactions() {
  console.log("Starting reaction backfill for users with roles...\n");

  // Query all users with roles
  const usersWithRoles = await db
    .selectDistinct({
      fid: users.fid,
    })
    .from(users)
    .innerJoin(userRoles, eq(users.fid, userRoles.userFid));

  const totalUsers = usersWithRoles.length;
  console.log(`Found ${totalUsers} users with roles\n`);

  if (totalUsers === 0) {
    console.log("No users with roles found. Exiting.");
    return;
  }

  let processed = 0;
  let totalLikesSynced = 0;
  let totalRecastsSynced = 0;
  let totalErrors = 0;
  const failedUsers: number[] = [];

  for (const { fid } of usersWithRoles) {
    processed++;
    console.log(`[${processed}/${totalUsers}] Processing user ${fid}...`);

    try {
      const stats = await syncUserReactions(fid);
      totalLikesSynced += stats.likesSynced;
      totalRecastsSynced += stats.recastsSynced;
      totalErrors += stats.errors;

      if (stats.errors > 0) {
        console.log(`  ⚠️  Completed with ${stats.errors} errors`);
      } else {
        console.log(`  ✓ Synced ${stats.likesSynced} likes, ${stats.recastsSynced} recasts`);
      }

      // Add a small delay to avoid hitting API rate limits
      if (processed < totalUsers) {
        await new Promise((resolve) => setTimeout(resolve, 500)); // 500ms delay
      }
    } catch (error) {
      console.error(`  ✗ Error processing user ${fid}:`, error);
      failedUsers.push(fid);
      totalErrors++;
    }

    // Progress indicator every 10 users
    if (processed % 10 === 0) {
      console.log(`\nProgress: ${processed}/${totalUsers} users processed\n`);
    }
  }

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("Backfill Summary");
  console.log("=".repeat(50));
  console.log(`Total users processed: ${processed}/${totalUsers}`);
  console.log(`Total likes synced: ${totalLikesSynced}`);
  console.log(`Total recasts synced: ${totalRecastsSynced}`);
  console.log(`Total errors: ${totalErrors}`);
  if (failedUsers.length > 0) {
    console.log(`Failed users: ${failedUsers.join(", ")}`);
  }
  console.log("=".repeat(50));
}

// Run the backfill
backfillUserReactions()
  .then(() => {
    console.log("\nBackfill completed successfully.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nFatal error during backfill:", error);
    process.exit(1);
  });




















