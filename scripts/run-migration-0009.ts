import { resolve } from "path";
import { config } from "dotenv";

// Load environment variables
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function runMigration() {
  try {
    console.log("Running migration 0009: Add composite indexes for curated feed optimization...");

    // Add composite index for curator_cast_curations
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "curator_cast_curations_cast_hash_created_at_idx" 
      ON "curator_cast_curations" ("cast_hash", "created_at");
    `);
    console.log("✓ Created index: curator_cast_curations_cast_hash_created_at_idx");

    // Add composite index for cast_replies
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "cast_replies_curated_cast_hash_created_at_idx" 
      ON "cast_replies" ("curated_cast_hash", "created_at");
    `);
    console.log("✓ Created index: cast_replies_curated_cast_hash_created_at_idx");

    console.log("\nMigration completed successfully!");
    console.log("- Added composite indexes for optimized curated feed queries");
  } catch (error) {
    console.error("Error running migration:", error);
    process.exit(1);
  }
}

runMigration();





