import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function addWebhookSecretColumn() {
  try {
    console.log("Adding secret column to webhooks table...");
    
    // Check if column already exists
    const checkResult = await db.execute(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'webhooks' AND column_name = 'secret'
    `);
    
    if (checkResult.rows && checkResult.rows.length > 0) {
      console.log("Secret column already exists, skipping...");
      return;
    }
    
    // Add the secret column
    await db.execute(sql`
      ALTER TABLE "webhooks" ADD COLUMN "secret" text;
    `);
    
    console.log("✓ Successfully added secret column to webhooks table");
  } catch (error: any) {
    console.error("Error adding secret column:", error);
    throw error;
  }
}

addWebhookSecretColumn()
  .then(() => {
    console.log("Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Failed:", error);
    process.exit(1);
  });

