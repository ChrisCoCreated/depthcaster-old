-- Add poll type and choices support
--> statement-breakpoint
ALTER TABLE "polls" ADD COLUMN IF NOT EXISTS "poll_type" text DEFAULT 'ranking' NOT NULL;

--> statement-breakpoint
ALTER TABLE "polls" ADD COLUMN IF NOT EXISTS "choices" jsonb;

--> statement-breakpoint
ALTER TABLE "poll_responses" ADD COLUMN IF NOT EXISTS "choices" jsonb;

--> statement-breakpoint
ALTER TABLE "poll_responses" ALTER COLUMN "rankings" DROP NOT NULL;

