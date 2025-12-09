import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";

/**
 * Analyze feed_view_sessions to understand the data patterns
 */
async function analyzeFeedSessions() {
  try {
    console.log("Analyzing feed_view_sessions data...\n");

    // Total counts
    const totalStats = await db.execute(sql`
      SELECT 
        COUNT(*) as total_sessions,
        SUM(duration_seconds) as total_duration_seconds,
        AVG(duration_seconds) as avg_duration_seconds,
        MAX(duration_seconds) as max_duration_seconds
      FROM feed_view_sessions
    `);
    console.log("Overall Statistics:");
    const total = (totalStats as any).rows?.[0];
    console.log(`  Total sessions: ${total?.total_sessions || 0}`);
    console.log(`  Total duration: ${Math.floor((total?.total_duration_seconds || 0) / 3600)} hours`);
    console.log(`  Avg duration: ${Math.floor(total?.avg_duration_seconds || 0)} seconds`);
    console.log(`  Max duration: ${total?.max_duration_seconds || 0} seconds\n`);

    // By feed type
    const byFeedType = await db.execute(sql`
      SELECT 
        feed_type,
        COUNT(*) as total_sessions,
        SUM(duration_seconds) as total_duration_seconds,
        AVG(duration_seconds) as avg_duration_seconds,
        COUNT(DISTINCT user_fid) as unique_users
      FROM feed_view_sessions
      GROUP BY feed_type
      ORDER BY total_sessions DESC
    `);
    console.log("By Feed Type:");
    (byFeedType as any).rows?.forEach((row: any) => {
      console.log(`  ${row.feed_type}:`);
      console.log(`    Sessions: ${row.total_sessions}`);
      console.log(`    Total time: ${Math.floor(row.total_duration_seconds / 3600)}h ${Math.floor((row.total_duration_seconds % 3600) / 60)}m`);
      console.log(`    Avg duration: ${Math.floor(row.avg_duration_seconds)}s`);
      console.log(`    Unique users: ${row.unique_users}`);
    });
    console.log();

    // Check for suspicious patterns - sessions with very long durations
    const longSessions = await db.execute(sql`
      SELECT 
        feed_type,
        COUNT(*) as count,
        AVG(duration_seconds) as avg_duration
      FROM feed_view_sessions
      WHERE duration_seconds > 3600
      GROUP BY feed_type
      ORDER BY count DESC
    `);
    console.log("Sessions longer than 1 hour:");
    (longSessions as any).rows?.forEach((row: any) => {
      console.log(`  ${row.feed_type}: ${row.count} sessions, avg ${Math.floor(row.avg_duration / 60)} minutes`);
    });
    console.log();

    // Check for multiple sessions from same user/feed in short time
    const rapidSessions = await db.execute(sql`
      WITH session_groups AS (
        SELECT 
          user_fid,
          feed_type,
          created_at,
          LAG(created_at) OVER (
            PARTITION BY user_fid, feed_type 
            ORDER BY created_at
          ) as prev_created_at
        FROM feed_view_sessions
        WHERE user_fid IS NOT NULL
      )
      SELECT 
        feed_type,
        COUNT(*) as rapid_count
      FROM session_groups
      WHERE prev_created_at IS NOT NULL
        AND EXTRACT(EPOCH FROM (created_at - prev_created_at)) <= 60
      GROUP BY feed_type
      ORDER BY rapid_count DESC
    `);
    console.log("Sessions within 60 seconds of previous (same user/feed):");
    (rapidSessions as any).rows?.forEach((row: any) => {
      console.log(`  ${row.feed_type}: ${row.rapid_count} rapid sessions`);
    });
    console.log();

    // Check daily aggregates
    const dailyStats = await db.execute(sql`
      SELECT 
        feed_type,
        SUM(total_sessions) as total_sessions,
        SUM(total_duration_seconds) as total_duration_seconds,
        COUNT(*) as day_count
      FROM feed_view_sessions_daily
      GROUP BY feed_type
      ORDER BY total_sessions DESC
    `);
    console.log("Daily Aggregates:");
    (dailyStats as any).rows?.forEach((row: any) => {
      console.log(`  ${row.feed_type}:`);
      console.log(`    Sessions: ${row.total_sessions}`);
      console.log(`    Total time: ${Math.floor(row.total_duration_seconds / 3600)}h ${Math.floor((row.total_duration_seconds % 3600) / 60)}m`);
      console.log(`    Days: ${row.day_count}`);
    });
    console.log();

    // Compare recent vs daily
    const recentStats = await db.execute(sql`
      SELECT 
        feed_type,
        COUNT(*) as total_sessions,
        SUM(duration_seconds) as total_duration_seconds
      FROM feed_view_sessions
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY feed_type
      ORDER BY total_sessions DESC
    `);
    console.log("Recent (last 30 days) vs Daily Aggregates:");
    const recentMap = new Map();
    (recentStats as any).rows?.forEach((row: any) => {
      recentMap.set(row.feed_type, {
        sessions: row.total_sessions,
        duration: row.total_duration_seconds,
      });
    });
    
    (dailyStats as any).rows?.forEach((row: any) => {
      const recent = recentMap.get(row.feed_type);
      if (recent) {
        const totalSessions = (row.total_sessions || 0) + (recent.sessions || 0);
        const totalDuration = (row.total_duration_seconds || 0) + (recent.duration || 0);
        console.log(`  ${row.feed_type}:`);
        console.log(`    Recent: ${recent.sessions} sessions, ${Math.floor(recent.duration / 3600)}h`);
        console.log(`    Daily: ${row.total_sessions} sessions, ${Math.floor(row.total_duration_seconds / 3600)}h`);
        console.log(`    Combined: ${totalSessions} sessions, ${Math.floor(totalDuration / 3600)}h`);
      }
    });

  } catch (error) {
    console.error("Error analyzing feed sessions:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

analyzeFeedSessions();

