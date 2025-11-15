import { config } from "dotenv";
import { resolve } from "path";

// Load environment variables from .env.local or .env
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";
import { userRoles } from "../lib/schema";

async function runMigration() {
  try {
    console.log("Running migration 0008: Create user_roles table and migrate role data...");

    // Create user_roles table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        user_fid BIGINT NOT NULL,
        role TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT now() NOT NULL
      );
    `);

    // Add foreign key constraint
    await db.execute(sql`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'user_roles_user_fid_users_fid_fk'
        ) THEN
          ALTER TABLE user_roles 
          ADD CONSTRAINT user_roles_user_fid_users_fid_fk 
          FOREIGN KEY (user_fid) 
          REFERENCES users(fid) 
          ON DELETE CASCADE 
          ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    // Create unique constraint on (user_fid, role)
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS user_role_unique 
      ON user_roles(user_fid, role);
    `);

    // Create index on user_fid
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS user_roles_user_fid_idx 
      ON user_roles(user_fid);
    `);

    // Migrate existing role data from users.role to user_roles
    console.log("Migrating existing role data from users.role to user_roles...");
    await db.execute(sql`
      INSERT INTO user_roles (user_fid, role, created_at)
      SELECT fid, role, COALESCE(created_at, NOW())
      FROM users
      WHERE role IS NOT NULL
        AND role != ''
        AND NOT EXISTS (
          SELECT 1 FROM user_roles ur 
          WHERE ur.user_fid = users.fid AND ur.role = users.role
        );
    `);

    // Get count of migrated roles
    const countResult = await db
      .select({ count: sql<number>`count(*)::int`.as("count") })
      .from(userRoles);
    const count = countResult[0]?.count || 0;

    console.log("Migration completed successfully!");
    console.log(`- Created user_roles table`);
    console.log(`- Migrated role data from users.role column`);
    console.log(`- Total roles in user_roles table: ${count}`);
  } catch (error) {
    console.error("Error running migration:", error);
    process.exit(1);
  }
}

runMigration();

