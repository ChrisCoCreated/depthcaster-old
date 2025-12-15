-- Add activity_events table and user activity tracking columns
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "first_sign_in_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_qualifying_activity_at" timestamp;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_fid" bigint NOT NULL,
	"type" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ 
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint 
		WHERE conname = 'activity_events_user_fid_users_fid_fk'
	) THEN
		ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_user_fid_users_fid_fk" FOREIGN KEY ("user_fid") REFERENCES "public"."users"("fid") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_events_user_fid_type_created_at_idx" ON "activity_events" USING btree ("user_fid","type","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_events_user_fid_created_at_idx" ON "activity_events" USING btree ("user_fid","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_events_created_at_idx" ON "activity_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_last_qualifying_activity_at_idx" ON "users" USING btree ("last_qualifying_activity_at");


