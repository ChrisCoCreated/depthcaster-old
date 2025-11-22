import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function runMigration() {
  try {
    console.log("Running migration 0007: Add analytics tables...");

    // Create cast_views table
    console.log("Creating cast_views table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "cast_views" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_fid" bigint,
        "cast_hash" text NOT NULL,
        "author_fid" bigint NOT NULL,
        "feed_type" text,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `);

    // Create cast_views_daily table
    console.log("Creating cast_views_daily table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "cast_views_daily" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "date" timestamp NOT NULL,
        "feed_type" text NOT NULL,
        "cast_hash" text NOT NULL,
        "view_count" integer DEFAULT 0 NOT NULL,
        "unique_users" integer DEFAULT 0 NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
    `);

    // Create feed_view_sessions table
    console.log("Creating feed_view_sessions table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "feed_view_sessions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_fid" bigint,
        "feed_type" text NOT NULL,
        "duration_seconds" integer NOT NULL,
        "sort_by" text,
        "curator_fids" jsonb,
        "pack_ids" jsonb,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `);

    // Create feed_view_sessions_daily table
    console.log("Creating feed_view_sessions_daily table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "feed_view_sessions_daily" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "date" timestamp NOT NULL,
        "feed_type" text NOT NULL,
        "total_sessions" integer DEFAULT 0 NOT NULL,
        "total_duration_seconds" integer DEFAULT 0 NOT NULL,
        "unique_users" integer DEFAULT 0 NOT NULL,
        "avg_duration" integer DEFAULT 0 NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
    `);

    // Create page_views table
    console.log("Creating page_views table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "page_views" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_fid" bigint,
        "page_path" text NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `);

    // Create page_views_daily table
    console.log("Creating page_views_daily table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "page_views_daily" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "date" timestamp NOT NULL,
        "page_path" text NOT NULL,
        "view_count" integer DEFAULT 0 NOT NULL,
        "unique_users" integer DEFAULT 0 NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
    `);

    // Add foreign key constraints
    console.log("Adding foreign key constraints...");
    await db.execute(sql`
      DO $$ BEGIN
        ALTER TABLE "cast_views" ADD CONSTRAINT "cast_views_user_fid_users_fid_fk" 
        FOREIGN KEY ("user_fid") REFERENCES "public"."users"("fid") ON DELETE no action ON UPDATE no action;
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);

    await db.execute(sql`
      DO $$ BEGIN
        ALTER TABLE "feed_view_sessions" ADD CONSTRAINT "feed_view_sessions_user_fid_users_fid_fk" 
        FOREIGN KEY ("user_fid") REFERENCES "public"."users"("fid") ON DELETE no action ON UPDATE no action;
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);

    await db.execute(sql`
      DO $$ BEGIN
        ALTER TABLE "page_views" ADD CONSTRAINT "page_views_user_fid_users_fid_fk" 
        FOREIGN KEY ("user_fid") REFERENCES "public"."users"("fid") ON DELETE no action ON UPDATE no action;
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create indexes (one at a time for Neon compatibility)
    console.log("Creating indexes...");
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "cast_views_cast_hash_idx" ON "cast_views" USING btree ("cast_hash")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "cast_views_feed_type_idx" ON "cast_views" USING btree ("feed_type")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "cast_views_user_fid_idx" ON "cast_views" USING btree ("user_fid")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "cast_views_created_at_idx" ON "cast_views" USING btree ("created_at")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "cast_views_feed_type_created_at_idx" ON "cast_views" USING btree ("feed_type","created_at")`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "cast_views_user_cast_feed_unique" ON "cast_views" USING btree ("user_fid","cast_hash","feed_type")`);

    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "cast_views_daily_date_feed_type_cast_unique" ON "cast_views_daily" USING btree ("date","feed_type","cast_hash")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "cast_views_daily_date_idx" ON "cast_views_daily" USING btree ("date")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "cast_views_daily_feed_type_idx" ON "cast_views_daily" USING btree ("feed_type")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "cast_views_daily_cast_hash_idx" ON "cast_views_daily" USING btree ("cast_hash")`);

    await db.execute(sql`CREATE INDEX IF NOT EXISTS "feed_view_sessions_feed_type_idx" ON "feed_view_sessions" USING btree ("feed_type")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "feed_view_sessions_user_fid_idx" ON "feed_view_sessions" USING btree ("user_fid")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "feed_view_sessions_created_at_idx" ON "feed_view_sessions" USING btree ("created_at")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "feed_view_sessions_feed_type_created_at_idx" ON "feed_view_sessions" USING btree ("feed_type","created_at")`);

    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "feed_view_sessions_daily_date_feed_type_unique" ON "feed_view_sessions_daily" USING btree ("date","feed_type")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "feed_view_sessions_daily_date_idx" ON "feed_view_sessions_daily" USING btree ("date")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "feed_view_sessions_daily_feed_type_idx" ON "feed_view_sessions_daily" USING btree ("feed_type")`);

    await db.execute(sql`CREATE INDEX IF NOT EXISTS "page_views_page_path_idx" ON "page_views" USING btree ("page_path")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "page_views_user_fid_idx" ON "page_views" USING btree ("user_fid")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "page_views_created_at_idx" ON "page_views" USING btree ("created_at")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "page_views_page_path_created_at_idx" ON "page_views" USING btree ("page_path","created_at")`);

    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "page_views_daily_date_page_path_unique" ON "page_views_daily" USING btree ("date","page_path")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "page_views_daily_date_idx" ON "page_views_daily" USING btree ("date")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "page_views_daily_page_path_idx" ON "page_views_daily" USING btree ("page_path")`);

    // Handle build_ideas changes (if needed)
    console.log("Updating build_ideas table...");
    await db.execute(sql`
      ALTER TABLE "build_ideas" ADD COLUMN IF NOT EXISTS "cast_hash" text;
    `);
    await db.execute(sql`
      ALTER TABLE "build_ideas" ADD COLUMN IF NOT EXISTS "type" text DEFAULT 'build-idea' NOT NULL;
    `);
    await db.execute(sql`
      ALTER TABLE "build_ideas" ADD COLUMN IF NOT EXISTS "user_fid" bigint;
    `);

    // Add signer_uuid to users if not exists
    console.log("Updating users table...");
    await db.execute(sql`
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "signer_uuid" text;
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "signer_uuid_idx" ON "users" USING btree ("signer_uuid");
    `);

    // Handle build_ideas constraints and indexes
    await db.execute(sql`
      DO $$ BEGIN
        ALTER TABLE "build_ideas" ADD CONSTRAINT "build_ideas_user_fid_users_fid_fk" 
        FOREIGN KEY ("user_fid") REFERENCES "public"."users"("fid") ON DELETE no action ON UPDATE no action;
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);

    await db.execute(sql`CREATE INDEX IF NOT EXISTS "build_ideas_user_fid_idx" ON "build_ideas" USING btree ("user_fid")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "build_ideas_type_idx" ON "build_ideas" USING btree ("type")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "build_ideas_cast_hash_idx" ON "build_ideas" USING btree ("cast_hash")`);

    // Try to drop admin_fid constraint and index if they exist
    await db.execute(sql`
      DO $$ BEGIN
        ALTER TABLE "build_ideas" DROP CONSTRAINT IF EXISTS "build_ideas_admin_fid_users_fid_fk";
      EXCEPTION WHEN undefined_object THEN null;
      END $$;
    `);

    await db.execute(sql`
      DROP INDEX IF EXISTS "build_ideas_admin_fid_idx";
    `);

    // Try to drop admin_fid column if it exists
    await db.execute(sql`
      DO $$ BEGIN
        ALTER TABLE "build_ideas" DROP COLUMN IF EXISTS "admin_fid";
      EXCEPTION WHEN undefined_column THEN null;
      END $$;
    `);

    // Handle feedback table (drop if exists)
    await db.execute(sql`
      DROP TABLE IF EXISTS "feedback" CASCADE;
    `);

    console.log("✓ Migration 0007 completed successfully!");
    console.log("- Created analytics tables (page_views, feed_view_sessions, cast_views)");
    console.log("- Created aggregation tables (*_daily)");
    console.log("- Updated build_ideas and users tables");
  } catch (error) {
    console.error("Error running migration:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runMigration();
