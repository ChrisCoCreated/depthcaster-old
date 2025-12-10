import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";
import { feedViewSessions } from "../lib/schema";

/**
 * Cleanup script to remove old feed_view_sessions records
 * 
 * This script deletes all records where session_start_time IS NULL (old format).
 * These are the records created before the active session tracking fix and contain
 * invalid/duplicate data with unrealistic durations (26+ hours).
 * 
 * WARNING: This script modifies production data. Run with caution and ensure you have backups.
 */
async function cleanupOldFeedSessions() {
  try {
    console.log("Starting cleanup of old feed_view_sessions records...");
    console.log("This will delete all records where session_start_time IS NULL\n");
    
    // Count records to be deleted
    const countResult = await db.execute(sql`
      SELECT 
        COUNT(*)::int as total_count,
        COUNT(DISTINCT user_fid)::int as unique_users,
        SUM(duration_seconds)::bigint as total_duration_seconds,
        AVG(duration_seconds)::bigint as avg_duration_seconds,
        MAX(duration_seconds)::int as max_duration_seconds,
        MIN(duration_seconds)::int as min_duration_seconds
      FROM feed_view_sessions
      WHERE session_start_time IS NULL
    `);

    const stats = (countResult as any).rows?.[0] || {};
    const totalCount = stats.total_count || 0;
    const uniqueUsers = stats.unique_users || 0;
    const totalDuration = stats.total_duration_seconds || 0;
    const avgDuration = stats.avg_duration_seconds || 0;
    const maxDuration = stats.max_duration_seconds || 0;
    const minDuration = stats.min_duration_seconds || 0;

    console.log("Records to be deleted:");
    console.log(`  Total records: ${totalCount.toLocaleString()}`);
    console.log(`  Unique users: ${uniqueUsers.toLocaleString()}`);
    console.log(`  Total duration: ${Math.floor(totalDuration / 3600).toLocaleString()} hours`);
    console.log(`  Average duration: ${Math.floor(avgDuration / 60)} minutes`);
    console.log(`  Max duration: ${Math.floor(maxDuration / 3600)} hours`);
    console.log(`  Min duration: ${minDuration} seconds`);

    // Breakdown by feed type
    const breakdownResult = await db.execute(sql`
      SELECT 
        feed_type,
        COUNT(*)::int as count,
        AVG(duration_seconds)::bigint as avg_duration
      FROM feed_view_sessions
      WHERE session_start_time IS NULL
      GROUP BY feed_type
      ORDER BY count DESC
    `);

    const breakdown = (breakdownResult as any).rows || [];
    if (breakdown.length > 0) {
      console.log("\nBreakdown by feed type:");
      breakdown.forEach((row: any) => {
        console.log(`  ${row.feed_type || 'null'}: ${row.count.toLocaleString()} records (avg ${Math.floor(row.avg_duration / 60)} min)`);
      });
    }

    if (totalCount === 0) {
      console.log("\n✓ No old records found. Nothing to delete.");
      return;
    }

    // Ask for confirmation
    console.log("\n⚠️  WARNING: This will delete all records where session_start_time IS NULL");
    console.log("   These are the old format records with invalid/duplicate data.");
    console.log("   Make sure you have a backup before proceeding.");
    console.log("   To proceed, set DRY_RUN=false environment variable");
    
    const dryRun = process.env.DRY_RUN !== 'false';
    
    if (dryRun) {
      console.log("\n🔍 DRY RUN MODE - No records will be deleted");
      console.log("   Set DRY_RUN=false to actually delete records");
      return;
    }

    // Delete old records
    console.log("\nDeleting old records...");
    const deleteResult = await db.execute(sql`
      DELETE FROM feed_view_sessions
      WHERE session_start_time IS NULL
    `);

    console.log(`\n✓ Successfully deleted ${totalCount.toLocaleString()} old records`);
    console.log("\n✓ Cleanup completed successfully!");
    console.log("\nNext steps:");
    console.log("  1. Verify the statistics look correct");
    console.log("  2. Run the aggregate-analytics script to recalculate daily aggregates if needed");
    
  } catch (error) {
    console.error("Error cleaning up old feed sessions:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

cleanupOldFeedSessions();

