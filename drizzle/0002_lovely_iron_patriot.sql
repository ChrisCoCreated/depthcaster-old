CREATE TABLE "curated_cast_interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"curated_cast_hash" text NOT NULL,
	"target_cast_hash" text NOT NULL,
	"interaction_type" text NOT NULL,
	"user_fid" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE "curated_cast_replies" CASCADE;--> statement-breakpoint
ALTER TABLE "curated_cast_interactions" ADD CONSTRAINT "curated_cast_interactions_curated_cast_hash_curated_casts_cast_hash_fk" FOREIGN KEY ("curated_cast_hash") REFERENCES "public"."curated_casts"("cast_hash") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "curated_cast_target_type_user_unique" ON "curated_cast_interactions" USING btree ("curated_cast_hash","target_cast_hash","interaction_type","user_fid");--> statement-breakpoint
CREATE INDEX "curated_cast_hash_created_at_idx" ON "curated_cast_interactions" USING btree ("curated_cast_hash","created_at");