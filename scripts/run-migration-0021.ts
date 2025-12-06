import { resolve } from "path";
import { config } from "dotenv";

// Load environment variables
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function runMigration() {
  try {
    console.log("Running migration 0021: Add quality feedback tracking table...");

    // Create quality_feedback table
    console.log("Creating quality_feedback table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "quality_feedback" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "cast_hash" text NOT NULL REFERENCES "curated_casts"("cast_hash") ON DELETE CASCADE,
        "curator_fid" bigint NOT NULL REFERENCES "users"("fid"),
        "root_cast_hash" text,
        "feedback" text NOT NULL,
        "previous_quality_score" integer NOT NULL,
        "new_quality_score" integer NOT NULL,
        "deepseek_reasoning" text,
        "is_admin" boolean DEFAULT false NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `);
    console.log("✓ Created quality_feedback table");

    // Create index on cast_hash
    console.log("Creating index on cast_hash...");
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "quality_feedback_cast_hash_idx" ON "quality_feedback" USING btree ("cast_hash");
    `);
    console.log("✓ Created cast_hash index");

    // Create index on curator_fid
    console.log("Creating index on curator_fid...");
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "quality_feedback_curator_fid_idx" ON "quality_feedback" USING btree ("curator_fid");
    `);
    console.log("✓ Created curator_fid index");

    // Create index on root_cast_hash
    console.log("Creating index on root_cast_hash...");
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "quality_feedback_root_cast_hash_idx" ON "quality_feedback" USING btree ("root_cast_hash");
    `);
    console.log("✓ Created root_cast_hash index");

    // Create index on created_at
    console.log("Creating index on created_at...");
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "quality_feedback_created_at_idx" ON "quality_feedback" USING btree ("created_at");
    `);
    console.log("✓ Created created_at index");

    // Create composite index on cast_hash and created_at
    console.log("Creating composite index on cast_hash and created_at...");
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "quality_feedback_cast_hash_created_at_idx" ON "quality_feedback" USING btree ("cast_hash", "created_at");
    `);
    console.log("✓ Created composite index");

    console.log("\n✅ Migration 0021 completed successfully!");
    console.log("- Created quality_feedback table");
    console.log("- Created indexes on cast_hash, curator_fid, root_cast_hash, created_at, and composite index");
  } catch (error) {
    console.error("❌ Error running migration:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runMigration();
