import { resolve } from "path";
import { config } from "dotenv";

// Load environment variables
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function runMigration() {
  try {
    console.log("Running migration 0010: Add castCreatedAt column to curated_casts and cast_replies...");

    // Add cast_created_at column to curated_casts (nullable initially)
    await db.execute(sql`
      ALTER TABLE "curated_casts" ADD COLUMN IF NOT EXISTS "cast_created_at" timestamp;
    `);
    console.log("✓ Added cast_created_at column to curated_casts");

    // Add cast_created_at column to cast_replies (nullable initially)
    await db.execute(sql`
      ALTER TABLE "cast_replies" ADD COLUMN IF NOT EXISTS "cast_created_at" timestamp;
    `);
    console.log("✓ Added cast_created_at column to cast_replies");

    // Backfill curated_casts: extract timestamp from cast_data JSONB
    await db.execute(sql`
      UPDATE "curated_casts" 
      SET "cast_created_at" = CASE 
        WHEN (cast_data->>'timestamp') IS NOT NULL AND (cast_data->>'timestamp') != '' THEN
          (cast_data->>'timestamp')::timestamp
        ELSE NULL
      END
      WHERE "cast_created_at" IS NULL;
    `);
    console.log("✓ Backfilled cast_created_at for curated_casts");

    // Backfill cast_replies: extract timestamp from cast_data JSONB
    await db.execute(sql`
      UPDATE "cast_replies" 
      SET "cast_created_at" = CASE 
        WHEN (cast_data->>'timestamp') IS NOT NULL AND (cast_data->>'timestamp') != '' THEN
          (cast_data->>'timestamp')::timestamp
        ELSE NULL
      END
      WHERE "cast_created_at" IS NULL;
    `);
    console.log("✓ Backfilled cast_created_at for cast_replies");

    // Create index on curated_casts.cast_created_at
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "curated_casts_cast_created_at_idx" 
      ON "curated_casts" ("cast_created_at");
    `);
    console.log("✓ Created index: curated_casts_cast_created_at_idx");

    // Create composite index on cast_replies (curated_cast_hash, cast_created_at) for efficient sorting
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "cast_replies_curated_cast_hash_cast_created_at_idx" 
      ON "cast_replies" ("curated_cast_hash", "cast_created_at");
    `);
    console.log("✓ Created index: cast_replies_curated_cast_hash_cast_created_at_idx");

    console.log("\nMigration completed successfully!");
    console.log("- Added castCreatedAt columns to both tables");
    console.log("- Backfilled existing data from castData.timestamp");
    console.log("- Created indexes for efficient sorting");
  } catch (error) {
    console.error("Error running migration:", error);
    process.exit(1);
  }
}

runMigration();

