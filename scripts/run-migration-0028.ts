import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), ".env.local") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function runMigration() {
  try {
    console.log("Running migration 0028: Add poll slug support...");

    // Add slug column
    console.log("Adding slug column to polls...");
    await db.execute(sql`
      ALTER TABLE "polls" ADD COLUMN IF NOT EXISTS "slug" text;
    `);

    // Create unique index on slug (only for non-null values)
    console.log("Creating unique index on slug...");
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS "polls_slug_idx" 
      ON "polls"("slug") 
      WHERE "slug" IS NOT NULL;
    `);

    console.log("\n✓ Migration completed successfully!");
    console.log("- Added slug column to polls");
    console.log("- Created unique index on slug");
  } catch (error) {
    console.error("Error running migration:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runMigration();


