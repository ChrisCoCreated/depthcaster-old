import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";
import {
  pageViews,
  feedViewSessions,
  castViews,
  pageViewsDaily,
  feedViewSessionsDaily,
  castViewsDaily,
} from "../lib/schema";

const RETENTION_DAYS = 30; // Keep detailed data for 30 days

async function aggregateAnalytics() {
  try {
    console.log("Starting analytics aggregation...");
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
    console.log(`Aggregating data older than ${cutoffDate.toISOString()}`);

    // Aggregate page_views
    console.log("Aggregating page_views...");
    await db.execute(sql`
      INSERT INTO page_views_daily (date, page_path, view_count, unique_users, created_at, updated_at)
      SELECT 
        DATE_TRUNC('day', created_at) as date,
        page_path,
        count(*)::int as view_count,
        count(distinct user_fid)::int as unique_users,
        NOW() as created_at,
        NOW() as updated_at
      FROM page_views
      WHERE created_at < ${cutoffDate.toISOString()}
        AND NOT EXISTS (
          SELECT 1 FROM page_views_daily 
          WHERE page_views_daily.date = DATE_TRUNC('day', page_views.created_at)
            AND page_views_daily.page_path = page_views.page_path
        )
      GROUP BY DATE_TRUNC('day', created_at), page_path
      ON CONFLICT (date, page_path) DO UPDATE SET
        view_count = page_views_daily.view_count + EXCLUDED.view_count,
        unique_users = GREATEST(page_views_daily.unique_users, EXCLUDED.unique_users),
        updated_at = NOW()
    `);

    // Aggregate feed_view_sessions
    console.log("Aggregating feed_view_sessions...");
    await db.execute(sql`
      INSERT INTO feed_view_sessions_daily (date, feed_type, total_sessions, total_duration_seconds, unique_users, avg_duration, created_at, updated_at)
      SELECT 
        DATE_TRUNC('day', created_at) as date,
        feed_type,
        count(*)::int as total_sessions,
        sum(duration_seconds)::int as total_duration_seconds,
        count(distinct user_fid)::int as unique_users,
        avg(duration_seconds)::int as avg_duration,
        NOW() as created_at,
        NOW() as updated_at
      FROM feed_view_sessions
      WHERE created_at < ${cutoffDate.toISOString()}
        AND NOT EXISTS (
          SELECT 1 FROM feed_view_sessions_daily 
          WHERE feed_view_sessions_daily.date = DATE_TRUNC('day', feed_view_sessions.created_at)
            AND feed_view_sessions_daily.feed_type = feed_view_sessions.feed_type
        )
      GROUP BY DATE_TRUNC('day', created_at), feed_type
      ON CONFLICT (date, feed_type) DO UPDATE SET
        total_sessions = feed_view_sessions_daily.total_sessions + EXCLUDED.total_sessions,
        total_duration_seconds = feed_view_sessions_daily.total_duration_seconds + EXCLUDED.total_duration_seconds,
        unique_users = GREATEST(feed_view_sessions_daily.unique_users, EXCLUDED.unique_users),
        avg_duration = (feed_view_sessions_daily.total_duration_seconds + EXCLUDED.total_duration_seconds)::float / 
                      (feed_view_sessions_daily.total_sessions + EXCLUDED.total_sessions)::float,
        updated_at = NOW()
    `);

    // Aggregate cast_views
    console.log("Aggregating cast_views...");
    await db.execute(sql`
      INSERT INTO cast_views_daily (date, feed_type, cast_hash, view_count, unique_users, created_at, updated_at)
      SELECT 
        DATE_TRUNC('day', created_at) as date,
        COALESCE(feed_type, 'unknown') as feed_type,
        cast_hash,
        count(*)::int as view_count,
        count(distinct user_fid)::int as unique_users,
        NOW() as created_at,
        NOW() as updated_at
      FROM cast_views
      WHERE created_at < ${cutoffDate.toISOString()}
        AND NOT EXISTS (
          SELECT 1 FROM cast_views_daily 
          WHERE cast_views_daily.date = DATE_TRUNC('day', cast_views.created_at)
            AND cast_views_daily.feed_type = COALESCE(cast_views.feed_type, 'unknown')
            AND cast_views_daily.cast_hash = cast_views.cast_hash
        )
      GROUP BY DATE_TRUNC('day', created_at), COALESCE(feed_type, 'unknown'), cast_hash
      ON CONFLICT (date, feed_type, cast_hash) DO UPDATE SET
        view_count = cast_views_daily.view_count + EXCLUDED.view_count,
        unique_users = GREATEST(cast_views_daily.unique_users, EXCLUDED.unique_users),
        updated_at = NOW()
    `);

    // Delete old detailed records
    console.log("Deleting old detailed records...");
    const deletedPageViews = await db.execute(sql`
      DELETE FROM page_views WHERE created_at < ${cutoffDate.toISOString()}
    `);
    console.log(`Deleted old page_views`);

    const deletedFeedSessions = await db.execute(sql`
      DELETE FROM feed_view_sessions WHERE created_at < ${cutoffDate.toISOString()}
    `);
    console.log(`Deleted old feed_view_sessions`);

    const deletedCastViews = await db.execute(sql`
      DELETE FROM cast_views WHERE created_at < ${cutoffDate.toISOString()}
    `);
    console.log(`Deleted old cast_views`);

    console.log("✓ Analytics aggregation completed successfully!");
  } catch (error) {
    console.error("Error aggregating analytics:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

aggregateAnalytics();

