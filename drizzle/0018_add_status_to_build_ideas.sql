-- Add status column to build_ideas table
--> statement-breakpoint
ALTER TABLE "build_ideas" ADD COLUMN IF NOT EXISTS "status" text;
--> statement-breakpoint
-- Create index on status column
CREATE INDEX IF NOT EXISTS "build_ideas_status_idx" ON "build_ideas" USING btree ("status");
