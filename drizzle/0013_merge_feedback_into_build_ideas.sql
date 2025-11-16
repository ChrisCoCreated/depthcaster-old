-- Merge feedback table into build_ideas table
--> statement-breakpoint
-- Add new columns to build_ideas
ALTER TABLE "build_ideas" ADD COLUMN IF NOT EXISTS "type" text DEFAULT 'build-idea' NOT NULL;
ALTER TABLE "build_ideas" ADD COLUMN IF NOT EXISTS "cast_hash" text;
ALTER TABLE "build_ideas" ADD COLUMN IF NOT EXISTS "user_fid" bigint;
--> statement-breakpoint
-- Migrate existing build_ideas to use user_fid (copy from admin_fid)
UPDATE "build_ideas" SET "user_fid" = "admin_fid" WHERE "user_fid" IS NULL;
--> statement-breakpoint
-- Make user_fid NOT NULL after migration
ALTER TABLE "build_ideas" ALTER COLUMN "user_fid" SET NOT NULL;
--> statement-breakpoint
-- Make admin_fid nullable (for backward compatibility, but not required)
ALTER TABLE "build_ideas" ALTER COLUMN "admin_fid" DROP NOT NULL;
--> statement-breakpoint
-- Migrate data from feedback table to build_ideas (if feedback table exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'feedback') THEN
    INSERT INTO "build_ideas" ("title", "description", "cast_hash", "type", "user_fid", "created_at", "updated_at")
    SELECT "title", "description", "cast_hash", 'feedback', "user_fid", "created_at", "updated_at"
    FROM "feedback"
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
--> statement-breakpoint
-- Add foreign key constraint for user_fid (drop old admin_fid constraint if it exists separately)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'build_ideas_user_fid_users_fid_fk'
  ) THEN
    ALTER TABLE "build_ideas" 
      ADD CONSTRAINT "build_ideas_user_fid_users_fid_fk" 
      FOREIGN KEY ("user_fid") REFERENCES "public"."users"("fid") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
-- Create indexes
CREATE INDEX IF NOT EXISTS "build_ideas_user_fid_idx" ON "build_ideas" USING btree ("user_fid");
CREATE INDEX IF NOT EXISTS "build_ideas_type_idx" ON "build_ideas" USING btree ("type");
CREATE INDEX IF NOT EXISTS "build_ideas_cast_hash_idx" ON "build_ideas" USING btree ("cast_hash");
--> statement-breakpoint
-- Drop feedback table if it exists
DROP TABLE IF EXISTS "feedback" CASCADE;

