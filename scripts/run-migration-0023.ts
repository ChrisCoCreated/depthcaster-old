import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function runMigration() {
  try {
    console.log("Running migration 0023: Add hidden_embed_urls column to collections table...");

    // Add hidden_embed_urls column to collections table
    await db.execute(sql`
      ALTER TABLE "collections" 
      ADD COLUMN IF NOT EXISTS "hidden_embed_urls" jsonb;
    `);

    console.log("✓ Migration completed successfully!");
    console.log("- Added hidden_embed_urls column to collections table");
  } catch (error) {
    console.error("Error running migration:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runMigration();

