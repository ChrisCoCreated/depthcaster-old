import { resolve } from "path";
import { config } from "dotenv";

// Load environment variables
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function runMigration() {
  try {
    console.log("Running migration 0019: Add miniapp installation tracking table...");

    // Create miniapp_installations table
    console.log("Creating miniapp_installations table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "miniapp_installations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_fid" bigint NOT NULL REFERENCES "users"("fid") ON DELETE CASCADE,
        "installed_at" timestamp DEFAULT now() NOT NULL,
        UNIQUE("user_fid")
      );
    `);
    console.log("✓ Created miniapp_installations table");

    // Create index on user_fid
    console.log("Creating index on user_fid...");
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "miniapp_installations_user_fid_idx" ON "miniapp_installations" USING btree ("user_fid");
    `);
    console.log("✓ Created user_fid index");

    // Create index on installed_at
    console.log("Creating index on installed_at...");
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "miniapp_installations_installed_at_idx" ON "miniapp_installations" USING btree ("installed_at");
    `);
    console.log("✓ Created installed_at index");

    console.log("\n✅ Migration 0019 completed successfully!");
    console.log("- Created miniapp_installations table");
    console.log("- Created indexes on user_fid and installed_at");
  } catch (error) {
    console.error("❌ Error running migration:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runMigration();
