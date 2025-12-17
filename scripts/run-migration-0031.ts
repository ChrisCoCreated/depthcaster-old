import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), ".env.local") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function runMigration() {
  try {
    console.log("Running migration 0031: Add poll closed_at support...");

    // Add closed_at column
    console.log("Adding closed_at column to polls...");
    await db.execute(sql`
      ALTER TABLE "polls" ADD COLUMN IF NOT EXISTS "closed_at" timestamp;
    `);

    console.log("\n✓ Migration completed successfully!");
    console.log("- Added closed_at column to polls");
  } catch (error) {
    console.error("Error running migration:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runMigration();





