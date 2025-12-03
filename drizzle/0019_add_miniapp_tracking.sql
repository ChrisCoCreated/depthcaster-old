-- Add miniapp installation tracking table
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "miniapp_installations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_fid" bigint NOT NULL REFERENCES "users"("fid") ON DELETE CASCADE,
  "installed_at" timestamp DEFAULT now() NOT NULL,
  UNIQUE("user_fid")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "miniapp_installations_user_fid_idx" ON "miniapp_installations" USING btree ("user_fid");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "miniapp_installations_installed_at_idx" ON "miniapp_installations" USING btree ("installed_at");



