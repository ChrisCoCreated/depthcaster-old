CREATE TABLE "cast_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_fid" bigint,
	"cast_hash" text NOT NULL,
	"author_fid" bigint NOT NULL,
	"feed_type" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cast_views_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" timestamp NOT NULL,
	"feed_type" text NOT NULL,
	"cast_hash" text NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"unique_users" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feed_view_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_fid" bigint,
	"feed_type" text NOT NULL,
	"duration_seconds" integer NOT NULL,
	"sort_by" text,
	"curator_fids" jsonb,
	"pack_ids" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feed_view_sessions_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" timestamp NOT NULL,
	"feed_type" text NOT NULL,
	"total_sessions" integer DEFAULT 0 NOT NULL,
	"total_duration_seconds" integer DEFAULT 0 NOT NULL,
	"unique_users" integer DEFAULT 0 NOT NULL,
	"avg_duration" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_fid" bigint,
	"page_path" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_views_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" timestamp NOT NULL,
	"page_path" text NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"unique_users" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feedback" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "feedback" CASCADE;--> statement-breakpoint
ALTER TABLE "build_ideas" DROP CONSTRAINT "build_ideas_admin_fid_users_fid_fk";
--> statement-breakpoint
DROP INDEX "build_ideas_admin_fid_idx";--> statement-breakpoint
ALTER TABLE "build_ideas" ADD COLUMN "cast_hash" text;--> statement-breakpoint
ALTER TABLE "build_ideas" ADD COLUMN "type" text DEFAULT 'build-idea' NOT NULL;--> statement-breakpoint
ALTER TABLE "build_ideas" ADD COLUMN "user_fid" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "signer_uuid" text;--> statement-breakpoint
ALTER TABLE "cast_views" ADD CONSTRAINT "cast_views_user_fid_users_fid_fk" FOREIGN KEY ("user_fid") REFERENCES "public"."users"("fid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_view_sessions" ADD CONSTRAINT "feed_view_sessions_user_fid_users_fid_fk" FOREIGN KEY ("user_fid") REFERENCES "public"."users"("fid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_views" ADD CONSTRAINT "page_views_user_fid_users_fid_fk" FOREIGN KEY ("user_fid") REFERENCES "public"."users"("fid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cast_views_cast_hash_idx" ON "cast_views" USING btree ("cast_hash");--> statement-breakpoint
CREATE INDEX "cast_views_feed_type_idx" ON "cast_views" USING btree ("feed_type");--> statement-breakpoint
CREATE INDEX "cast_views_user_fid_idx" ON "cast_views" USING btree ("user_fid");--> statement-breakpoint
CREATE INDEX "cast_views_created_at_idx" ON "cast_views" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "cast_views_feed_type_created_at_idx" ON "cast_views" USING btree ("feed_type","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cast_views_user_cast_feed_unique" ON "cast_views" USING btree ("user_fid","cast_hash","feed_type");--> statement-breakpoint
CREATE UNIQUE INDEX "cast_views_daily_date_feed_type_cast_unique" ON "cast_views_daily" USING btree ("date","feed_type","cast_hash");--> statement-breakpoint
CREATE INDEX "cast_views_daily_date_idx" ON "cast_views_daily" USING btree ("date");--> statement-breakpoint
CREATE INDEX "cast_views_daily_feed_type_idx" ON "cast_views_daily" USING btree ("feed_type");--> statement-breakpoint
CREATE INDEX "cast_views_daily_cast_hash_idx" ON "cast_views_daily" USING btree ("cast_hash");--> statement-breakpoint
CREATE INDEX "feed_view_sessions_feed_type_idx" ON "feed_view_sessions" USING btree ("feed_type");--> statement-breakpoint
CREATE INDEX "feed_view_sessions_user_fid_idx" ON "feed_view_sessions" USING btree ("user_fid");--> statement-breakpoint
CREATE INDEX "feed_view_sessions_created_at_idx" ON "feed_view_sessions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "feed_view_sessions_feed_type_created_at_idx" ON "feed_view_sessions" USING btree ("feed_type","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "feed_view_sessions_daily_date_feed_type_unique" ON "feed_view_sessions_daily" USING btree ("date","feed_type");--> statement-breakpoint
CREATE INDEX "feed_view_sessions_daily_date_idx" ON "feed_view_sessions_daily" USING btree ("date");--> statement-breakpoint
CREATE INDEX "feed_view_sessions_daily_feed_type_idx" ON "feed_view_sessions_daily" USING btree ("feed_type");--> statement-breakpoint
CREATE INDEX "page_views_page_path_idx" ON "page_views" USING btree ("page_path");--> statement-breakpoint
CREATE INDEX "page_views_user_fid_idx" ON "page_views" USING btree ("user_fid");--> statement-breakpoint
CREATE INDEX "page_views_created_at_idx" ON "page_views" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "page_views_page_path_created_at_idx" ON "page_views" USING btree ("page_path","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "page_views_daily_date_page_path_unique" ON "page_views_daily" USING btree ("date","page_path");--> statement-breakpoint
CREATE INDEX "page_views_daily_date_idx" ON "page_views_daily" USING btree ("date");--> statement-breakpoint
CREATE INDEX "page_views_daily_page_path_idx" ON "page_views_daily" USING btree ("page_path");--> statement-breakpoint
ALTER TABLE "build_ideas" ADD CONSTRAINT "build_ideas_user_fid_users_fid_fk" FOREIGN KEY ("user_fid") REFERENCES "public"."users"("fid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "build_ideas_user_fid_idx" ON "build_ideas" USING btree ("user_fid");--> statement-breakpoint
CREATE INDEX "build_ideas_type_idx" ON "build_ideas" USING btree ("type");--> statement-breakpoint
CREATE INDEX "build_ideas_cast_hash_idx" ON "build_ideas" USING btree ("cast_hash");--> statement-breakpoint
CREATE INDEX "signer_uuid_idx" ON "users" USING btree ("signer_uuid");--> statement-breakpoint
ALTER TABLE "build_ideas" DROP COLUMN "admin_fid";