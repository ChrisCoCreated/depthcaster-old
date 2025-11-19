-- Extract frequently queried cast fields from JSONB to columns
--> statement-breakpoint
-- Add columns to curated_casts table
ALTER TABLE "curated_casts" ADD COLUMN IF NOT EXISTS "cast_text" text;
ALTER TABLE "curated_casts" ADD COLUMN IF NOT EXISTS "cast_text_length" integer DEFAULT 0;
ALTER TABLE "curated_casts" ADD COLUMN IF NOT EXISTS "author_fid" bigint;
ALTER TABLE "curated_casts" ADD COLUMN IF NOT EXISTS "likes_count" integer DEFAULT 0;
ALTER TABLE "curated_casts" ADD COLUMN IF NOT EXISTS "recasts_count" integer DEFAULT 0;
ALTER TABLE "curated_casts" ADD COLUMN IF NOT EXISTS "replies_count" integer DEFAULT 0;
ALTER TABLE "curated_casts" ADD COLUMN IF NOT EXISTS "engagement_score" integer DEFAULT 0;
ALTER TABLE "curated_casts" ADD COLUMN IF NOT EXISTS "parent_hash" text;
--> statement-breakpoint
-- Add columns to cast_replies table
ALTER TABLE "cast_replies" ADD COLUMN IF NOT EXISTS "cast_text" text;
ALTER TABLE "cast_replies" ADD COLUMN IF NOT EXISTS "cast_text_length" integer DEFAULT 0;
ALTER TABLE "cast_replies" ADD COLUMN IF NOT EXISTS "author_fid" bigint;
ALTER TABLE "cast_replies" ADD COLUMN IF NOT EXISTS "likes_count" integer DEFAULT 0;
ALTER TABLE "cast_replies" ADD COLUMN IF NOT EXISTS "recasts_count" integer DEFAULT 0;
ALTER TABLE "cast_replies" ADD COLUMN IF NOT EXISTS "replies_count" integer DEFAULT 0;
ALTER TABLE "cast_replies" ADD COLUMN IF NOT EXISTS "engagement_score" integer DEFAULT 0;
--> statement-breakpoint
-- Backfill curated_casts from JSONB
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
--> statement-breakpoint
-- Backfill cast_replies from JSONB
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
--> statement-breakpoint
-- Add foreign key constraint for author_fid
ALTER TABLE "curated_casts" 
  ADD CONSTRAINT "curated_casts_author_fid_fkey" 
  FOREIGN KEY ("author_fid") REFERENCES "users"("fid") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "cast_replies" 
  ADD CONSTRAINT "cast_replies_author_fid_fkey" 
  FOREIGN KEY ("author_fid") REFERENCES "users"("fid") ON DELETE SET NULL;
--> statement-breakpoint
-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS "curated_casts_cast_text_length_engagement_score_idx" 
  ON "curated_casts" ("cast_text_length", "engagement_score");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "curated_casts_author_fid_cast_created_at_idx" 
  ON "curated_casts" ("author_fid", "cast_created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "curated_casts_parent_hash_idx" 
  ON "curated_casts" ("parent_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cast_replies_cast_text_length_engagement_score_idx" 
  ON "cast_replies" ("cast_text_length", "engagement_score");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cast_replies_author_fid_cast_created_at_idx" 
  ON "cast_replies" ("author_fid", "cast_created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cast_replies_parent_hash_idx" 
  ON "cast_replies" ("parent_hash");





