-- Add hidden_embed_urls column to collections table
--> statement-breakpoint
ALTER TABLE "collections" ADD COLUMN IF NOT EXISTS "hidden_embed_urls" jsonb;

