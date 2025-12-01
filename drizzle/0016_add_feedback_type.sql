-- Add feedback_type column to build_ideas table
--> statement-breakpoint
ALTER TABLE "build_ideas" ADD COLUMN IF NOT EXISTS "feedback_type" text;
--> statement-breakpoint
-- Set default value for existing feedback records
UPDATE "build_ideas" SET "feedback_type" = 'feedback' WHERE "type" = 'feedback' AND "feedback_type" IS NULL;
