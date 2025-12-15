-- Add slug column to polls table
--> statement-breakpoint
ALTER TABLE "polls" ADD COLUMN IF NOT EXISTS "slug" text;

--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "polls_slug_idx" ON "polls"("slug") WHERE "slug" IS NOT NULL;


