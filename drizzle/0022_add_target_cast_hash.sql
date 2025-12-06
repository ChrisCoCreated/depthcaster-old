-- Add target_cast_hash column to quality_feedback table
--> statement-breakpoint
ALTER TABLE "quality_feedback" ADD COLUMN IF NOT EXISTS "target_cast_hash" text;
--> statement-breakpoint
-- Backfill existing records: set target_cast_hash to cast_hash for existing records
UPDATE "quality_feedback" SET "target_cast_hash" = "cast_hash" WHERE "target_cast_hash" IS NULL;
--> statement-breakpoint
-- Make target_cast_hash NOT NULL after backfill
ALTER TABLE "quality_feedback" ALTER COLUMN "target_cast_hash" SET NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quality_feedback_target_cast_hash_idx" ON "quality_feedback" USING btree ("target_cast_hash");
