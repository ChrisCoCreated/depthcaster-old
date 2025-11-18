import { resolve } from "path";
import { config } from "dotenv";

// Load environment variables
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function fixAdminFid() {
  try {
    console.log("Making admin_fid nullable in build_ideas...");

    // Make admin_fid nullable
    await db.execute(sql`
      ALTER TABLE "build_ideas" ALTER COLUMN "admin_fid" DROP NOT NULL;
    `);

    console.log("✅ Successfully made admin_fid nullable");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

fixAdminFid();


