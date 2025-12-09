import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";
import { feedViewSessions, feedViewSessionsDaily } from "../lib/schema";

/**
 * Recalculate daily aggregates from cleaned feed_view_sessions data
 * 
 * This script recalculates all daily aggregates from the cleaned feed_view_sessions
 * table, ensuring feed_view_sessions_daily has correct totals after cleanup.
 * 
 * It will:
 * 1. Delete existing daily aggregates
 * 2. Recalculate from scratch from feed_view_sessions
 * 3. Handle all dates, not just those older than 30 days
 */
async function recalculateDailyAggregates() {
  try {
    console.log("Starting recalculation of daily aggregates...");
    console.log("⚠️  WARNING: This will delete and recreate all daily aggregates");
    
    const dryRun = process.env.DRY_RUN !== 'false';
    
    if (dryRun) {
      console.log("\n🔍 DRY RUN MODE - No records will be modified");
      console.log("   Set DRY_RUN=false to actually recalculate");
      
      // Show what would be recalculated
      const stats = await db.execute(sql`
        SELECT 
          DATE_TRUNC('day', created_at) as date,
          feed_type,
          count(*)::int as total_sessions,
          sum(duration_seconds)::bigint as total_duration_seconds,
          count(distinct user_fid)::int as unique_users
        FROM feed_view_sessions
        GROUP BY DATE_TRUNC('day', created_at), feed_type
        ORDER BY date DESC, feed_type
        LIMIT 10
      `);
      
      console.log("\nSample of what would be recalculated (first 10 days):");
      (stats as any).rows?.forEach((row: any) => {
        console.log(`  ${row.date.toISOString().split('T')[0]} - ${row.feed_type}: ${row.total_sessions} sessions, ${row.total_duration_seconds}s total`);
      });
      
      return;
    }

    // Delete all existing daily aggregates
    console.log("\nDeleting existing daily aggregates...");
    await db.execute(sql`DELETE FROM feed_view_sessions_daily`);
    console.log("✓ Deleted existing daily aggregates");

    // Recalculate from scratch
    console.log("\nRecalculating daily aggregates from feed_view_sessions...");
    await db.execute(sql`
      INSERT INTO feed_view_sessions_daily (date, feed_type, total_sessions, total_duration_seconds, unique_users, avg_duration, created_at, updated_at)
      SELECT 
        DATE_TRUNC('day', created_at) as date,
        feed_type,
        count(*)::int as total_sessions,
        sum(duration_seconds)::bigint as total_duration_seconds,
        count(distinct user_fid)::int as unique_users,
        ROUND(avg(duration_seconds))::int as avg_duration,
        NOW() as created_at,
        NOW() as updated_at
      FROM feed_view_sessions
      GROUP BY DATE_TRUNC('day', created_at), feed_type
      ORDER BY date DESC, feed_type
    `);

    // Show summary
    const summary = await db.execute(sql`
      SELECT 
        COUNT(DISTINCT date) as total_days,
        COUNT(*) as total_records,
        SUM(total_sessions) as total_sessions,
        SUM(total_duration_seconds) as total_duration_seconds
      FROM feed_view_sessions_daily
    `);

    const summaryRow = (summary as any).rows?.[0];
    console.log("\n✓ Recalculation completed successfully!");
    console.log(`\nSummary:`);
    console.log(`  Total days: ${summaryRow?.total_days || 0}`);
    console.log(`  Total records: ${summaryRow?.total_records || 0}`);
    console.log(`  Total sessions: ${summaryRow?.total_sessions || 0}`);
    console.log(`  Total duration: ${Math.floor((summaryRow?.total_duration_seconds || 0) / 3600)} hours`);

  } catch (error) {
    console.error("Error recalculating daily aggregates:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

recalculateDailyAggregates();

