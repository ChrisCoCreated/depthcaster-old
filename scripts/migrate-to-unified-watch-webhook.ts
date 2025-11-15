/**
 * Script to migrate from per-user watch webhooks to unified watch webhook
 * 
 * Usage: npx tsx scripts/migrate-to-unified-watch-webhook.ts
 */

import { config } from "dotenv";
import { resolve } from "path";

// Load environment variables from .env.local or .env
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { webhooks } from "../lib/schema";
import { eq, and, sql } from "drizzle-orm";
import { neynarClient } from "../lib/neynar";
import { refreshUnifiedUserWatchWebhook } from "../lib/webhooks-unified-watches";

async function migrateToUnifiedWatchWebhook() {
  console.log("Starting migration to unified watch webhook...\n");

  try {
    // Step 1: Find all old per-user watch webhooks
    const oldWebhooks = await db
      .select()
      .from(webhooks)
      .where(
        and(
          eq(webhooks.type, "user-watch"),
          sql`${webhooks.config}->>'watcherFid' IS NOT NULL`
        )
      );

    console.log(`Found ${oldWebhooks.length} old per-user watch webhook(s)\n`);

    // Step 2: Delete old webhooks from Neynar and database
    if (oldWebhooks.length > 0) {
      console.log("Deleting old per-user webhooks...");
      for (const oldWebhook of oldWebhooks) {
        try {
          await neynarClient.deleteWebhook({ webhookId: oldWebhook.neynarWebhookId });
          console.log(`  ✓ Deleted webhook ${oldWebhook.neynarWebhookId} from Neynar`);
        } catch (error: any) {
          console.error(`  ✗ Error deleting webhook ${oldWebhook.neynarWebhookId}:`, error?.message);
        }
        
        try {
          await db.delete(webhooks).where(eq(webhooks.id, oldWebhook.id));
          console.log(`  ✓ Deleted webhook ${oldWebhook.neynarWebhookId} from database`);
        } catch (error: any) {
          console.error(`  ✗ Error deleting webhook from database:`, error?.message);
        }
      }
      console.log();
    }

    // Step 3: Create/update unified webhook
    console.log("Creating/updating unified watch webhook...");
    try {
      await refreshUnifiedUserWatchWebhook();
      console.log("  ✓ Successfully created/updated unified watch webhook\n");
    } catch (error: any) {
      console.error("  ✗ Error creating unified webhook:", error?.message);
      throw error;
    }

    // Summary
    console.log("=".repeat(60));
    console.log("MIGRATION SUMMARY");
    console.log("=".repeat(60));
    console.log(`Old webhooks deleted: ${oldWebhooks.length}`);
    console.log(`Unified webhook: Created/Updated`);
    console.log("\nMigration complete!");
  } catch (error: any) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

migrateToUnifiedWatchWebhook()
  .then(() => {
    console.log("\nScript finished successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nScript failed:", error);
    process.exit(1);
  });

