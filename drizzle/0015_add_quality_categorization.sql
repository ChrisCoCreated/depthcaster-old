-- Add quality and category fields to curated_casts table
--> statement-breakpoint
ALTER TABLE "curated_casts" ADD COLUMN IF NOT EXISTS "quality_score" integer;
--> statement-breakpoint
ALTER TABLE "curated_casts" ADD COLUMN IF NOT EXISTS "category" text;
--> statement-breakpoint
ALTER TABLE "curated_casts" ADD COLUMN IF NOT EXISTS "quality_analyzed_at" timestamp;
--> statement-breakpoint
-- Add quality and category fields to cast_replies table
ALTER TABLE "cast_replies" ADD COLUMN IF NOT EXISTS "quality_score" integer;
--> statement-breakpoint
ALTER TABLE "cast_replies" ADD COLUMN IF NOT EXISTS "category" text;
--> statement-breakpoint
ALTER TABLE "cast_replies" ADD COLUMN IF NOT EXISTS "quality_analyzed_at" timestamp;
--> statement-breakpoint
-- Create indexes for quality filtering and sorting
CREATE INDEX IF NOT EXISTS "curated_casts_quality_score_idx" ON "curated_casts" USING btree ("quality_score");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "curated_casts_category_idx" ON "curated_casts" USING btree ("category");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "curated_casts_quality_category_idx" ON "curated_casts" USING btree ("quality_score", "category");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cast_replies_quality_score_idx" ON "cast_replies" USING btree ("quality_score");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cast_replies_category_idx" ON "cast_replies" USING btree ("category");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cast_replies_quality_category_idx" ON "cast_replies" USING btree ("quality_score", "category");
















