CREATE TABLE "curator_cast_curations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cast_hash" text NOT NULL,
	"curator_fid" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_fid" bigint NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "cast_hash_unique";--> statement-breakpoint
ALTER TABLE "curator_cast_curations" ADD CONSTRAINT "curator_cast_curations_cast_hash_curated_casts_cast_hash_fk" FOREIGN KEY ("cast_hash") REFERENCES "public"."curated_casts"("cast_hash") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curator_cast_curations" ADD CONSTRAINT "curator_cast_curations_curator_fid_users_fid_fk" FOREIGN KEY ("curator_fid") REFERENCES "public"."users"("fid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_fid_users_fid_fk" FOREIGN KEY ("user_fid") REFERENCES "public"."users"("fid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cast_hash_curator_unique" ON "curator_cast_curations" USING btree ("cast_hash","curator_fid");--> statement-breakpoint
CREATE INDEX "curator_cast_curations_cast_hash_idx" ON "curator_cast_curations" USING btree ("cast_hash");--> statement-breakpoint
CREATE INDEX "curator_cast_curations_curator_fid_idx" ON "curator_cast_curations" USING btree ("curator_fid");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_fid_idx" ON "push_subscriptions" USING btree ("user_fid");--> statement-breakpoint
CREATE INDEX "push_subscriptions_endpoint_idx" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_unique" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "cast_hash_idx" ON "curated_casts" USING btree ("cast_hash");