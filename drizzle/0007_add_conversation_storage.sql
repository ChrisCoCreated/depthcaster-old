-- Add conversationFetchedAt to curated_casts table
ALTER TABLE "curated_casts" ADD COLUMN "conversation_fetched_at" timestamp;

-- Create cast_replies table
CREATE TABLE IF NOT EXISTS "cast_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"curated_cast_hash" text NOT NULL,
	"reply_cast_hash" text NOT NULL,
	"cast_data" jsonb NOT NULL,
	"parent_cast_hash" text,
	"root_cast_hash" text NOT NULL,
	"reply_depth" integer DEFAULT 0 NOT NULL,
	"is_quote_cast" boolean DEFAULT false NOT NULL,
	"quoted_cast_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);

-- Add foreign key constraint
DO $$ BEGIN
 ALTER TABLE "cast_replies" ADD CONSTRAINT "cast_replies_curated_cast_hash_curated_casts_cast_hash_fk" FOREIGN KEY ("curated_cast_hash") REFERENCES "curated_casts"("cast_hash") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Create indexes
CREATE UNIQUE INDEX IF NOT EXISTS "reply_cast_hash_unique" ON "cast_replies" ("reply_cast_hash");
CREATE INDEX IF NOT EXISTS "cast_replies_curated_cast_hash_idx" ON "cast_replies" ("curated_cast_hash");
CREATE INDEX IF NOT EXISTS "cast_replies_quoted_cast_hash_idx" ON "cast_replies" ("quoted_cast_hash");
CREATE INDEX IF NOT EXISTS "cast_replies_curated_cast_hash_reply_depth_idx" ON "cast_replies" ("curated_cast_hash","reply_depth");

