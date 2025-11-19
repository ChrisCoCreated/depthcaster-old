import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function runMigration() {
  try {
    console.log("Running migration 0011: Create placeholder curated cast for parent casts...");

    // Create placeholder curated cast for parent casts saved for display purposes only
    await db.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM "curated_casts" 
          WHERE "cast_hash" = '0x0000000000000000000000000000000000000000'
        ) THEN
          INSERT INTO "curated_casts" ("cast_hash", "cast_data", "curator_fid", "created_at")
          VALUES (
            '0x0000000000000000000000000000000000000000',
            '{"hash": "0x0000000000000000000000000000000000000000", "text": "Placeholder for parent cast metadata"}'::jsonb,
            NULL,
            NOW()
          );
        END IF;
      END $$;
    `);

    console.log("✓ Migration completed successfully!");
    console.log("- Created placeholder curated cast (0x0000...) for parent cast metadata");
  } catch (error) {
    console.error("Error running migration:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runMigration();


