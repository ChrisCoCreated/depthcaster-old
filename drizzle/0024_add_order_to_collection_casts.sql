-- Add order column to collection_casts table
--> statement-breakpoint
ALTER TABLE "collection_casts" ADD COLUMN IF NOT EXISTS "order" integer;

-- Create index on order column
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "collection_casts_order_idx" ON "collection_casts" ("order");

