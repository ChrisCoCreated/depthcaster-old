import { resolve } from "path";
import { config } from "dotenv";

// Load environment variables
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function runMigration() {
  try {
    console.log("Running migration 0012: Extract cast metadata to columns...");

    // Add columns to curated_casts table
    console.log("Adding columns to curated_casts...");
    await db.execute(sql`
      ALTER TABLE "curated_casts" ADD COLUMN IF NOT EXISTS "cast_text" text;
    `);
    await db.execute(sql`
      ALTER TABLE "curated_casts" ADD COLUMN IF NOT EXISTS "cast_text_length" integer DEFAULT 0;
    `);
    await db.execute(sql`
      ALTER TABLE "curated_casts" ADD COLUMN IF NOT EXISTS "author_fid" bigint;
    `);
    await db.execute(sql`
      ALTER TABLE "curated_casts" ADD COLUMN IF NOT EXISTS "likes_count" integer DEFAULT 0;
    `);
    await db.execute(sql`
      ALTER TABLE "curated_casts" ADD COLUMN IF NOT EXISTS "recasts_count" integer DEFAULT 0;
    `);
    await db.execute(sql`
      ALTER TABLE "curated_casts" ADD COLUMN IF NOT EXISTS "replies_count" integer DEFAULT 0;
    `);
    await db.execute(sql`
      ALTER TABLE "curated_casts" ADD COLUMN IF NOT EXISTS "engagement_score" integer DEFAULT 0;
    `);
    await db.execute(sql`
      ALTER TABLE "curated_casts" ADD COLUMN IF NOT EXISTS "parent_hash" text;
    `);
    console.log("✓ Added columns to curated_casts");

    // Add columns to cast_replies table
    console.log("Adding columns to cast_replies...");
    await db.execute(sql`
      ALTER TABLE "cast_replies" ADD COLUMN IF NOT EXISTS "cast_text" text;
    `);
    await db.execute(sql`
      ALTER TABLE "cast_replies" ADD COLUMN IF NOT EXISTS "cast_text_length" integer DEFAULT 0;
    `);
    await db.execute(sql`
      ALTER TABLE "cast_replies" ADD COLUMN IF NOT EXISTS "author_fid" bigint;
    `);
    await db.execute(sql`
      ALTER TABLE "cast_replies" ADD COLUMN IF NOT EXISTS "likes_count" integer DEFAULT 0;
    `);
    await db.execute(sql`
      ALTER TABLE "cast_replies" ADD COLUMN IF NOT EXISTS "recasts_count" integer DEFAULT 0;
    `);
    await db.execute(sql`
      ALTER TABLE "cast_replies" ADD COLUMN IF NOT EXISTS "replies_count" integer DEFAULT 0;
    `);
    await db.execute(sql`
      ALTER TABLE "cast_replies" ADD COLUMN IF NOT EXISTS "engagement_score" integer DEFAULT 0;
    `);
    console.log("✓ Added columns to cast_replies");

    // Backfill curated_casts from JSONB
    console.log("Backfilling curated_casts from JSONB...");
    await db.execute(sql`
      UPDATE "curated_casts" 
      SET 
        "cast_text" = CASE WHEN (cast_data->>'text') IS NOT NULL THEN (cast_data->>'text') ELSE NULL END,
        "cast_text_length" = CASE 
          WHEN (cast_data->>'text') IS NOT NULL THEN LENGTH(cast_data->>'text')
          ELSE 0
        END,
        "author_fid" = CASE 
          WHEN (cast_data->'author'->>'fid') IS NOT NULL THEN (cast_data->'author'->>'fid')::bigint
          ELSE NULL
        END,
        "likes_count" = COALESCE(
          (cast_data->'reactions'->>'likes_count')::integer,
          CASE 
            WHEN jsonb_typeof(cast_data->'reactions'->'likes') = 'array' 
            THEN jsonb_array_length(cast_data->'reactions'->'likes')
            ELSE 0
          END,
          0
        ),
        "recasts_count" = COALESCE(
          (cast_data->'reactions'->>'recasts_count')::integer,
          CASE 
            WHEN jsonb_typeof(cast_data->'reactions'->'recasts') = 'array' 
            THEN jsonb_array_length(cast_data->'reactions'->'recasts')
            ELSE 0
          END,
          0
        ),
        "replies_count" = COALESCE((cast_data->'replies'->>'count')::integer, 0),
        "engagement_score" = (
          COALESCE((cast_data->'replies'->>'count')::integer, 0) * 4 +
          COALESCE(
            (cast_data->'reactions'->>'recasts_count')::integer,
            CASE 
              WHEN jsonb_typeof(cast_data->'reactions'->'recasts') = 'array' 
              THEN jsonb_array_length(cast_data->'reactions'->'recasts')
              ELSE 0
            END,
            0
          ) * 2 +
          COALESCE(
            (cast_data->'reactions'->>'likes_count')::integer,
            CASE 
              WHEN jsonb_typeof(cast_data->'reactions'->'likes') = 'array' 
              THEN jsonb_array_length(cast_data->'reactions'->'likes')
              ELSE 0
            END,
            0
          )
        ),
        "parent_hash" = CASE WHEN (cast_data->>'parent_hash') IS NOT NULL THEN (cast_data->>'parent_hash') ELSE NULL END
      WHERE "cast_text" IS NULL OR "cast_text_length" = 0 OR "author_fid" IS NULL;
    `);
    console.log("✓ Backfilled curated_casts");

    // Backfill cast_replies from JSONB
    console.log("Backfilling cast_replies from JSONB...");
    await db.execute(sql`
      UPDATE "cast_replies" 
      SET 
        "cast_text" = CASE WHEN (cast_data->>'text') IS NOT NULL THEN (cast_data->>'text') ELSE NULL END,
        "cast_text_length" = CASE 
          WHEN (cast_data->>'text') IS NOT NULL THEN LENGTH(cast_data->>'text')
          ELSE 0
        END,
        "author_fid" = CASE 
          WHEN (cast_data->'author'->>'fid') IS NOT NULL THEN (cast_data->'author'->>'fid')::bigint
          ELSE NULL
        END,
        "likes_count" = COALESCE(
          (cast_data->'reactions'->>'likes_count')::integer,
          CASE 
            WHEN jsonb_typeof(cast_data->'reactions'->'likes') = 'array' 
            THEN jsonb_array_length(cast_data->'reactions'->'likes')
            ELSE 0
          END,
          0
        ),
        "recasts_count" = COALESCE(
          (cast_data->'reactions'->>'recasts_count')::integer,
          CASE 
            WHEN jsonb_typeof(cast_data->'reactions'->'recasts') = 'array' 
            THEN jsonb_array_length(cast_data->'reactions'->'recasts')
            ELSE 0
          END,
          0
        ),
        "replies_count" = COALESCE((cast_data->'replies'->>'count')::integer, 0),
        "engagement_score" = (
          COALESCE((cast_data->'replies'->>'count')::integer, 0) * 4 +
          COALESCE(
            (cast_data->'reactions'->>'recasts_count')::integer,
            CASE 
              WHEN jsonb_typeof(cast_data->'reactions'->'recasts') = 'array' 
              THEN jsonb_array_length(cast_data->'reactions'->'recasts')
              ELSE 0
            END,
            0
          ) * 2 +
          COALESCE(
            (cast_data->'reactions'->>'likes_count')::integer,
            CASE 
              WHEN jsonb_typeof(cast_data->'reactions'->'likes') = 'array' 
              THEN jsonb_array_length(cast_data->'reactions'->'likes')
              ELSE 0
            END,
            0
          )
        )
      WHERE "cast_text" IS NULL OR "cast_text_length" = 0 OR "author_fid" IS NULL;
    `);
    console.log("✓ Backfilled cast_replies");

    // Clean up invalid author_fid values (set to NULL if user doesn't exist)
    console.log("Cleaning up invalid author_fid references...");
    await db.execute(sql`
      UPDATE "curated_casts" 
      SET "author_fid" = NULL 
      WHERE "author_fid" IS NOT NULL 
      AND NOT EXISTS (SELECT 1 FROM "users" WHERE "fid" = "curated_casts"."author_fid");
    `);
    await db.execute(sql`
      UPDATE "cast_replies" 
      SET "author_fid" = NULL 
      WHERE "author_fid" IS NOT NULL 
      AND NOT EXISTS (SELECT 1 FROM "users" WHERE "fid" = "cast_replies"."author_fid");
    `);
    console.log("✓ Cleaned up invalid author_fid references");

    // Add foreign key constraints (check if they exist first)
    console.log("Adding foreign key constraints...");
    try {
      await db.execute(sql`
        DO $$ 
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'curated_casts_author_fid_fkey'
          ) THEN
            ALTER TABLE "curated_casts" 
              ADD CONSTRAINT "curated_casts_author_fid_fkey" 
              FOREIGN KEY ("author_fid") REFERENCES "users"("fid") ON DELETE SET NULL;
          END IF;
        END $$;
      `);
      await db.execute(sql`
        DO $$ 
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'cast_replies_author_fid_fkey'
          ) THEN
            ALTER TABLE "cast_replies" 
              ADD CONSTRAINT "cast_replies_author_fid_fkey" 
              FOREIGN KEY ("author_fid") REFERENCES "users"("fid") ON DELETE SET NULL;
          END IF;
        END $$;
      `);
      console.log("✓ Added foreign key constraints");
    } catch (error: any) {
      // Constraint might already exist, continue
      if (error.message?.includes("already exists")) {
        console.log("✓ Foreign key constraints already exist");
      } else {
        throw error;
      }
    }

    // Create indexes
    console.log("Creating indexes...");
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "curated_casts_cast_text_length_engagement_score_idx" 
        ON "curated_casts" ("cast_text_length", "engagement_score");
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "curated_casts_author_fid_cast_created_at_idx" 
        ON "curated_casts" ("author_fid", "cast_created_at");
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "curated_casts_parent_hash_idx" 
        ON "curated_casts" ("parent_hash");
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "cast_replies_cast_text_length_engagement_score_idx" 
        ON "cast_replies" ("cast_text_length", "engagement_score");
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "cast_replies_author_fid_cast_created_at_idx" 
        ON "cast_replies" ("author_fid", "cast_created_at");
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "cast_replies_parent_hash_idx" 
        ON "cast_replies" ("parent_cast_hash");
    `);
    console.log("✓ Created indexes");

    console.log("\nMigration completed successfully!");
    console.log("- Added metadata columns to curated_casts and cast_replies");
    console.log("- Backfilled existing data from JSONB");
    console.log("- Added foreign key constraints for author_fid");
    console.log("- Created indexes for efficient querying");
  } catch (error) {
    console.error("Error running migration:", error);
    process.exit(1);
  }
}

runMigration();

