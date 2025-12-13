import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function runMigration() {
  try {
    console.log("Running migration 0026: Add cast_thanks table...");

    // Create cast_thanks table
    console.log("Creating cast_thanks table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "cast_thanks" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "cast_hash" text NOT NULL,
        "from_fid" bigint NOT NULL,
        "to_fid" bigint NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `);
    console.log("✓ Created cast_thanks table");

    // Add foreign key constraint for cast_hash
    console.log("Adding foreign key constraint for cast_hash...");
    await db.execute(sql`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'cast_thanks_cast_hash_curated_casts_cast_hash_fk'
        ) THEN
          ALTER TABLE "cast_thanks" 
          ADD CONSTRAINT "cast_thanks_cast_hash_curated_casts_cast_hash_fk" 
          FOREIGN KEY ("cast_hash") 
          REFERENCES "public"."curated_casts"("cast_hash") 
          ON DELETE CASCADE 
          ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
    console.log("✓ Added cast_hash foreign key constraint");

    // Add foreign key constraint for from_fid
    console.log("Adding foreign key constraint for from_fid...");
    await db.execute(sql`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'cast_thanks_from_fid_users_fid_fk'
        ) THEN
          ALTER TABLE "cast_thanks" 
          ADD CONSTRAINT "cast_thanks_from_fid_users_fid_fk" 
          FOREIGN KEY ("from_fid") 
          REFERENCES "public"."users"("fid") 
          ON DELETE CASCADE 
          ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
    console.log("✓ Added from_fid foreign key constraint");

    // Add foreign key constraint for to_fid
    console.log("Adding foreign key constraint for to_fid...");
    await db.execute(sql`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'cast_thanks_to_fid_users_fid_fk'
        ) THEN
          ALTER TABLE "cast_thanks" 
          ADD CONSTRAINT "cast_thanks_to_fid_users_fid_fk" 
          FOREIGN KEY ("to_fid") 
          REFERENCES "public"."users"("fid") 
          ON DELETE CASCADE 
          ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
    console.log("✓ Added to_fid foreign key constraint");

    // Create unique index
    console.log("Creating unique index on (cast_hash, from_fid, to_fid)...");
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS "cast_thanks_cast_hash_from_to_unique" 
      ON "cast_thanks" USING btree ("cast_hash", "from_fid", "to_fid");
    `);
    console.log("✓ Created unique index");

    // Create index on cast_hash
    console.log("Creating index on cast_hash...");
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "cast_thanks_cast_hash_idx" 
      ON "cast_thanks" USING btree ("cast_hash");
    `);
    console.log("✓ Created cast_hash index");

    // Create index on from_fid
    console.log("Creating index on from_fid...");
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "cast_thanks_from_fid_idx" 
      ON "cast_thanks" USING btree ("from_fid");
    `);
    console.log("✓ Created from_fid index");

    // Create index on to_fid
    console.log("Creating index on to_fid...");
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "cast_thanks_to_fid_idx" 
      ON "cast_thanks" USING btree ("to_fid");
    `);
    console.log("✓ Created to_fid index");

    console.log("\n✅ Migration 0026 completed successfully!");
    console.log("- Created cast_thanks table");
    console.log("- Added foreign key constraints");
    console.log("- Created unique index and regular indexes");
  } catch (error) {
    console.error("❌ Error running migration:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runMigration();

