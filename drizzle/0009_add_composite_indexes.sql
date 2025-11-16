-- Add composite indexes for optimized curated feed queries
--> statement-breakpoint
-- Index for curator_cast_curations to optimize sorting by cast_hash and created_at
CREATE INDEX IF NOT EXISTS "curator_cast_curations_cast_hash_created_at_idx" ON "curator_cast_curations" ("cast_hash","created_at");
--> statement-breakpoint
-- Index for cast_replies to optimize sorting by curated_cast_hash and created_at
CREATE INDEX IF NOT EXISTS "cast_replies_curated_cast_hash_created_at_idx" ON "cast_replies" ("curated_cast_hash","created_at");



