import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), ".env.local") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function runMigration() {
  try {
    console.log("Running migration 0025: Add ordering fields to collections table...");

    // Add order_mode column
    await db.execute(sql`
      ALTER TABLE "collections" ADD COLUMN IF NOT EXISTS "order_mode" text DEFAULT 'manual' NOT NULL;
    `);

    // Add order_direction column
    await db.execute(sql`
      ALTER TABLE "collections" ADD COLUMN IF NOT EXISTS "order_direction" text DEFAULT 'desc' NOT NULL;
    `);

    console.log("✓ Migration completed successfully!");
    console.log("- Added 'order_mode' column to collections table (default: 'manual')");
    console.log("- Added 'order_direction' column to collections table (default: 'desc')");
  } catch (error) {
    console.error("Error running migration:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runMigration();















