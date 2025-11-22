CREATE TABLE IF NOT EXISTS "cast_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cast_hash" text NOT NULL,
	"tag" text NOT NULL,
	"admin_fid" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cast_hash_tag_unique" ON "cast_tags" ("cast_hash","tag");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cast_tags_cast_hash_idx" ON "cast_tags" ("cast_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cast_tags_tag_idx" ON "cast_tags" ("tag");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cast_tags_admin_fid_idx" ON "cast_tags" ("admin_fid");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cast_tags" ADD CONSTRAINT "cast_tags_admin_fid_users_fid_fk" FOREIGN KEY ("admin_fid") REFERENCES "users"("fid") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "users" SET "role" = 'superadmin' WHERE "fid" = 5701;--> statement-breakpoint
UPDATE "users" SET "role" = 'admin' WHERE "fid" = 5406;

