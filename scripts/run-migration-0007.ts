import { config } from "dotenv";
import { resolve } from "path";

// Load environment variables from .env.local or .env
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function runMigration() {
  try {
    console.log("Running migration 0007: Add conversation storage...");

    // Add conversationFetchedAt to curated_casts table
    await db.execute(sql`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'curated_casts' AND column_name = 'conversation_fetched_at'
        ) THEN
          ALTER TABLE curated_casts ADD COLUMN conversation_fetched_at TIMESTAMP;
        END IF;
      END $$;
    `);

    // Ensure cast_hash has a unique constraint in curated_casts (required for foreign key)
    await db.execute(sql`
      DO $$ 
      BEGIN
        -- Check if unique constraint already exists
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'curated_casts_cast_hash_unique'
        ) THEN
          -- Check if there are duplicate cast_hashes
          IF NOT EXISTS (
            SELECT 1 FROM curated_casts 
            GROUP BY cast_hash 
            HAVING COUNT(*) > 1
          ) THEN
            -- Add unique constraint
            ALTER TABLE curated_casts 
            ADD CONSTRAINT curated_casts_cast_hash_unique UNIQUE (cast_hash);
          ELSE
            RAISE NOTICE 'Cannot add unique constraint: duplicate cast_hash values exist';
          END IF;
        END IF;
      END $$;
    `);

    // Create cast_replies table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS cast_replies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        curated_cast_hash TEXT NOT NULL,
        reply_cast_hash TEXT NOT NULL,
        cast_data JSONB NOT NULL,
        parent_cast_hash TEXT,
        root_cast_hash TEXT NOT NULL,
        reply_depth INTEGER DEFAULT 0 NOT NULL,
        is_quote_cast BOOLEAN DEFAULT false NOT NULL,
        quoted_cast_hash TEXT,
        created_at TIMESTAMP DEFAULT now() NOT NULL
      );
    `);

    // Add foreign key constraint (only if unique constraint exists)
    await db.execute(sql`
      DO $$ 
      BEGIN
        -- Check if unique constraint exists on curated_casts.cast_hash
        IF EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'curated_casts_cast_hash_unique'
        ) THEN
          -- Add foreign key constraint if it doesn't exist
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint 
            WHERE conname = 'cast_replies_curated_cast_hash_curated_casts_cast_hash_fk'
          ) THEN
            ALTER TABLE cast_replies 
            ADD CONSTRAINT cast_replies_curated_cast_hash_curated_casts_cast_hash_fk 
            FOREIGN KEY (curated_cast_hash) 
            REFERENCES curated_casts(cast_hash) 
            ON DELETE CASCADE 
            ON UPDATE NO ACTION;
          END IF;
        ELSE
          RAISE NOTICE 'Skipping foreign key constraint: unique constraint on curated_casts.cast_hash does not exist';
        END IF;
      END $$;
    `);

    // Create indexes
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS reply_cast_hash_unique ON cast_replies(reply_cast_hash);
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS cast_replies_curated_cast_hash_idx ON cast_replies(curated_cast_hash);
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS cast_replies_quoted_cast_hash_idx ON cast_replies(quoted_cast_hash);
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS cast_replies_curated_cast_hash_reply_depth_idx 
      ON cast_replies(curated_cast_hash, reply_depth);
    `);

    console.log("Migration completed successfully!");
    console.log("- Added conversation_fetched_at column to curated_casts table");
    console.log("- Created cast_replies table");
    console.log("- Created indexes for cast_replies table");
  } catch (error) {
    console.error("Error running migration:", error);
    process.exit(1);
  }
}

runMigration();

