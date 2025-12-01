import { resolve } from "path";
import { config } from "dotenv";

// Load environment variables
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function runMigration() {
  try {
    console.log("Running migration 0018: Add status column to build_ideas...");

    // Add status column
    console.log("Adding status column to build_ideas...");
    await db.execute(sql`
      ALTER TABLE "build_ideas" ADD COLUMN IF NOT EXISTS "status" text;
    `);
    console.log("✓ Added status column");

    // Create index on status column
    console.log("Creating index on status column...");
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "build_ideas_status_idx" ON "build_ideas" USING btree ("status");
    `);
    console.log("✓ Created status index");

    console.log("\n✅ Migration 0018 completed successfully!");
    console.log("- Added status column to build_ideas table");
    console.log("- Created index on status column");
  } catch (error) {
    console.error("❌ Error running migration:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runMigration();
