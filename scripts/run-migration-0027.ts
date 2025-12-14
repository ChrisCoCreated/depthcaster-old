import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), ".env.local") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function runMigration() {
  try {
    console.log("Running migration 0027: Add poll types and choices support...");

    // Add poll_type column
    console.log("Adding poll_type column to polls...");
    await db.execute(sql`
      ALTER TABLE "polls" ADD COLUMN IF NOT EXISTS "poll_type" text DEFAULT 'ranking' NOT NULL;
    `);

    // Add choices column to polls
    console.log("Adding choices column to polls...");
    await db.execute(sql`
      ALTER TABLE "polls" ADD COLUMN IF NOT EXISTS "choices" jsonb;
    `);

    // Add choices column to poll_responses
    console.log("Adding choices column to poll_responses...");
    await db.execute(sql`
      ALTER TABLE "poll_responses" ADD COLUMN IF NOT EXISTS "choices" jsonb;
    `);

    // Make rankings nullable (since choice type won't use it)
    console.log("Making rankings nullable in poll_responses...");
    await db.execute(sql`
      ALTER TABLE "poll_responses" ALTER COLUMN "rankings" DROP NOT NULL;
    `);

    console.log("\n✓ Migration completed successfully!");
    console.log("- Added poll_type column to polls (default: 'ranking')");
    console.log("- Added choices column to polls");
    console.log("- Added choices column to poll_responses");
    console.log("- Made rankings nullable in poll_responses");
  } catch (error) {
    console.error("Error running migration:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runMigration();
