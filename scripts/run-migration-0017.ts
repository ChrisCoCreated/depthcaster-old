import { resolve } from "path";
import { config } from "dotenv";

// Load environment variables
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function runMigration() {
  try {
    console.log("Running migration 0017: Add feedback_type column to build_ideas...");

    // Add feedback_type column
    console.log("Adding feedback_type column to build_ideas...");
    await db.execute(sql`
      ALTER TABLE "build_ideas" ADD COLUMN IF NOT EXISTS "feedback_type" text;
    `);
    console.log("✓ Added feedback_type column");

    // Set default value for existing feedback records
    console.log("Setting default feedback_type for existing feedback records...");
    await db.execute(sql`
      UPDATE "build_ideas" 
      SET "feedback_type" = 'feedback' 
      WHERE "type" = 'feedback' AND "feedback_type" IS NULL;
    `);
    console.log("✓ Set default feedback_type for existing records");

    console.log("\n✅ Migration 0017 completed successfully!");
    console.log("- Added feedback_type column to build_ideas table");
    console.log("- Set default value 'feedback' for existing feedback records");
  } catch (error) {
    console.error("❌ Error running migration:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runMigration();







