import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), ".env.local") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function runMigration() {
  try {
    console.log("Running migration 0029: Add markdown field to poll_options...");

    // Add markdown column
    console.log("Adding markdown column to poll_options...");
    await db.execute(sql`
      ALTER TABLE "poll_options" ADD COLUMN IF NOT EXISTS "markdown" text;
    `);

    console.log("\n✓ Migration completed successfully!");
    console.log("- Added markdown column to poll_options");
  } catch (error) {
    console.error("Error running migration:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runMigration();

