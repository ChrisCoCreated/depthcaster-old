CREATE TABLE "api_call_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_type" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curator_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recommended_user_fid" bigint NOT NULL,
	"recommender_fid" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "miniapp_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_fid" bigint NOT NULL,
	"installed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quality_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cast_hash" text NOT NULL,
	"target_cast_hash" text NOT NULL,
	"curator_fid" bigint NOT NULL,
	"root_cast_hash" text,
	"feedback" text NOT NULL,
	"previous_quality_score" integer NOT NULL,
	"new_quality_score" integer NOT NULL,
	"deepseek_reasoning" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sign_in_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_fid" bigint,
	"request_data" jsonb,
	"response_data" jsonb,
	"signer_uuid" text,
	"success" boolean NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_reaction_sync_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_fid" bigint NOT NULL,
	"last_reaction_hash" text,
	"last_reaction_type" text,
	"last_reaction_timestamp" timestamp,
	"last_checked_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "build_ideas" ADD COLUMN "feedback_type" text;--> statement-breakpoint
ALTER TABLE "build_ideas" ADD COLUMN "status" text;--> statement-breakpoint
ALTER TABLE "cast_replies" ADD COLUMN "quality_score" integer;--> statement-breakpoint
ALTER TABLE "cast_replies" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "cast_replies" ADD COLUMN "quality_analyzed_at" timestamp;--> statement-breakpoint
ALTER TABLE "curated_casts" ADD COLUMN "quality_score" integer;--> statement-breakpoint
ALTER TABLE "curated_casts" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "curated_casts" ADD COLUMN "quality_analyzed_at" timestamp;--> statement-breakpoint
ALTER TABLE "curator_recommendations" ADD CONSTRAINT "curator_recommendations_recommended_user_fid_users_fid_fk" FOREIGN KEY ("recommended_user_fid") REFERENCES "public"."users"("fid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curator_recommendations" ADD CONSTRAINT "curator_recommendations_recommender_fid_users_fid_fk" FOREIGN KEY ("recommender_fid") REFERENCES "public"."users"("fid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "miniapp_installations" ADD CONSTRAINT "miniapp_installations_user_fid_users_fid_fk" FOREIGN KEY ("user_fid") REFERENCES "public"."users"("fid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_feedback" ADD CONSTRAINT "quality_feedback_cast_hash_curated_casts_cast_hash_fk" FOREIGN KEY ("cast_hash") REFERENCES "public"."curated_casts"("cast_hash") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_feedback" ADD CONSTRAINT "quality_feedback_curator_fid_users_fid_fk" FOREIGN KEY ("curator_fid") REFERENCES "public"."users"("fid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sign_in_logs" ADD CONSTRAINT "sign_in_logs_user_fid_users_fid_fk" FOREIGN KEY ("user_fid") REFERENCES "public"."users"("fid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_reaction_sync_state" ADD CONSTRAINT "user_reaction_sync_state_user_fid_users_fid_fk" FOREIGN KEY ("user_fid") REFERENCES "public"."users"("fid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_call_stats_call_type_unique" ON "api_call_stats" USING btree ("call_type");--> statement-breakpoint
CREATE INDEX "api_call_stats_call_type_idx" ON "api_call_stats" USING btree ("call_type");--> statement-breakpoint
CREATE UNIQUE INDEX "curator_recommendations_recommended_recommender_unique" ON "curator_recommendations" USING btree ("recommended_user_fid","recommender_fid");--> statement-breakpoint
CREATE INDEX "curator_recommendations_recommended_user_fid_idx" ON "curator_recommendations" USING btree ("recommended_user_fid");--> statement-breakpoint
CREATE INDEX "curator_recommendations_recommender_fid_idx" ON "curator_recommendations" USING btree ("recommender_fid");--> statement-breakpoint
CREATE INDEX "curator_recommendations_created_at_idx" ON "curator_recommendations" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "miniapp_installations_user_fid_unique" ON "miniapp_installations" USING btree ("user_fid");--> statement-breakpoint
CREATE INDEX "miniapp_installations_user_fid_idx" ON "miniapp_installations" USING btree ("user_fid");--> statement-breakpoint
CREATE INDEX "miniapp_installations_installed_at_idx" ON "miniapp_installations" USING btree ("installed_at");--> statement-breakpoint
CREATE INDEX "quality_feedback_cast_hash_idx" ON "quality_feedback" USING btree ("cast_hash");--> statement-breakpoint
CREATE INDEX "quality_feedback_target_cast_hash_idx" ON "quality_feedback" USING btree ("target_cast_hash");--> statement-breakpoint
CREATE INDEX "quality_feedback_curator_fid_idx" ON "quality_feedback" USING btree ("curator_fid");--> statement-breakpoint
CREATE INDEX "quality_feedback_root_cast_hash_idx" ON "quality_feedback" USING btree ("root_cast_hash");--> statement-breakpoint
CREATE INDEX "quality_feedback_created_at_idx" ON "quality_feedback" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "quality_feedback_cast_hash_created_at_idx" ON "quality_feedback" USING btree ("cast_hash","created_at");--> statement-breakpoint
CREATE INDEX "sign_in_logs_user_fid_idx" ON "sign_in_logs" USING btree ("user_fid");--> statement-breakpoint
CREATE INDEX "sign_in_logs_created_at_idx" ON "sign_in_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sign_in_logs_user_fid_created_at_idx" ON "sign_in_logs" USING btree ("user_fid","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_reaction_sync_state_user_fid_unique" ON "user_reaction_sync_state" USING btree ("user_fid");--> statement-breakpoint
CREATE INDEX "user_reaction_sync_state_last_checked_at_idx" ON "user_reaction_sync_state" USING btree ("last_checked_at");--> statement-breakpoint
CREATE INDEX "build_ideas_status_idx" ON "build_ideas" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cast_replies_quality_score_idx" ON "cast_replies" USING btree ("quality_score");--> statement-breakpoint
CREATE INDEX "cast_replies_category_idx" ON "cast_replies" USING btree ("category");--> statement-breakpoint
CREATE INDEX "cast_replies_quality_category_idx" ON "cast_replies" USING btree ("quality_score","category");--> statement-breakpoint
CREATE INDEX "curated_casts_quality_score_idx" ON "curated_casts" USING btree ("quality_score");--> statement-breakpoint
CREATE INDEX "curated_casts_category_idx" ON "curated_casts" USING btree ("category");--> statement-breakpoint
CREATE INDEX "curated_casts_quality_category_idx" ON "curated_casts" USING btree ("quality_score","category");