ALTER TABLE "collection_casts" ADD COLUMN "order" integer;--> statement-breakpoint
ALTER TABLE "collections" ADD COLUMN "order_mode" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "collections" ADD COLUMN "order_direction" text DEFAULT 'desc' NOT NULL;--> statement-breakpoint
ALTER TABLE "feed_view_sessions" ADD COLUMN "session_start_time" timestamp;--> statement-breakpoint
CREATE INDEX "collection_casts_order_idx" ON "collection_casts" USING btree ("order");--> statement-breakpoint
CREATE INDEX "feed_view_sessions_session_start_time_idx" ON "feed_view_sessions" USING btree ("session_start_time");