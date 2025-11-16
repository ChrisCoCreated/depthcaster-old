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

    // Create user_roles table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_fid BIGINT NOT NULL REFERENCES users(fid) ON DELETE CASCADE,
        role TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        UNIQUE(user_fid, role)
      );
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS user_roles_user_fid_idx ON user_roles(user_fid);
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

    // Create curated_casts table (removed UNIQUE constraint to allow multiple curators)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS curated_casts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cast_hash TEXT NOT NULL,
        cast_data JSONB NOT NULL,
        curator_fid BIGINT REFERENCES users(fid),
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);

    // Remove unique constraint if it exists (migration for existing tables)
    await db.execute(sql`
      DO $$ 
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'curated_casts_cast_hash_key'
        ) THEN
          ALTER TABLE curated_casts DROP CONSTRAINT curated_casts_cast_hash_key;
        END IF;
      END $$;
    `);

    // Add cast_data column if it doesn't exist (migration for existing tables)
    await db.execute(sql`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'curated_casts' AND column_name = 'cast_data'
        ) THEN
          ALTER TABLE curated_casts ADD COLUMN cast_data JSONB;
          -- Update existing rows to have empty object if needed
          UPDATE curated_casts SET cast_data = '{}'::jsonb WHERE cast_data IS NULL;
          -- Make it NOT NULL after updating
          ALTER TABLE curated_casts ALTER COLUMN cast_data SET NOT NULL;
        END IF;
      END $$;
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS curator_fid_idx ON curated_casts(curator_fid);
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS created_at_idx ON curated_casts(created_at DESC);
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS cast_hash_idx ON curated_casts(cast_hash);
    `);

    // Create curator_cast_curations junction table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS curator_cast_curations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cast_hash TEXT NOT NULL REFERENCES curated_casts(cast_hash) ON DELETE CASCADE,
        curator_fid BIGINT NOT NULL REFERENCES users(fid),
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        UNIQUE(cast_hash, curator_fid)
      );
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS curator_cast_curations_cast_hash_idx ON curator_cast_curations(cast_hash);
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS curator_cast_curations_curator_fid_idx ON curator_cast_curations(curator_fid);
    `);

    // Migrate existing curated_casts data to curator_cast_curations
    await db.execute(sql`
      INSERT INTO curator_cast_curations (cast_hash, curator_fid, created_at)
      SELECT cast_hash, curator_fid, created_at
      FROM curated_casts
      WHERE curator_fid IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM curator_cast_curations 
        WHERE curator_cast_curations.cast_hash = curated_casts.cast_hash 
        AND curator_cast_curations.curator_fid = curated_casts.curator_fid
      );
    `);

    // Create push_subscriptions table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_fid BIGINT NOT NULL REFERENCES users(fid),
        endpoint TEXT NOT NULL,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
        UNIQUE(endpoint)
      );
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS push_subscriptions_user_fid_idx ON push_subscriptions(user_fid);
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS push_subscriptions_endpoint_idx ON push_subscriptions(endpoint);
    `);

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

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS cast_tags_cast_hash_idx ON cast_tags(cast_hash);
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS cast_tags_tag_idx ON cast_tags(tag);
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS cast_tags_admin_fid_idx ON cast_tags(admin_fid);
    `);

    // Create build_ideas table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS build_ideas (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        url TEXT,
        admin_fid BIGINT NOT NULL REFERENCES users(fid),
        created_at TIMESTAMP DEFAULT now() NOT NULL,
        updated_at TIMESTAMP DEFAULT now() NOT NULL
      );
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS build_ideas_created_at_idx ON build_ideas(created_at);
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS build_ideas_admin_fid_idx ON build_ideas(admin_fid);
    `);

    console.log("Database tables created successfully!");
  } catch (error) {
    console.error("Error setting up database:", error);
    process.exit(1);
  }
}

setupDatabase();
