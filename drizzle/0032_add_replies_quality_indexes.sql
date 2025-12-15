-- Add composite indexes for efficient replies queries with quality filtering and prioritization
--> statement-breakpoint
-- Indexes for quality filtering on curated_cast_hash
CREATE INDEX IF NOT EXISTS "cast_replies_curated_cast_hash_quality_score_idx" ON "cast_replies" ("curated_cast_hash", "quality_score");
--> statement-breakpoint
-- Indexes for quality filtering on quoted_cast_hash
CREATE INDEX IF NOT EXISTS "cast_replies_quoted_cast_hash_quality_score_idx" ON "cast_replies" ("quoted_cast_hash", "quality_score");
--> statement-breakpoint
-- Indexes for quality-sorted queries on curated_cast_hash
CREATE INDEX IF NOT EXISTS "cast_replies_curated_cast_hash_quality_score_cast_created_at_idx" ON "cast_replies" ("curated_cast_hash", "quality_score", "cast_created_at");
--> statement-breakpoint
-- Indexes for quality-sorted queries on quoted_cast_hash
CREATE INDEX IF NOT EXISTS "cast_replies_quoted_cast_hash_quality_score_cast_created_at_idx" ON "cast_replies" ("quoted_cast_hash", "quality_score", "cast_created_at");

