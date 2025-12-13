CREATE TABLE "nft_mints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_id" bigint NOT NULL,
	"owner_address" text NOT NULL,
	"image_url" text NOT NULL,
	"metadata_url" text NOT NULL,
	"transaction_hash" text NOT NULL,
	"minted_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "poll_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_id" uuid NOT NULL,
	"option_text" text NOT NULL,
	"order" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "poll_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_id" uuid NOT NULL,
	"user_fid" bigint NOT NULL,
	"rankings" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "polls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cast_hash" text NOT NULL,
	"question" text NOT NULL,
	"created_by" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "polls_cast_hash_unique" UNIQUE("cast_hash")
);
--> statement-breakpoint
ALTER TABLE "poll_options" ADD CONSTRAINT "poll_options_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_responses" ADD CONSTRAINT "poll_responses_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_responses" ADD CONSTRAINT "poll_responses_user_fid_users_fid_fk" FOREIGN KEY ("user_fid") REFERENCES "public"."users"("fid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_cast_hash_curated_casts_cast_hash_fk" FOREIGN KEY ("cast_hash") REFERENCES "public"."curated_casts"("cast_hash") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_created_by_users_fid_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("fid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "nft_mints_token_id_unique" ON "nft_mints" USING btree ("token_id");--> statement-breakpoint
CREATE INDEX "nft_mints_owner_address_idx" ON "nft_mints" USING btree ("owner_address");--> statement-breakpoint
CREATE INDEX "nft_mints_transaction_hash_idx" ON "nft_mints" USING btree ("transaction_hash");--> statement-breakpoint
CREATE INDEX "nft_mints_minted_at_idx" ON "nft_mints" USING btree ("minted_at");--> statement-breakpoint
CREATE INDEX "poll_options_poll_id_idx" ON "poll_options" USING btree ("poll_id");--> statement-breakpoint
CREATE INDEX "poll_options_poll_id_order_idx" ON "poll_options" USING btree ("poll_id","order");--> statement-breakpoint
CREATE UNIQUE INDEX "poll_responses_poll_user_unique" ON "poll_responses" USING btree ("poll_id","user_fid");--> statement-breakpoint
CREATE INDEX "poll_responses_poll_id_idx" ON "poll_responses" USING btree ("poll_id");--> statement-breakpoint
CREATE INDEX "poll_responses_user_fid_idx" ON "poll_responses" USING btree ("user_fid");--> statement-breakpoint
CREATE INDEX "polls_cast_hash_idx" ON "polls" USING btree ("cast_hash");--> statement-breakpoint
CREATE INDEX "polls_created_by_idx" ON "polls" USING btree ("created_by");