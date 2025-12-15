-- Add allocations column for distribution poll type
--> statement-breakpoint
ALTER TABLE "poll_responses" ADD COLUMN IF NOT EXISTS "allocations" jsonb;

