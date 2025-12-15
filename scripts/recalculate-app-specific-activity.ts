/**
 * Recalculate last_qualifying_activity_at for app-specific activities only
 * 
 * This script:
 * 1. Deletes all post_reply activity events (can't distinguish app vs protocol)
 * 2. Recalculates last_qualifying_activity_at based only on app-specific activities:
 *    - save_curate (always app-specific via /api/curate)
 *    - follow_add (always app-specific via app APIs)
 *    - session_depth (always app-specific via /api/analytics/feed-view)
 * 3. Sets to NULL for users with no app-specific activities
 */

import { resolve } from "path";
import { config } from "dotenv";
import { db } from "../lib/db";
import { sql } from "drizzle-orm";

// Load environment variables
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

async function runRecalculation() {
  try {
    console.log("Starting recalculation of last_qualifying_activity_at for app-specific activities only...\n");

    // Step 1: Count post_reply events before deletion
    console.log("Step 1: Counting post_reply events...");
    const countResult = await db.execute(sql`
      SELECT COUNT(*)::int as count, COUNT(DISTINCT user_fid)::int as user_count
      FROM activity_events
      WHERE type = 'post_reply'
    `);
    const count = (countResult as any).rows?.[0]?.count || 0;
    const userCount = (countResult as any).rows?.[0]?.user_count || 0;
    console.log(`  Found ${count} post_reply events from ${userCount} users`);
    console.log("✅ Counted post_reply events\n");

    // Step 2: Delete all post_reply activity events
    console.log("Step 2: Deleting all post_reply activity events...");
    const deleteResult = await db.execute(sql`
      DELETE FROM activity_events WHERE type = 'post_reply'
    `);
    console.log("✅ Deleted all post_reply events\n");

    // Step 3: Count app-specific activities
    console.log("Step 3: Counting app-specific activity events...");
    const appActivityCount = await db.execute(sql`
      SELECT 
        type,
        COUNT(*)::int as count,
        COUNT(DISTINCT user_fid)::int as user_count
      FROM activity_events
      WHERE type IN ('save_curate', 'follow_add', 'session_depth')
      GROUP BY type
    `);
    const appActivities = (appActivityCount as any).rows || [];
    console.log("  App-specific activity breakdown:");
    appActivities.forEach((row: any) => {
      console.log(`    ${row.type}: ${row.count} events from ${row.user_count} users`);
    });
    const totalAppUsers = await db.execute(sql`
      SELECT COUNT(DISTINCT user_fid)::int as user_count
      FROM activity_events
      WHERE type IN ('save_curate', 'follow_add', 'session_depth')
    `);
    const totalUsers = (totalAppUsers as any).rows?.[0]?.user_count || 0;
    console.log(`  Total users with app-specific activities: ${totalUsers}`);
    console.log("✅ Counted app-specific activities\n");

    // Step 4: Recalculate last_qualifying_activity_at for users with app-specific activities
    console.log("Step 4: Recalculating last_qualifying_activity_at for users with app-specific activities...");
    const updateResult = await db.execute(sql`
      UPDATE users u
      SET last_qualifying_activity_at = (
        SELECT MAX(created_at)
        FROM activity_events ae
        WHERE ae.user_fid = u.fid
          AND ae.type IN ('save_curate', 'follow_add', 'session_depth')
      ),
      updated_at = NOW()
      WHERE EXISTS (
        SELECT 1 FROM activity_events ae
        WHERE ae.user_fid = u.fid
          AND ae.type IN ('save_curate', 'follow_add', 'session_depth')
      )
    `);
    console.log("✅ Updated last_qualifying_activity_at for users with app-specific activities\n");

    // Step 5: Set to NULL for users with no app-specific activities
    console.log("Step 5: Setting last_qualifying_activity_at to NULL for users with no app-specific activities...");
    const nullResult = await db.execute(sql`
      UPDATE users u
      SET last_qualifying_activity_at = NULL,
          updated_at = NOW()
      WHERE NOT EXISTS (
        SELECT 1 FROM activity_events ae
        WHERE ae.user_fid = u.fid
          AND ae.type IN ('save_curate', 'follow_add', 'session_depth')
      )
    `);
    console.log("✅ Set last_qualifying_activity_at to NULL for users with no app-specific activities\n");

    // Step 6: Verification
    console.log("Step 6: Verifying results...");
    const verification = await db.execute(sql`
      SELECT 
        COUNT(*)::int as total_users,
        COUNT(last_qualifying_activity_at)::int as users_with_activity,
        COUNT(*)::int - COUNT(last_qualifying_activity_at)::int as users_without_activity
      FROM users
    `);
    const stats = (verification as any).rows?.[0];
    console.log("  Final statistics:");
    console.log(`    Total users: ${stats?.total_users || 0}`);
    console.log(`    Users with app-specific activity: ${stats?.users_with_activity || 0}`);
    console.log(`    Users without app-specific activity: ${stats?.users_without_activity || 0}`);
    console.log("✅ Verification complete\n");

    console.log("🎉 Recalculation completed successfully!");
    console.log("\nSummary:");
    console.log(`- Deleted ${count} post_reply events from ${userCount} users`);
    console.log(`- Recalculated last_qualifying_activity_at for ${totalUsers} users with app-specific activities`);
    console.log(`- Set last_qualifying_activity_at to NULL for users with no app-specific activities`);
    console.log("\nGoing forward, only app-originated post_reply events (via /api/cast) will be recorded.");
  } catch (error) {
    console.error("❌ Error running recalculation:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runRecalculation();


