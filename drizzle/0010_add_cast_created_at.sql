-- Add cast_created_at column to curated_casts and cast_replies tables
--> statement-breakpoint
-- Add cast_created_at column to curated_casts (nullable initially)
ALTER TABLE "curated_casts" ADD COLUMN IF NOT EXISTS "cast_created_at" timestamp;
--> statement-breakpoint
-- Add cast_created_at column to cast_replies (nullable initially)
ALTER TABLE "cast_replies" ADD COLUMN IF NOT EXISTS "cast_created_at" timestamp;
--> statement-breakpoint
-- Backfill curated_casts: extract timestamp from cast_data JSONB
UPDATE "curated_casts" 
SET "cast_created_at" = CASE 
  WHEN (cast_data->>'timestamp') IS NOT NULL AND (cast_data->>'timestamp') != '' THEN
    (cast_data->>'timestamp')::timestamp
  ELSE NULL
END
WHERE "cast_created_at" IS NULL;
--> statement-breakpoint
-- Backfill cast_replies: extract timestamp from cast_data JSONB
UPDATE "cast_replies" 
SET "cast_created_at" = CASE 
  WHEN (cast_data->>'timestamp') IS NOT NULL AND (cast_data->>'timestamp') != '' THEN
    (cast_data->>'timestamp')::timestamp
  ELSE NULL
END
WHERE "cast_created_at" IS NULL;
--> statement-breakpoint
-- Create index on curated_casts.cast_created_at
CREATE INDEX IF NOT EXISTS "curated_casts_cast_created_at_idx" ON "curated_casts" ("cast_created_at");
--> statement-breakpoint
-- Create composite index on cast_replies (curated_cast_hash, cast_created_at) for efficient sorting
CREATE INDEX IF NOT EXISTS "cast_replies_curated_cast_hash_cast_created_at_idx" ON "cast_replies" ("curated_cast_hash", "cast_created_at");

