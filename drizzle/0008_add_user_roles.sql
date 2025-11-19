-- Create user_roles table
CREATE TABLE IF NOT EXISTS "user_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_fid" bigint NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Add foreign key constraint
DO $$ BEGIN
 ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_fid_users_fid_fk" FOREIGN KEY ("user_fid") REFERENCES "users"("fid") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- Create unique constraint on (user_fid, role)
CREATE UNIQUE INDEX IF NOT EXISTS "user_role_unique" ON "user_roles" ("user_fid","role");
--> statement-breakpoint
-- Create index on user_fid
CREATE INDEX IF NOT EXISTS "user_roles_user_fid_idx" ON "user_roles" ("user_fid");
--> statement-breakpoint
-- Migrate existing role data from users.role to user_roles
INSERT INTO "user_roles" ("user_fid", "role", "created_at")
SELECT "fid", "role", COALESCE("created_at", NOW())
FROM "users"
WHERE "role" IS NOT NULL
  AND "role" != ''
  AND NOT EXISTS (
    SELECT 1 FROM "user_roles" ur 
    WHERE ur."user_fid" = "users"."fid" AND ur."role" = "users"."role"
  );







