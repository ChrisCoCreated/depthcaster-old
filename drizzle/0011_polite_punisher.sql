CREATE TABLE "thinking_casts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cast_hash" text NOT NULL,
	"cast_data" jsonb NOT NULL,
	"cast_created_at" timestamp,
	"author_fid" bigint,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "thinking_casts_cast_hash_unique" UNIQUE("cast_hash")
);
--> statement-breakpoint
DROP INDEX "feed_view_sessions_session_start_time_idx";--> statement-breakpoint
ALTER TABLE "thinking_casts" ADD CONSTRAINT "thinking_casts_author_fid_users_fid_fk" FOREIGN KEY ("author_fid") REFERENCES "public"."users"("fid") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "thinking_casts_cast_hash_idx" ON "thinking_casts" USING btree ("cast_hash");--> statement-breakpoint
CREATE INDEX "thinking_casts_cast_created_at_idx" ON "thinking_casts" USING btree ("cast_created_at");--> statement-breakpoint
CREATE INDEX "thinking_casts_author_fid_idx" ON "thinking_casts" USING btree ("author_fid");--> statement-breakpoint
ALTER TABLE "collections" DROP COLUMN "order_mode";--> statement-breakpoint
ALTER TABLE "collections" DROP COLUMN "order_direction";--> statement-breakpoint
ALTER TABLE "feed_view_sessions" DROP COLUMN "session_start_time";