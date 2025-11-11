import { config } from "dotenv";
import { resolve } from "path";

// Load environment variables from .env.local or .env
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function setupDatabase() {
  try {
    console.log("Creating database tables...");

    // Create users table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS users (
        fid BIGINT PRIMARY KEY,
        username TEXT,
        display_name TEXT,
        pfp_url TEXT,
        preferences JSONB,
        usage_stats JSONB,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS username_idx ON users(username);
    `);

    // Create curator_packs table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS curator_packs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        description TEXT,
        creator_fid BIGINT NOT NULL REFERENCES users(fid),
        is_public BOOLEAN DEFAULT true NOT NULL,
        usage_count INTEGER DEFAULT 0 NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS creator_fid_idx ON curator_packs(creator_fid);
    `);

    // Create curator_pack_users table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS curator_pack_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        pack_id UUID NOT NULL REFERENCES curator_packs(id) ON DELETE CASCADE,
        user_fid BIGINT NOT NULL REFERENCES users(fid),
        added_at TIMESTAMP DEFAULT NOW() NOT NULL,
        UNIQUE(pack_id, user_fid)
      );
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS user_fid_idx ON curator_pack_users(user_fid);
    `);

    // Create user_pack_subscriptions table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_pack_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_fid BIGINT NOT NULL REFERENCES users(fid),
        pack_id UUID NOT NULL REFERENCES curator_packs(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        UNIQUE(user_fid, pack_id)
      );
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS user_pack_subscriptions_user_fid_idx ON user_pack_subscriptions(user_fid);
    `);

    console.log("Database tables created successfully!");
  } catch (error) {
    console.error("Error setting up database:", error);
    process.exit(1);
  }
}

setupDatabase();
