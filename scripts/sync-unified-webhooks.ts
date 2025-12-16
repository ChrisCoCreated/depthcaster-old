/**
 * Sync/refresh the unified Neynar webhooks used by Sopha.
 * Includes: curated-reply, curated-quote, curated-reaction, and user-watch webhooks.
 *
 * Usage: npx tsx scripts/sync-unified-webhooks.ts
 */
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { webhooks } from "../lib/schema";
import { eq, notInArray } from "drizzle-orm";
import { refreshUnifiedCuratedWebhooks } from "../lib/webhooks-unified";
import { refreshUnifiedUserWatchWebhook } from "../lib/webhooks-unified-watches";

type ExpectedWebhook = {
  neynarWebhookId: string;
  type: "curated-reply" | "curated-quote" | "curated-reaction" | "user-watch";
  name: string;
  secret: string;
};

const WEBHOOK_BASE_URL =
  process.env.WEBHOOK_BASE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://depthcaster.vercel.app";

const webhookEndpoint = `${WEBHOOK_BASE_URL}/api/webhooks`;

const EXPECTED_WEBHOOKS: ExpectedWebhook[] = [
  {
    name: "curated-replies-unified",
    neynarWebhookId: "01KA47AQSZV42RCY7B399X5PGM",
    type: "curated-reply",
    secret: "thw5vvOv2WvHPXdfWdYIk3zGT",
  },
  {
    name: "curated-quotes-unified",
    neynarWebhookId: "01KA47ARX6SMBHJ17V9ZCV10PX",
    type: "curated-quote",
    secret: "XQ9qSSkDm5w0PpYVa9h-i3fg5",
  },
  {
    name: "user-watches-unified",
    neynarWebhookId: "01KA4AEVR22SWJ088DBG0F28N4",
    type: "user-watch",
    secret: "_XZbjMkINuJ36_Ky4PY_xHPd5",
  },
  {
    name: "curated-reactions-unified",
    neynarWebhookId: "01KB6132663X5HFEGEV5KSK6K6",
    type: "curated-reaction",
    secret: "1QfJI-vLy4SjagS8hfyGAzfRt",
  },
];

async function syncUnifiedWebhooks() {
  console.log("== Unified webhook sync ==");
  console.log(`Target URL: ${webhookEndpoint}`);
  console.log();

  const expectedIds = EXPECTED_WEBHOOKS.map((webhook) => webhook.neynarWebhookId);

  const extraWebhooks = await db
    .select()
    .from(webhooks)
    .where(notInArray(webhooks.neynarWebhookId, expectedIds));

  if (extraWebhooks.length > 0) {
    console.log("Found additional webhook rows:");
    for (const row of extraWebhooks) {
      console.log(
        ` - ${row.neynarWebhookId} [${row.type}] url=${row.url} created=${row.createdAt.toISOString()}`
      );
    }
    console.log("Deleting extra webhook records from database...");
    await db
      .delete(webhooks)
      .where(notInArray(webhooks.neynarWebhookId, expectedIds));
    console.log(`Removed ${extraWebhooks.length} extra row(s).\n`);
  } else {
    console.log("No extra webhook rows detected.\n");
  }

  for (const target of EXPECTED_WEBHOOKS) {
    const [existing] = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.neynarWebhookId, target.neynarWebhookId))
      .limit(1);

    if (existing) {
      console.log(
        `Updating stored metadata for ${target.name} (${target.neynarWebhookId})`
      );
      await db
        .update(webhooks)
        .set({
          type: target.type,
          url: webhookEndpoint,
          secret: target.secret,
          config: existing.config ?? {},
          updatedAt: new Date(),
        })
        .where(eq(webhooks.id, existing.id));
    } else {
      console.log(
        `Inserting placeholder row for ${target.name} (${target.neynarWebhookId})`
      );
      await db.insert(webhooks).values({
        neynarWebhookId: target.neynarWebhookId,
        type: target.type,
        url: webhookEndpoint,
        secret: target.secret,
        config: {},
      });
    }
  }

  console.log();
  console.log("Refreshing unified webhook subscriptions...");
  await refreshUnifiedCuratedWebhooks();
  await refreshUnifiedUserWatchWebhook();
  console.log("Refresh complete.");

  console.log();
  console.log("Final webhook rows:");
  const allWebhooks = await db.select().from(webhooks);
  for (const row of allWebhooks) {
    console.log(
      ` - ${row.neynarWebhookId} [${row.type}] url=${row.url} secret=${row.secret?.slice(-4)}`
    );
  }

  console.log();
  console.log("Unified webhook sync finished.");
}

syncUnifiedWebhooks()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Sync failed:", error);
    process.exit(1);
  });

