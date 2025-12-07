import { resolve } from "path";
import { config } from "dotenv";

// Load environment variables
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function runMigration() {
  try {
    console.log("Running migration: Create sign_in_logs table...");

    // Create sign_in_logs table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS sign_in_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        user_fid bigint,
        request_data jsonb,
        response_data jsonb,
        signer_uuid text,
        success boolean NOT NULL,
        error text,
        created_at timestamp DEFAULT now() NOT NULL
      );
    `);

    // Add foreign key constraint
    await db.execute(sql`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'sign_in_logs_user_fid_users_fid_fk'
        ) THEN
          ALTER TABLE sign_in_logs 
          ADD CONSTRAINT sign_in_logs_user_fid_users_fid_fk 
          FOREIGN KEY (user_fid) 
          REFERENCES users(fid) 
          ON DELETE NO ACTION 
          ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    // Create indexes
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS sign_in_logs_user_fid_idx 
      ON sign_in_logs(user_fid);
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS sign_in_logs_created_at_idx 
      ON sign_in_logs(created_at);
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS sign_in_logs_user_fid_created_at_idx 
      ON sign_in_logs(user_fid, created_at);
    `);

    console.log("✅ Migration completed successfully!");
    console.log("- Created sign_in_logs table");
    console.log("- Added foreign key constraint");
    console.log("- Created indexes");
  } catch (error) {
    console.error("❌ Error running migration:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runMigration();

