import { resolve } from "path";
import { config } from "dotenv";

// Load environment variables
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function runMigration() {
  try {
    console.log("Running migration 0014: Add signer_uuid to users table...");

    // Add signer_uuid column to users table
    console.log("Adding signer_uuid column to users table...");
    await db.execute(sql`
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "signer_uuid" text;
    `);
    console.log("✓ Added signer_uuid column");

    // Create index for signer_uuid lookups
    console.log("Creating index for signer_uuid...");
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "signer_uuid_idx" ON "users" USING btree ("signer_uuid");
    `);
    console.log("✓ Created signer_uuid index");

    console.log("\n✅ Migration 0014 completed successfully!");
    console.log("- Added signer_uuid column to users table");
    console.log("- Created index on signer_uuid for efficient lookups");
  } catch (error) {
    console.error("❌ Error running migration:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runMigration();

