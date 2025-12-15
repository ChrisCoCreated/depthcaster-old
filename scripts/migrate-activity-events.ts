import { resolve } from "path";
import { config } from "dotenv";

// Load environment variables
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function runMigration() {
  try {
    console.log("Running migration: Create activity_events table and backfill data...");

    // Step 1: Add columns to users table
    console.log("Step 1: Adding columns to users table...");
    await db.execute(sql`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'users' AND column_name = 'first_sign_in_at'
        ) THEN
          ALTER TABLE users ADD COLUMN first_sign_in_at timestamp;
        END IF;
        
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'users' AND column_name = 'last_qualifying_activity_at'
        ) THEN
          ALTER TABLE users ADD COLUMN last_qualifying_activity_at timestamp;
        END IF;
      END $$;
    `);

    // Create index on last_qualifying_activity_at
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS users_last_qualifying_activity_at_idx 
      ON users(last_qualifying_activity_at);
    `);

    console.log("✅ Added columns to users table");

    // Step 2: Create activity_events table
    console.log("Step 2: Creating activity_events table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS activity_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        user_fid bigint NOT NULL REFERENCES users(fid) ON DELETE CASCADE,
        type text NOT NULL,
        metadata jsonb,
        created_at timestamp DEFAULT now() NOT NULL
      );
    `);

    // Create indexes
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS activity_events_user_fid_type_created_at_idx 
      ON activity_events(user_fid, type, created_at);
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS activity_events_user_fid_created_at_idx 
      ON activity_events(user_fid, created_at);
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS activity_events_created_at_idx 
      ON activity_events(created_at);
    `);

    console.log("✅ Created activity_events table");

    // Step 3: Backfill first_sign_in_at from sign_in_logs
    console.log("Step 3: Backfilling first_sign_in_at from sign_in_logs...");
    await db.execute(sql`
      UPDATE users u
      SET first_sign_in_at = (
        SELECT MIN(created_at)
        FROM sign_in_logs
        WHERE user_fid = u.fid AND success = true
      )
      WHERE EXISTS (
        SELECT 1 FROM sign_in_logs 
        WHERE user_fid = u.fid AND success = true
      );
    `);
    console.log("✅ Backfilled first_sign_in_at");

    // Step 4: Backfill activity_events from existing tables
    console.log("Step 4: Backfilling activity_events from existing tables...");

    // 4a: post_reply from cast_replies (author_fid)
    console.log("  - Backfilling post_reply from cast_replies...");
    await db.execute(sql`
      INSERT INTO activity_events (user_fid, type, metadata, created_at)
      SELECT DISTINCT
        author_fid as user_fid,
        'post_reply' as type,
        jsonb_build_object('cast_hash', reply_cast_hash) as metadata,
        created_at
      FROM cast_replies
      WHERE author_fid IS NOT NULL
      ON CONFLICT DO NOTHING;
    `);

    // 4b: post_reply from curated_cast_interactions (type='reply')
    console.log("  - Backfilling post_reply from curated_cast_interactions...");
    await db.execute(sql`
      INSERT INTO activity_events (user_fid, type, metadata, created_at)
      SELECT DISTINCT
        user_fid,
        'post_reply' as type,
        jsonb_build_object('cast_hash', target_cast_hash) as metadata,
        created_at
      FROM curated_cast_interactions
      WHERE interaction_type = 'reply' AND user_fid IS NOT NULL
      ON CONFLICT DO NOTHING;
    `);

    // 4c: save_curate from curator_cast_curations
    console.log("  - Backfilling save_curate from curator_cast_curations...");
    await db.execute(sql`
      INSERT INTO activity_events (user_fid, type, metadata, created_at)
      SELECT DISTINCT
        curator_fid as user_fid,
        'save_curate' as type,
        jsonb_build_object('cast_hash', cast_hash) as metadata,
        created_at
      FROM curator_cast_curations
      ON CONFLICT DO NOTHING;
    `);

    // 4d: follow_add from user_pack_subscriptions
    console.log("  - Backfilling follow_add from user_pack_subscriptions...");
    await db.execute(sql`
      INSERT INTO activity_events (user_fid, type, metadata, created_at)
      SELECT DISTINCT
        user_fid,
        'follow_add' as type,
        jsonb_build_object('pack_id', pack_id::text) as metadata,
        created_at
      FROM user_pack_subscriptions
      ON CONFLICT DO NOTHING;
    `);

    // 4e: follow_add from pack_favorites
    console.log("  - Backfilling follow_add from pack_favorites...");
    await db.execute(sql`
      INSERT INTO activity_events (user_fid, type, metadata, created_at)
      SELECT DISTINCT
        user_fid,
        'follow_add' as type,
        jsonb_build_object('pack_id', pack_id::text) as metadata,
        created_at
      FROM pack_favorites
      ON CONFLICT DO NOTHING;
    `);

    // 4f: follow_add from user_watches
    console.log("  - Backfilling follow_add from user_watches...");
    await db.execute(sql`
      INSERT INTO activity_events (user_fid, type, metadata, created_at)
      SELECT DISTINCT
        watcher_fid as user_fid,
        'follow_add' as type,
        jsonb_build_object('watched_fid', watched_fid) as metadata,
        created_at
      FROM user_watches
      ON CONFLICT DO NOTHING;
    `);

    // 4g: session_depth from feed_view_sessions (duration_seconds >= 60)
    console.log("  - Backfilling session_depth from feed_view_sessions...");
    await db.execute(sql`
      INSERT INTO activity_events (user_fid, type, metadata, created_at)
      SELECT DISTINCT
        user_fid,
        'session_depth' as type,
        jsonb_build_object('duration_seconds', duration_seconds, 'feed_type', feed_type) as metadata,
        created_at
      FROM feed_view_sessions
      WHERE user_fid IS NOT NULL AND duration_seconds >= 60
      ON CONFLICT DO NOTHING;
    `);

    console.log("✅ Backfilled activity_events");

    // Step 5: Update last_qualifying_activity_at from activity_events
    console.log("Step 5: Updating last_qualifying_activity_at from activity_events...");
    await db.execute(sql`
      UPDATE users u
      SET last_qualifying_activity_at = (
        SELECT MAX(created_at)
        FROM activity_events
        WHERE user_fid = u.fid
      )
      WHERE EXISTS (
        SELECT 1 FROM activity_events WHERE user_fid = u.fid
      );
    `);
    console.log("✅ Updated last_qualifying_activity_at");

    console.log("✅ Migration completed successfully!");
    console.log("- Added first_sign_in_at and last_qualifying_activity_at to users table");
    console.log("- Created activity_events table");
    console.log("- Backfilled activity_events from existing tables");
    console.log("- Backfilled first_sign_in_at from sign_in_logs");
    console.log("- Updated last_qualifying_activity_at from activity_events");
  } catch (error) {
    console.error("❌ Error running migration:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runMigration();


