import { config } from "dotenv";
import { resolve } from "path";

// Load environment variables from .env.local or .env
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function runMigration() {
  try {
    console.log("Running migration 0006: Add cast_tags table and set admin roles...");

    // Create cast_tags table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS cast_tags (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        cast_hash TEXT NOT NULL,
        tag TEXT NOT NULL,
        admin_fid BIGINT NOT NULL REFERENCES users(fid),
        created_at TIMESTAMP DEFAULT now() NOT NULL,
        UNIQUE(cast_hash, tag)
      );
    `);

    // Create indexes
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS cast_tags_cast_hash_idx ON cast_tags(cast_hash);
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS cast_tags_tag_idx ON cast_tags(tag);
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS cast_tags_admin_fid_idx ON cast_tags(admin_fid);
    `);

    // Set user roles
    await db.execute(sql`
      UPDATE users SET role = 'superadmin' WHERE fid = 5701;
    `);

    await db.execute(sql`
      UPDATE users SET role = 'admin' WHERE fid = 5406;
    `);

    // Ensure users exist (insert if they don't)
    await db.execute(sql`
      INSERT INTO users (fid, role, created_at, updated_at)
      VALUES (5701, 'superadmin', NOW(), NOW())
      ON CONFLICT (fid) DO UPDATE SET role = 'superadmin', updated_at = NOW();
    `);

    await db.execute(sql`
      INSERT INTO users (fid, role, created_at, updated_at)
      VALUES (5406, 'admin', NOW(), NOW())
      ON CONFLICT (fid) DO UPDATE SET role = 'admin', updated_at = NOW();
    `);

    console.log("Migration completed successfully!");
    console.log("- Created cast_tags table");
    console.log("- Set user 5701 as superadmin");
    console.log("- Set user 5406 as admin");
  } catch (error) {
    console.error("Error running migration:", error);
    process.exit(1);
  }
}

runMigration();

