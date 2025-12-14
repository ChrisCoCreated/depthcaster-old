-- Add ordering fields to collections table
--> statement-breakpoint
ALTER TABLE "collections" ADD COLUMN IF NOT EXISTS "order_mode" text DEFAULT 'manual' NOT NULL;

--> statement-breakpoint
ALTER TABLE "collections" ADD COLUMN IF NOT EXISTS "order_direction" text DEFAULT 'desc' NOT NULL;








