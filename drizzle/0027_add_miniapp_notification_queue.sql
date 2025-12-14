-- Add miniapp notification queue table for daily/weekly batching
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "miniapp_notification_queue" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_fid" bigint NOT NULL REFERENCES "users"("fid") ON DELETE CASCADE,
  "cast_hash" text NOT NULL,
  "cast_data" jsonb NOT NULL,
  "notification_type" text NOT NULL DEFAULT 'new_curated_cast',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "scheduled_for" timestamp NOT NULL,
  "sent_at" timestamp
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "miniapp_notification_queue_user_fid_idx" ON "miniapp_notification_queue" USING btree ("user_fid");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "miniapp_notification_queue_scheduled_for_idx" ON "miniapp_notification_queue" USING btree ("scheduled_for");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "miniapp_notification_queue_sent_at_idx" ON "miniapp_notification_queue" USING btree ("sent_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "miniapp_notification_queue_user_fid_scheduled_for_idx" ON "miniapp_notification_queue" USING btree ("user_fid", "scheduled_for");

