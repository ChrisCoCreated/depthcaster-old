import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";
import { feedViewSessions } from "../lib/schema";

/**
 * Cleanup script to remove duplicate feed_view_sessions records
 * 
 * This script identifies and removes duplicate session records that were created
 * within 30 seconds of each other for the same user/feed combination, keeping only
 * the final (longest duration) record.
 * 
 * WARNING: This script modifies production data. Run with caution and ensure you have backups.
 */
async function cleanupDuplicateFeedSessions() {
  try {
    console.log("Starting cleanup of duplicate feed_view_sessions...");
    
    // First, identify duplicates - records within 30 seconds of each other for same user/feed
    console.log("Identifying duplicate records...");
    const duplicates = await db.execute(sql`
      WITH session_groups AS (
        SELECT 
          id,
          user_fid,
          feed_type,
          duration_seconds,
          created_at,
          LAG(created_at) OVER (
            PARTITION BY user_fid, feed_type 
            ORDER BY created_at
          ) as prev_created_at
        FROM feed_view_sessions
        WHERE created_at >= NOW() - INTERVAL '90 days'
      ),
      potential_duplicates AS (
        SELECT 
          id,
          user_fid,
          feed_type,
          duration_seconds,
          created_at,
          prev_created_at,
          EXTRACT(EPOCH FROM (created_at - prev_created_at)) as seconds_since_prev
        FROM session_groups
        WHERE prev_created_at IS NOT NULL
          AND EXTRACT(EPOCH FROM (created_at - prev_created_at)) <= 30
      ),
      ranked_duplicates AS (
        SELECT 
          id,
          user_fid,
          feed_type,
          duration_seconds,
          created_at,
          ROW_NUMBER() OVER (
            PARTITION BY user_fid, feed_type, 
            DATE_TRUNC('minute', created_at)
            ORDER BY duration_seconds DESC, created_at DESC
          ) as rn
        FROM potential_duplicates
      )
      SELECT 
        id,
        user_fid,
        feed_type,
        duration_seconds,
        created_at
      FROM ranked_duplicates
      WHERE rn > 1
      ORDER BY created_at DESC
    `);

    const duplicateRows = (duplicates as any).rows || [];
    console.log(`Found ${duplicateRows.length} duplicate records to remove`);

    if (duplicateRows.length === 0) {
      console.log("No duplicates found. Exiting.");
      return;
    }

    // Show summary
    const summary = duplicateRows.reduce((acc: any, row: any) => {
      const key = `${row.feed_type || 'null'}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    console.log("\nDuplicate breakdown by feed type:");
    Object.entries(summary).forEach(([feedType, count]) => {
      console.log(`  ${feedType}: ${count} duplicates`);
    });

    // Ask for confirmation (in a real script, you might want to add readline for interactive confirmation)
    console.log("\n⚠️  WARNING: This will delete duplicate records.");
    console.log("   Make sure you have a backup before proceeding.");
    console.log("   To proceed, set DRY_RUN=false environment variable");
    
    const dryRun = process.env.DRY_RUN !== 'false';
    
    if (dryRun) {
      console.log("\n🔍 DRY RUN MODE - No records will be deleted");
      console.log("   Set DRY_RUN=false to actually delete records");
      return;
    }

    // Delete duplicates (keeping the one with longest duration)
    console.log("\nDeleting duplicate records...");
    const idsToDelete = duplicateRows.map((row: any) => row.id);
    
    if (idsToDelete.length > 0) {
      // Delete in batches to avoid overwhelming the database
      const batchSize = 500;
      let deletedCount = 0;
      
      for (let i = 0; i < idsToDelete.length; i += batchSize) {
        const batch = idsToDelete.slice(i, i + batchSize);
        // Use IN clause with proper UUID casting
        const result = await db.execute(sql`
          DELETE FROM feed_view_sessions
          WHERE id IN (${sql.raw(batch.map((id: string) => `'${id}'::uuid`).join(', '))})
        `);
        deletedCount += batch.length;
        console.log(`  Deleted ${deletedCount} of ${idsToDelete.length} duplicates...`);
      }
      
      console.log(`\n✓ Successfully deleted ${deletedCount} duplicate records`);
    }

    console.log("\n✓ Cleanup completed successfully!");
    console.log("\nNext steps:");
    console.log("  1. Verify the statistics look correct");
    console.log("  2. Run the aggregate-analytics script to recalculate daily aggregates");
    
  } catch (error) {
    console.error("Error cleaning up duplicate feed sessions:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

cleanupDuplicateFeedSessions();

