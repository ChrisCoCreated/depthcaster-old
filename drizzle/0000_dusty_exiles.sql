CREATE TABLE "curator_pack_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pack_id" uuid NOT NULL,
	"user_fid" bigint NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curator_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"creator_fid" bigint NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pack_favorites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_fid" bigint NOT NULL,
	"pack_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_pack_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_fid" bigint NOT NULL,
	"pack_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"fid" bigint PRIMARY KEY NOT NULL,
	"username" text,
	"display_name" text,
	"pfp_url" text,
	"preferences" jsonb,
	"usage_stats" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "curator_pack_users" ADD CONSTRAINT "curator_pack_users_pack_id_curator_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."curator_packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curator_pack_users" ADD CONSTRAINT "curator_pack_users_user_fid_users_fid_fk" FOREIGN KEY ("user_fid") REFERENCES "public"."users"("fid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curator_packs" ADD CONSTRAINT "curator_packs_creator_fid_users_fid_fk" FOREIGN KEY ("creator_fid") REFERENCES "public"."users"("fid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_favorites" ADD CONSTRAINT "pack_favorites_user_fid_users_fid_fk" FOREIGN KEY ("user_fid") REFERENCES "public"."users"("fid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_favorites" ADD CONSTRAINT "pack_favorites_pack_id_curator_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."curator_packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_pack_subscriptions" ADD CONSTRAINT "user_pack_subscriptions_user_fid_users_fid_fk" FOREIGN KEY ("user_fid") REFERENCES "public"."users"("fid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_pack_subscriptions" ADD CONSTRAINT "user_pack_subscriptions_pack_id_curator_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."curator_packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pack_user_unique" ON "curator_pack_users" USING btree ("pack_id","user_fid");--> statement-breakpoint
CREATE INDEX "user_fid_idx" ON "curator_pack_users" USING btree ("user_fid");--> statement-breakpoint
CREATE INDEX "creator_fid_idx" ON "curator_packs" USING btree ("creator_fid");--> statement-breakpoint
CREATE UNIQUE INDEX "user_pack_favorite_unique" ON "pack_favorites" USING btree ("user_fid","pack_id");--> statement-breakpoint
CREATE INDEX "user_fid_favorite_idx" ON "pack_favorites" USING btree ("user_fid");--> statement-breakpoint
CREATE UNIQUE INDEX "user_pack_unique" ON "user_pack_subscriptions" USING btree ("user_fid","pack_id");--> statement-breakpoint
CREATE INDEX "user_fid_subscription_idx" ON "user_pack_subscriptions" USING btree ("user_fid");--> statement-breakpoint
CREATE INDEX "username_idx" ON "users" USING btree ("username");