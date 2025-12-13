import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), ".env.local") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function runMigration() {
  try {
    console.log("Running migration 0026: Add polls tables...");

    // Create polls table
    console.log("Creating polls table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "polls" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "cast_hash" text NOT NULL,
        "question" text NOT NULL,
        "created_by" bigint NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
    `);

    // Create unique index on cast_hash
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS "polls_cast_hash_unique" ON "polls" ("cast_hash");
    `);

    // Create indexes
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "polls_cast_hash_idx" ON "polls" ("cast_hash");
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "polls_created_by_idx" ON "polls" ("created_by");
    `);

    // Add foreign key constraints
    await db.execute(sql`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'polls_cast_hash_curated_casts_cast_hash_fk'
        ) THEN
          ALTER TABLE "polls" 
          ADD CONSTRAINT "polls_cast_hash_curated_casts_cast_hash_fk" 
          FOREIGN KEY ("cast_hash") 
          REFERENCES "curated_casts"("cast_hash") 
          ON DELETE CASCADE 
          ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    await db.execute(sql`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'polls_created_by_users_fid_fk'
        ) THEN
          ALTER TABLE "polls" 
          ADD CONSTRAINT "polls_created_by_users_fid_fk" 
          FOREIGN KEY ("created_by") 
          REFERENCES "users"("fid") 
          ON DELETE NO ACTION 
          ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
    console.log("✓ Created polls table");

    // Create poll_options table
    console.log("Creating poll_options table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "poll_options" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "poll_id" uuid NOT NULL,
        "option_text" text NOT NULL,
        "order" integer NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `);

    // Create indexes
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "poll_options_poll_id_idx" ON "poll_options" ("poll_id");
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "poll_options_poll_id_order_idx" ON "poll_options" ("poll_id", "order");
    `);

    // Add foreign key constraint
    await db.execute(sql`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'poll_options_poll_id_polls_id_fk'
        ) THEN
          ALTER TABLE "poll_options" 
          ADD CONSTRAINT "poll_options_poll_id_polls_id_fk" 
          FOREIGN KEY ("poll_id") 
          REFERENCES "polls"("id") 
          ON DELETE CASCADE 
          ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
    console.log("✓ Created poll_options table");

    // Create poll_responses table
    console.log("Creating poll_responses table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "poll_responses" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "poll_id" uuid NOT NULL,
        "user_fid" bigint NOT NULL,
        "rankings" jsonb NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
    `);

    // Create unique index on (poll_id, user_fid)
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS "poll_responses_poll_user_unique" ON "poll_responses" ("poll_id", "user_fid");
    `);

    // Create indexes
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "poll_responses_poll_id_idx" ON "poll_responses" ("poll_id");
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "poll_responses_user_fid_idx" ON "poll_responses" ("user_fid");
    `);

    // Add foreign key constraints
    await db.execute(sql`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'poll_responses_poll_id_polls_id_fk'
        ) THEN
          ALTER TABLE "poll_responses" 
          ADD CONSTRAINT "poll_responses_poll_id_polls_id_fk" 
          FOREIGN KEY ("poll_id") 
          REFERENCES "polls"("id") 
          ON DELETE CASCADE 
          ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    await db.execute(sql`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'poll_responses_user_fid_users_fid_fk'
        ) THEN
          ALTER TABLE "poll_responses" 
          ADD CONSTRAINT "poll_responses_user_fid_users_fid_fk" 
          FOREIGN KEY ("user_fid") 
          REFERENCES "users"("fid") 
          ON DELETE CASCADE 
          ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
    console.log("✓ Created poll_responses table");

    console.log("\n✓ Migration completed successfully!");
    console.log("- Created polls table");
    console.log("- Created poll_options table");
    console.log("- Created poll_responses table");
    console.log("- Created all indexes and foreign key constraints");
  } catch (error) {
    console.error("Error running migration:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runMigration();
