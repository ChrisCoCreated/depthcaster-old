import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), ".env.local") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function runMigration() {
  try {
    console.log("Running migration 0030: Add allocations column for distribution poll type...");

    // Add allocations column to poll_responses
    console.log("Adding allocations column to poll_responses...");
    await db.execute(sql`
      ALTER TABLE "poll_responses" ADD COLUMN IF NOT EXISTS "allocations" jsonb;
    `);

    console.log("\n✓ Migration completed successfully!");
    console.log("- Added allocations column to poll_responses");
  } catch (error) {
    console.error("Error running migration:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runMigration();

