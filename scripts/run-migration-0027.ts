import { resolve } from "path";
import { config } from "dotenv";

// Load environment variables
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function runMigration() {
  try {
    console.log("Running migration 0027: Add miniapp notification queue table...");

    // Create miniapp_notification_queue table
    console.log("Creating miniapp_notification_queue table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "miniapp_notification_queue" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_fid" bigint NOT NULL REFERENCES "users"("fid") ON DELETE CASCADE,
        "cast_hash" text NOT NULL,
        "cast_data" jsonb NOT NULL,
        "notification_type" text NOT NULL DEFAULT 'new_curated_cast',
        "created_at" timestamp DEFAULT now() NOT NULL,
        "scheduled_for" timestamp NOT NULL,
        "sent_at" timestamp
      );
    `);
    console.log("✓ Created miniapp_notification_queue table");

    // Create index on user_fid
    console.log("Creating index on user_fid...");
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "miniapp_notification_queue_user_fid_idx" ON "miniapp_notification_queue" USING btree ("user_fid");
    `);
    console.log("✓ Created user_fid index");

    // Create index on scheduled_for
    console.log("Creating index on scheduled_for...");
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "miniapp_notification_queue_scheduled_for_idx" ON "miniapp_notification_queue" USING btree ("scheduled_for");
    `);
    console.log("✓ Created scheduled_for index");

    // Create index on sent_at
    console.log("Creating index on sent_at...");
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "miniapp_notification_queue_sent_at_idx" ON "miniapp_notification_queue" USING btree ("sent_at");
    `);
    console.log("✓ Created sent_at index");

    // Create composite index on user_fid and scheduled_for
    console.log("Creating composite index on user_fid and scheduled_for...");
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "miniapp_notification_queue_user_fid_scheduled_for_idx" ON "miniapp_notification_queue" USING btree ("user_fid", "scheduled_for");
    `);
    console.log("✓ Created composite index");

    console.log("\n✅ Migration 0027 completed successfully!");
    console.log("- Created miniapp_notification_queue table");
    console.log("- Created indexes on user_fid, scheduled_for, sent_at, and composite index");
  } catch (error) {
    console.error("❌ Error running migration:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runMigration();
