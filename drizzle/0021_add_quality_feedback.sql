-- Add quality feedback tracking table
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quality_feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "cast_hash" text NOT NULL REFERENCES "curated_casts"("cast_hash") ON DELETE CASCADE,
  "target_cast_hash" text NOT NULL,
  "curator_fid" bigint NOT NULL REFERENCES "users"("fid"),
  "root_cast_hash" text,
  "feedback" text NOT NULL,
  "previous_quality_score" integer NOT NULL,
  "new_quality_score" integer NOT NULL,
  "deepseek_reasoning" text,
  "is_admin" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quality_feedback_cast_hash_idx" ON "quality_feedback" USING btree ("cast_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quality_feedback_target_cast_hash_idx" ON "quality_feedback" USING btree ("target_cast_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quality_feedback_curator_fid_idx" ON "quality_feedback" USING btree ("curator_fid");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quality_feedback_root_cast_hash_idx" ON "quality_feedback" USING btree ("root_cast_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quality_feedback_created_at_idx" ON "quality_feedback" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quality_feedback_cast_hash_created_at_idx" ON "quality_feedback" USING btree ("cast_hash", "created_at");
