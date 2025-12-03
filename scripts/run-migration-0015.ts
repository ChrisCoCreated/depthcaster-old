import { resolve } from "path";
import { config } from "dotenv";

// Load environment variables
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function runMigration() {
  try {
    console.log("Running migration 0015: Add quality and categorization fields...");

    // Add quality fields to curated_casts table
    console.log("Adding quality fields to curated_casts table...");
    await db.execute(sql`
      ALTER TABLE "curated_casts" ADD COLUMN IF NOT EXISTS "quality_score" integer;
    `);
    await db.execute(sql`
      ALTER TABLE "curated_casts" ADD COLUMN IF NOT EXISTS "category" text;
    `);
    await db.execute(sql`
      ALTER TABLE "curated_casts" ADD COLUMN IF NOT EXISTS "quality_analyzed_at" timestamp;
    `);
    console.log("✓ Added quality fields to curated_casts");

    // Add quality fields to cast_replies table
    console.log("Adding quality fields to cast_replies table...");
    await db.execute(sql`
      ALTER TABLE "cast_replies" ADD COLUMN IF NOT EXISTS "quality_score" integer;
    `);
    await db.execute(sql`
      ALTER TABLE "cast_replies" ADD COLUMN IF NOT EXISTS "category" text;
    `);
    await db.execute(sql`
      ALTER TABLE "cast_replies" ADD COLUMN IF NOT EXISTS "quality_analyzed_at" timestamp;
    `);
    console.log("✓ Added quality fields to cast_replies");

    // Create indexes for curated_casts
    console.log("Creating indexes for curated_casts...");
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "curated_casts_quality_score_idx" ON "curated_casts" USING btree ("quality_score");
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "curated_casts_category_idx" ON "curated_casts" USING btree ("category");
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "curated_casts_quality_category_idx" ON "curated_casts" USING btree ("quality_score", "category");
    `);
    console.log("✓ Created indexes for curated_casts");

    // Create indexes for cast_replies
    console.log("Creating indexes for cast_replies...");
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "cast_replies_quality_score_idx" ON "cast_replies" USING btree ("quality_score");
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "cast_replies_category_idx" ON "cast_replies" USING btree ("category");
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "cast_replies_quality_category_idx" ON "cast_replies" USING btree ("quality_score", "category");
    `);
    console.log("✓ Created indexes for cast_replies");

    console.log("\n✅ Migration 0015 completed successfully!");
    console.log("- Added quality_score, category, and quality_analyzed_at to curated_casts");
    console.log("- Added quality_score, category, and quality_analyzed_at to cast_replies");
    console.log("- Created indexes for efficient filtering and sorting");
  } catch (error) {
    console.error("❌ Error running migration:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runMigration();








