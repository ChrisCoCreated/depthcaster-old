import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), ".env.local") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function runMigration() {
  try {
    console.log("Running migration 0024: Add order column to collection_casts table...");

    // Add order column
    await db.execute(sql`
      ALTER TABLE "collection_casts" ADD COLUMN IF NOT EXISTS "order" integer;
    `);

    // Create index on order column
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "collection_casts_order_idx" ON "collection_casts" ("order");
    `);

    console.log("✓ Migration completed successfully!");
    console.log("- Added 'order' column to collection_casts table");
    console.log("- Created index on 'order' column");
  } catch (error) {
    console.error("Error running migration:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runMigration();

