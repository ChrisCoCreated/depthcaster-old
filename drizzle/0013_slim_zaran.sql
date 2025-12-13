CREATE TABLE "cast_thanks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cast_hash" text NOT NULL,
	"from_fid" bigint NOT NULL,
	"to_fid" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cast_thanks" ADD CONSTRAINT "cast_thanks_cast_hash_curated_casts_cast_hash_fk" FOREIGN KEY ("cast_hash") REFERENCES "public"."curated_casts"("cast_hash") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cast_thanks" ADD CONSTRAINT "cast_thanks_from_fid_users_fid_fk" FOREIGN KEY ("from_fid") REFERENCES "public"."users"("fid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cast_thanks" ADD CONSTRAINT "cast_thanks_to_fid_users_fid_fk" FOREIGN KEY ("to_fid") REFERENCES "public"."users"("fid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cast_thanks_cast_hash_from_to_unique" ON "cast_thanks" USING btree ("cast_hash","from_fid","to_fid");--> statement-breakpoint
CREATE INDEX "cast_thanks_cast_hash_idx" ON "cast_thanks" USING btree ("cast_hash");--> statement-breakpoint
CREATE INDEX "cast_thanks_from_fid_idx" ON "cast_thanks" USING btree ("from_fid");--> statement-breakpoint
CREATE INDEX "cast_thanks_to_fid_idx" ON "cast_thanks" USING btree ("to_fid");