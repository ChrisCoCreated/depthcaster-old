-- Add closed_at column to polls table
--> statement-breakpoint
ALTER TABLE "polls" ADD COLUMN "closed_at" timestamp;

