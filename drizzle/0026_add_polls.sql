-- Create polls table
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "polls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cast_hash" text NOT NULL,
	"question" text NOT NULL,
	"created_by" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "polls_cast_hash_unique" ON "polls" ("cast_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "polls_cast_hash_idx" ON "polls" ("cast_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "polls_created_by_idx" ON "polls" ("created_by");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "polls" ADD CONSTRAINT "polls_cast_hash_curated_casts_cast_hash_fk" FOREIGN KEY ("cast_hash") REFERENCES "curated_casts"("cast_hash") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "polls" ADD CONSTRAINT "polls_created_by_users_fid_fk" FOREIGN KEY ("created_by") REFERENCES "users"("fid") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Create poll_options table
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "poll_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_id" uuid NOT NULL,
	"option_text" text NOT NULL,
	"order" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "poll_options_poll_id_idx" ON "poll_options" ("poll_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "poll_options_poll_id_order_idx" ON "poll_options" ("poll_id","order");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "poll_options" ADD CONSTRAINT "poll_options_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "polls"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Create poll_responses table
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "poll_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_id" uuid NOT NULL,
	"user_fid" bigint NOT NULL,
	"rankings" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "poll_responses_poll_user_unique" ON "poll_responses" ("poll_id","user_fid");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "poll_responses_poll_id_idx" ON "poll_responses" ("poll_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "poll_responses_user_fid_idx" ON "poll_responses" ("user_fid");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "poll_responses" ADD CONSTRAINT "poll_responses_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "polls"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "poll_responses" ADD CONSTRAINT "poll_responses_user_fid_users_fid_fk" FOREIGN KEY ("user_fid") REFERENCES "users"("fid") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

