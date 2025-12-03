import { resolve } from "path";
import { config } from "dotenv";

// Load environment variables
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function runMigration() {
  try {
    console.log("Running migration 0020: Add curator recommendations table...");

    // Create curator_recommendations table
    console.log("Creating curator_recommendations table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "curator_recommendations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "recommended_user_fid" bigint NOT NULL REFERENCES "users"("fid") ON DELETE CASCADE,
        "recommender_fid" bigint NOT NULL REFERENCES "users"("fid") ON DELETE CASCADE,
        "created_at" timestamp DEFAULT now() NOT NULL,
        UNIQUE("recommended_user_fid", "recommender_fid")
      );
    `);
    console.log("✓ Created curator_recommendations table");

    // Create index on recommended_user_fid
    console.log("Creating index on recommended_user_fid...");
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "curator_recommendations_recommended_user_fid_idx" ON "curator_recommendations" USING btree ("recommended_user_fid");
    `);
    console.log("✓ Created recommended_user_fid index");

    // Create index on recommender_fid
    console.log("Creating index on recommender_fid...");
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "curator_recommendations_recommender_fid_idx" ON "curator_recommendations" USING btree ("recommender_fid");
    `);
    console.log("✓ Created recommender_fid index");

    // Create index on created_at
    console.log("Creating index on created_at...");
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "curator_recommendations_created_at_idx" ON "curator_recommendations" USING btree ("created_at");
    `);
    console.log("✓ Created created_at index");

    console.log("\n✅ Migration 0020 completed successfully!");
    console.log("- Created curator_recommendations table");
    console.log("- Created indexes on recommended_user_fid, recommender_fid, and created_at");
  } catch (error) {
    console.error("❌ Error running migration:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runMigration();
