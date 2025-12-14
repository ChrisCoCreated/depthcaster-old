import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), ".env.local") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function runMigration() {
  try {
    console.log("Running migration 0027: Add pfp_nfts table...");

    // Create pfp_nfts table
    console.log("Creating pfp_nfts table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "pfp_nfts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "token_id" bigint NOT NULL,
        "owner_address" text NOT NULL,
        "image_url" text NOT NULL,
        "metadata" jsonb,
        "minted_at" timestamp DEFAULT now() NOT NULL,
        "transaction_hash" text,
        "replicate_job_id" text
      );
    `);

    // Create indexes
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "pfp_nfts_token_id_idx" ON "pfp_nfts" ("token_id");
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "pfp_nfts_owner_address_idx" ON "pfp_nfts" ("owner_address");
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "pfp_nfts_transaction_hash_idx" ON "pfp_nfts" ("transaction_hash");
    `);

    console.log("Migration 0027 completed successfully!");
  } catch (error) {
    console.error("Migration 0027 failed:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runMigration();

