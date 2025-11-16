import { resolve } from "path";
import { config } from "dotenv";

// Load environment variables
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function runMigration() {
  try {
    console.log("Running migration 0013: Merge feedback into build_ideas...");

    // Add new columns to build_ideas
    console.log("Adding columns to build_ideas...");
    await db.execute(sql`
      ALTER TABLE "build_ideas" ADD COLUMN IF NOT EXISTS "type" text DEFAULT 'build-idea' NOT NULL;
    `);
    await db.execute(sql`
      ALTER TABLE "build_ideas" ADD COLUMN IF NOT EXISTS "cast_hash" text;
    `);
    await db.execute(sql`
      ALTER TABLE "build_ideas" ADD COLUMN IF NOT EXISTS "user_fid" bigint;
    `);
    console.log("✓ Added columns to build_ideas");

    // Migrate existing build_ideas to use user_fid (copy from admin_fid)
    console.log("Migrating admin_fid to user_fid...");
    await db.execute(sql`
      UPDATE "build_ideas" SET "user_fid" = "admin_fid" WHERE "user_fid" IS NULL;
    `);
    console.log("✓ Migrated admin_fid to user_fid");

    // Make user_fid NOT NULL after migration
    console.log("Setting user_fid to NOT NULL...");
    await db.execute(sql`
      ALTER TABLE "build_ideas" ALTER COLUMN "user_fid" SET NOT NULL;
    `);
    console.log("✓ Set user_fid to NOT NULL");

    // Make admin_fid nullable (for backward compatibility, but not required)
    console.log("Making admin_fid nullable...");
    await db.execute(sql`
      ALTER TABLE "build_ideas" ALTER COLUMN "admin_fid" DROP NOT NULL;
    `);
    console.log("✓ Made admin_fid nullable");

    // Check if feedback table exists and migrate data
    console.log("Checking for feedback table...");
    const feedbackTableExists = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'feedback'
      );
    `);
    
    const exists = (feedbackTableExists as any)[0]?.exists;
    if (exists) {
      console.log("Found feedback table, migrating data...");
      await db.execute(sql`
        INSERT INTO "build_ideas" ("title", "description", "cast_hash", "type", "user_fid", "created_at", "updated_at")
        SELECT "title", "description", "cast_hash", 'feedback', "user_fid", "created_at", "updated_at"
        FROM "feedback"
        ON CONFLICT DO NOTHING;
      `);
      console.log("✓ Migrated feedback data to build_ideas");
    } else {
      console.log("No feedback table found, skipping data migration");
    }

    // Add foreign key constraint for user_fid
    console.log("Adding foreign key constraint...");
    await db.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'build_ideas_user_fid_users_fid_fk'
        ) THEN
          ALTER TABLE "build_ideas" 
            ADD CONSTRAINT "build_ideas_user_fid_users_fid_fk" 
            FOREIGN KEY ("user_fid") REFERENCES "public"."users"("fid") ON DELETE no action ON UPDATE no action;
        END IF;
      END $$;
    `);
    console.log("✓ Added foreign key constraint");

    // Create indexes
    console.log("Creating indexes...");
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "build_ideas_user_fid_idx" ON "build_ideas" USING btree ("user_fid");
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "build_ideas_type_idx" ON "build_ideas" USING btree ("type");
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "build_ideas_cast_hash_idx" ON "build_ideas" USING btree ("cast_hash");
    `);
    console.log("✓ Created indexes");

    // Drop feedback table if it exists
    if (exists) {
      console.log("Dropping feedback table...");
      await db.execute(sql`
        DROP TABLE IF EXISTS "feedback" CASCADE;
      `);
      console.log("✓ Dropped feedback table");
    }

    console.log("\n✅ Migration 0013 completed successfully!");
    console.log("- Added type, cast_hash, and user_fid columns to build_ideas");
    console.log("- Migrated existing data from admin_fid to user_fid");
    if (exists) {
      console.log("- Migrated feedback data to build_ideas");
      console.log("- Dropped feedback table");
    }
    console.log("- Created indexes and foreign key constraints");
  } catch (error) {
    console.error("❌ Error running migration:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runMigration();

