import { resolve } from "path";
import { config } from "dotenv";

// Load environment variables
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function runMigration() {
  try {
    console.log("Running migration 0016: Add user_reaction_sync_state table...");

    // Create user_reaction_sync_state table
    console.log("Creating user_reaction_sync_state table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "user_reaction_sync_state" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_fid" bigint NOT NULL,
        "last_reaction_hash" text,
        "last_reaction_type" text,
        "last_reaction_timestamp" timestamp,
        "last_checked_at" timestamp DEFAULT now() NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
    `);

    // Add foreign key constraint
    console.log("Adding foreign key constraint...");
    await db.execute(sql`
      ALTER TABLE "user_reaction_sync_state" 
      ADD CONSTRAINT IF NOT EXISTS "user_reaction_sync_state_user_fid_users_fid_fk" 
      FOREIGN KEY ("user_fid") REFERENCES "users"("fid") ON DELETE CASCADE;
    `);

    // Create unique index on user_fid
    console.log("Creating unique index on user_fid...");
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS "user_reaction_sync_state_user_fid_unique" 
      ON "user_reaction_sync_state" USING btree ("user_fid");
    `);

    // Create index on last_checked_at
    console.log("Creating index on last_checked_at...");
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "user_reaction_sync_state_last_checked_at_idx" 
      ON "user_reaction_sync_state" USING btree ("last_checked_at");
    `);

    // Create api_call_stats table
    console.log("Creating api_call_stats table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "api_call_stats" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "call_type" text NOT NULL,
        "count" integer DEFAULT 0 NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
    `);

    // Create unique index on call_type
    console.log("Creating unique index on call_type...");
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS "api_call_stats_call_type_unique" 
      ON "api_call_stats" USING btree ("call_type");
    `);

    // Create index on call_type
    console.log("Creating index on call_type...");
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "api_call_stats_call_type_idx" 
      ON "api_call_stats" USING btree ("call_type");
    `);

    console.log("\n✅ Migration 0016 completed successfully!");
    console.log("- Created user_reaction_sync_state table");
    console.log("- Added foreign key constraint to users table");
    console.log("- Created unique index on user_fid");
    console.log("- Created index on last_checked_at");
    console.log("- Created api_call_stats table");
    console.log("- Created unique index on call_type");
    console.log("- Created index on call_type");
  } catch (error) {
    console.error("❌ Error running migration:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runMigration();



