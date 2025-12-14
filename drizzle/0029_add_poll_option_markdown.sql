-- Add markdown column to poll_options table
--> statement-breakpoint
ALTER TABLE "poll_options" ADD COLUMN IF NOT EXISTS "markdown" text;

