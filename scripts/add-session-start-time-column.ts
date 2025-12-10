import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";

/**
 * Add session_start_time column to feed_view_sessions table
 */
async function addSessionStartTimeColumn() {
  try {
    console.log("Adding session_start_time column to feed_view_sessions...");
    
    // Check if column already exists
    const checkResult = await db.execute(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'feed_view_sessions' 
      AND column_name = 'session_start_time'
    `);
    
    if ((checkResult as any).rows && (checkResult as any).rows.length > 0) {
      console.log("✓ Column session_start_time already exists");
      return;
    }

    // Add the column
    await db.execute(sql`
      ALTER TABLE feed_view_sessions 
      ADD COLUMN session_start_time timestamp
    `);
    
    console.log("✓ Added session_start_time column");

    // Add index
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS feed_view_sessions_session_start_time_idx 
      ON feed_view_sessions USING btree (session_start_time)
    `);
    
    console.log("✓ Added index on session_start_time");
    console.log("\n✓ Schema change applied successfully!");
    
  } catch (error) {
    console.error("Error adding column:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

addSessionStartTimeColumn();

