-- Add signer_uuid column to users table
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "signer_uuid" text;
--> statement-breakpoint
-- Create index for signer_uuid lookups
CREATE INDEX IF NOT EXISTS "signer_uuid_idx" ON "users" USING btree ("signer_uuid");


