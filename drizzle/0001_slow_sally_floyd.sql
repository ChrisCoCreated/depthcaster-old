CREATE TABLE "curated_cast_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"curated_cast_hash" text NOT NULL,
	"reply_hash" text NOT NULL,
	"reply_data" jsonb NOT NULL,
	"author_fid" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "curated_cast_replies_reply_hash_unique" UNIQUE("reply_hash")
);
--> statement-breakpoint
CREATE TABLE "curated_casts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cast_hash" text NOT NULL,
	"cast_data" jsonb NOT NULL,
	"curator_fid" bigint,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_fid" bigint NOT NULL,
	"type" text NOT NULL,
	"cast_hash" text NOT NULL,
	"cast_data" jsonb NOT NULL,
	"author_fid" bigint NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_watches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"watcher_fid" bigint NOT NULL,
	"watched_fid" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"neynar_webhook_id" text NOT NULL,
	"type" text NOT NULL,
	"config" jsonb NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "webhooks_neynar_webhook_id_unique" UNIQUE("neynar_webhook_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" text;--> statement-breakpoint
ALTER TABLE "curated_cast_replies" ADD CONSTRAINT "curated_cast_replies_curated_cast_hash_curated_casts_cast_hash_fk" FOREIGN KEY ("curated_cast_hash") REFERENCES "public"."curated_casts"("cast_hash") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curated_casts" ADD CONSTRAINT "curated_casts_curator_fid_users_fid_fk" FOREIGN KEY ("curator_fid") REFERENCES "public"."users"("fid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_user_fid_users_fid_fk" FOREIGN KEY ("user_fid") REFERENCES "public"."users"("fid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_watches" ADD CONSTRAINT "user_watches_watcher_fid_users_fid_fk" FOREIGN KEY ("watcher_fid") REFERENCES "public"."users"("fid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_watches" ADD CONSTRAINT "user_watches_watched_fid_users_fid_fk" FOREIGN KEY ("watched_fid") REFERENCES "public"."users"("fid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reply_hash_unique" ON "curated_cast_replies" USING btree ("reply_hash");--> statement-breakpoint
CREATE INDEX "curated_cast_hash_created_at_idx" ON "curated_cast_replies" USING btree ("curated_cast_hash","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cast_hash_unique" ON "curated_casts" USING btree ("cast_hash");--> statement-breakpoint
CREATE INDEX "curator_fid_idx" ON "curated_casts" USING btree ("curator_fid");--> statement-breakpoint
CREATE INDEX "created_at_idx" ON "curated_casts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_fid_is_read_created_at_idx" ON "user_notifications" USING btree ("user_fid","is_read","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "watcher_watched_unique" ON "user_watches" USING btree ("watcher_fid","watched_fid");--> statement-breakpoint
CREATE INDEX "watcher_fid_idx" ON "user_watches" USING btree ("watcher_fid");--> statement-breakpoint
CREATE INDEX "type_idx" ON "webhooks" USING btree ("type");--> statement-breakpoint
CREATE INDEX "neynar_webhook_id_idx" ON "webhooks" USING btree ("neynar_webhook_id");