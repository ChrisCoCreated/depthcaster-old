import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";

/**
 * Cap unreasonably long session durations
 * Any session longer than 24 hours is likely inflated and should be capped
 */
async function capInflatedDurations() {
  try {
    console.log("Analyzing and capping inflated durations...\n");
    
    const dryRun = process.env.DRY_RUN !== 'false';
    const MAX_DURATION = 24 * 3600; // 24 hours in seconds
    
    // Find sessions with durations > 24 hours
    const inflatedSessions = await db.execute(sql`
      SELECT 
        feed_type,
        COUNT(*) as count,
        SUM(duration_seconds) as total_duration,
        AVG(duration_seconds) as avg_duration,
        MAX(duration_seconds) as max_duration
      FROM feed_view_sessions
      WHERE duration_seconds > ${MAX_DURATION}
      GROUP BY feed_type
      ORDER BY count DESC
    `);
    
    console.log("Sessions with duration > 24 hours:");
    const inflated = (inflatedSessions as any).rows || [];
    let totalToCap = 0;
    let totalExcessDuration = 0;
    
    inflated.forEach((row: any) => {
      console.log(`  ${row.feed_type}:`);
      console.log(`    Count: ${row.count}`);
      console.log(`    Avg: ${Math.floor(row.avg_duration / 3600)}h ${Math.floor((row.avg_duration % 3600) / 60)}m`);
      console.log(`    Max: ${Math.floor(row.max_duration / 3600)}h`);
      totalToCap += parseInt(row.count);
      
      // Calculate excess duration (duration over 24h)
      const excessQuery = db.execute(sql`
        SELECT SUM(duration_seconds - ${MAX_DURATION}) as excess
        FROM feed_view_sessions
        WHERE feed_type = ${row.feed_type} AND duration_seconds > ${MAX_DURATION}
      `);
      // We'll calculate this separately
    });
    
    // Get total excess duration
    const excessStats = await db.execute(sql`
      SELECT 
        COUNT(*) as count,
        SUM(duration_seconds - ${MAX_DURATION}) as excess_duration
      FROM feed_view_sessions
      WHERE duration_seconds > ${MAX_DURATION}
    `);
    const excess = (excessStats as any).rows?.[0];
    totalExcessDuration = excess?.excess_duration || 0;
    
    console.log(`\nTotal sessions to cap: ${totalToCap}`);
    console.log(`Total excess duration: ${Math.floor(totalExcessDuration / 3600)} hours\n`);
    
    if (dryRun) {
      console.log("🔍 DRY RUN - Would cap durations to 24 hours max");
      return;
    }
    
    // Cap all durations to 24 hours
    console.log("Capping durations to 24 hours maximum...");
    const result = await db.execute(sql`
      UPDATE feed_view_sessions
      SET duration_seconds = ${MAX_DURATION}
      WHERE duration_seconds > ${MAX_DURATION}
    `);
    
    console.log(`✓ Capped ${totalToCap} session durations\n`);
    console.log("Next: Run recalculate-daily-aggregates script");

  } catch (error) {
    console.error("Error capping durations:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

capInflatedDurations();

