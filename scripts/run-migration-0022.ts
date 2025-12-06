import { resolve } from "path";
import { config } from "dotenv";

// Load environment variables
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function runMigration() {
  try {
    console.log("Running migration 0022: Add target_cast_hash to quality_feedback table...");

    // Add target_cast_hash column
    console.log("Adding target_cast_hash column...");
    await db.execute(sql`
      ALTER TABLE "quality_feedback" ADD COLUMN IF NOT EXISTS "target_cast_hash" text;
    `);
    console.log("✓ Added target_cast_hash column");

    // Backfill existing records
    console.log("Backfilling existing records...");
    await db.execute(sql`
      UPDATE "quality_feedback" SET "target_cast_hash" = "cast_hash" WHERE "target_cast_hash" IS NULL;
    `);
    console.log("✓ Backfilled existing records");

    // Make column NOT NULL
    console.log("Setting target_cast_hash to NOT NULL...");
    await db.execute(sql`
      ALTER TABLE "quality_feedback" ALTER COLUMN "target_cast_hash" SET NOT NULL;
    `);
    console.log("✓ Set target_cast_hash to NOT NULL");

    // Create index on target_cast_hash
    console.log("Creating index on target_cast_hash...");
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "quality_feedback_target_cast_hash_idx" ON "quality_feedback" USING btree ("target_cast_hash");
    `);
    console.log("✓ Created target_cast_hash index");

    console.log("\n✅ Migration 0022 completed successfully!");
    console.log("- Added target_cast_hash column to quality_feedback table");
    console.log("- Backfilled existing records");
    console.log("- Created index on target_cast_hash");
  } catch (error) {
    console.error("❌ Error running migration:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runMigration();
