/**
 * Create the unified reaction webhook for curated casts
 * 
 * Usage: npx tsx scripts/create-reaction-webhook.ts
 */
import { config } from "dotenv";
import { resolve } from "path";

// Load environment variables BEFORE any imports that depend on them
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

async function createReactionWebhook() {
  // Dynamic import after env vars are loaded
  const { createUnifiedCuratedReactionWebhook } = await import("../lib/webhooks-unified");
  
  console.log("Creating unified reaction webhook...");
  try {
    const result = await createUnifiedCuratedReactionWebhook();
    if (result) {
      console.log(`✓ Successfully created reaction webhook`);
      console.log(`  Webhook ID: ${result.neynarWebhookId}`);
      console.log(`\n⚠️  IMPORTANT: Add this webhook to scripts/sync-unified-webhooks.ts:`);
      console.log(`  {
        name: "curated-reactions-unified",
        neynarWebhookId: "${result.neynarWebhookId}",
        type: "curated-reaction",
        secret: "<get from database>",
      },`);
    } else {
      console.log("No curated casts found, skipping webhook creation");
    }
  } catch (error) {
    console.error("Failed to create reaction webhook:", error);
    process.exit(1);
  }
}

createReactionWebhook()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });

