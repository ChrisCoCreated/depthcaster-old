import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { userNotifications, webhooks } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { sendPushNotificationToUser } from "@/lib/pushNotifications";

// Disable body parsing to read raw body for signature verification
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string
): boolean {
  // Try both SHA-256 and SHA-512 since signature is 128 chars (64 bytes)
  // SHA-256 produces 32 bytes (64 hex chars)
  // SHA-512 produces 64 bytes (128 hex chars) - this matches!
  
  // Try SHA-512 first since signature is 128 chars
  const hmac512 = createHmac("sha512", secret);
  hmac512.update(rawBody);
  const digest512 = hmac512.digest("hex"); // This is 128 hex characters (64 bytes)
  
  // Also try SHA-256
  const hmac256 = createHmac("sha256", secret);
  hmac256.update(rawBody);
  const digest256 = hmac256.digest("hex"); // This is 64 hex characters (32 bytes)
  
  // Normalize signature to lowercase
  const normalizedSignature = signature.toLowerCase();
  
  // Try SHA-512 first (matches 128 char signature)
  if (normalizedSignature.length === digest512.length) {
    try {
      const sigBuffer = Buffer.from(normalizedSignature, "hex");
      const digestBuffer = Buffer.from(digest512.toLowerCase(), "hex");
      
      if (sigBuffer.length === digestBuffer.length) {
        const isValid = timingSafeEqual(sigBuffer, digestBuffer);
        if (isValid) return true;
      }
    } catch (error) {
      console.error("SHA-512 comparison error:", error);
    }
  }
  
  // Try SHA-256 (if signature is 64 chars or first 64 chars match)
  if (normalizedSignature.length === digest256.length || normalizedSignature.length === 128) {
    const sigToCompare = normalizedSignature.length === 128 
      ? normalizedSignature.substring(0, 64) 
      : normalizedSignature;
    
    try {
      const sigBuffer = Buffer.from(sigToCompare, "hex");
      const digestBuffer = Buffer.from(digest256.toLowerCase(), "hex");
      
      if (sigBuffer.length === digestBuffer.length) {
        const isValid = timingSafeEqual(sigBuffer, digestBuffer);
        if (isValid) return true;
      }
    } catch (error) {
      console.error("SHA-256 comparison error:", error);
    }
  }
  
  return false;
}

export async function POST(request: NextRequest) {
  try {
    // Get the raw body for signature verification
    const rawBody = await request.text();
    
    // Get the signature from headers
    const signature = request.headers.get("x-neynar-signature") || 
                      request.headers.get("X-Neynar-Signature") ||
                      request.headers.get("X-NEYNAR-SIGNATURE");
    
    // Look up webhook(s) by type to get the secret(s)
    // All user-watch webhooks use the same URL endpoint, so we look up by type
    // and try each secret until one validates (each webhook has its own secret)
    const webhookRecords = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.type, "user-watch"));

    // Verify webhook signature using stored secret(s)
    if (signature && webhookRecords.length > 0) {
      // Try each webhook's secret until one validates
      let isValid = false;
      let verifiedWebhookId = null;
      
      console.log(`[Webhook] Attempting signature verification with ${webhookRecords.length} webhook(s)`);
      
      for (const webhookRecord of webhookRecords) {
        if (webhookRecord.secret) {
          // Handle secret stored as JSON string (extract 'value' field) or plain string
          let secretValue = webhookRecord.secret;
          try {
            // Try parsing as JSON first
            const parsed = JSON.parse(secretValue);
            if (parsed && typeof parsed === 'object' && parsed.value) {
              secretValue = parsed.value;
              console.log(`[Webhook] Parsed JSON secret for webhook ${webhookRecord.neynarWebhookId}, using value field`);
            }
          } catch (e) {
            // Not JSON, use as-is
            console.log(`[Webhook] Using secret as plain string for webhook ${webhookRecord.neynarWebhookId}`);
          }
          
          console.log(`[Webhook] Trying secret for webhook ${webhookRecord.neynarWebhookId} (secret ends with: ${secretValue.slice(-4)})`);
          isValid = verifyWebhookSignature(rawBody, signature, secretValue);
          if (isValid) {
            verifiedWebhookId = webhookRecord.neynarWebhookId;
            console.log(`[Webhook] ✓ Signature verified using webhook ${verifiedWebhookId}`);
            break;
          } else {
            console.log(`[Webhook] ✗ Signature verification failed for webhook ${webhookRecord.neynarWebhookId}`);
          }
        } else {
          console.log(`[Webhook] Webhook ${webhookRecord.neynarWebhookId} has no secret stored`);
        }
      }

      if (!isValid) {
        // Check if any webhooks have secrets configured
        const webhooksWithSecrets = webhookRecords.filter(w => w.secret);
        if (webhooksWithSecrets.length === 0) {
          console.log("[Webhook] No webhooks have secrets configured yet - skipping verification (webhooks need to be refreshed)");
        } else {
          console.log(`[Webhook] ✗ Invalid webhook signature - tried ${webhooksWithSecrets.length} webhook(s), all failed`);
          console.log(`[Webhook] Signature header: ${signature.substring(0, 20)}... (length: ${signature.length})`);
          return NextResponse.json(
            { error: "Invalid webhook signature" },
            { status: 401 }
          );
        }
      }
    } else if (signature && webhookRecords.length === 0) {
      console.log("[Webhook] No webhook found, but signature present - skipping verification");
    } else if (!signature) {
      console.log("[Webhook] No signature header - skipping verification");
    } else {
      console.log("[Webhook] No webhook records found, skipping verification");
    }
    
    // Parse the body
    const body = JSON.parse(rawBody);
    
    // Neynar webhook format: { type: "cast.created", data: { hash: "0x...", parent_hash: "0x...", author: { fid: 123 } } }
    const eventType = body.type;
    const castData = body.data;

    console.log(`[Webhook] Received event: ${eventType}`);

    if (eventType !== "cast.created" || !castData) {
      console.log(`[Webhook] Ignoring non-cast.created event (type: ${eventType}) or missing data`);
      return NextResponse.json({ success: true, message: "Event ignored" });
    }

    const castHash = castData.hash;
    const parentHash = castData.parent_hash;
    const authorFid = castData.author?.fid;

    console.log(`[Webhook] Processing cast.created - hash: ${castHash}, authorFid: ${authorFid}, parentHash: ${parentHash}`);

    if (!castHash || !authorFid) {
      console.log("[Webhook] Missing required fields in webhook payload", { castHash, authorFid });
      return NextResponse.json({ success: true, message: "Missing required fields" });
    }

    // Handle user notifications for parent casts (not replies)
    // This webhook is filtered to only send casts from watched users
    if (parentHash === null || parentHash === undefined) {
      // Parent cast - check if this should trigger user notifications
      // We need to find which watchers are watching this author
      const { userWatches } = await import("@/lib/schema");
      const watchers = await db
        .select({ watcherFid: userWatches.watcherFid })
        .from(userWatches)
        .where(eq(userWatches.watchedFid, authorFid));

      console.log(`[Webhook] Found ${watchers.length} watcher(s) for author ${authorFid}`);

      // Create notifications for all watchers
      if (watchers.length > 0) {
        const notifications = watchers.map((w) => ({
          userFid: w.watcherFid,
          type: "cast.created",
          castHash,
          castData,
          authorFid,
          isRead: false,
        }));

        await db.insert(userNotifications).values(notifications).onConflictDoNothing();
        console.log(`[Webhook] Created ${notifications.length} notification(s) for cast ${castHash}`);

        // Send push notifications to all watchers who have push subscriptions
        const authorUsername = castData.author?.username || castData.author?.display_name || "Someone";
        const castText = castData.text || "";
        const previewText = castText.length > 100 ? castText.substring(0, 100) + "..." : castText;

        for (const notification of notifications) {
          try {
            const result = await sendPushNotificationToUser(notification.userFid, {
              title: `${authorUsername} posted a new cast`,
              body: previewText || "New cast from someone you're watching",
              icon: castData.author?.pfp_url || "/icon-192x192.webp",
              badge: "/icon-96x96.webp",
              data: { url: `/cast/${castHash}` },
            });

            if (result.sent > 0) {
              console.log(`[Webhook] Sent push notification to user ${notification.userFid}: ${result.sent} device(s)`);
            }
          } catch (error) {
            console.error(`[Webhook] Error sending push notification to user ${notification.userFid}:`, error);
            // Don't fail the webhook if push notification fails
          }
        }
      } else {
        console.log(`[Webhook] No watchers found for author ${authorFid}, skipping notification creation`);
      }
    } else {
      console.log(`[Webhook] Cast is a reply (parentHash: ${parentHash}), skipping notification`);
    }
    // Note: Reply tracking is now handled via interaction tracking in the app (cast/reaction APIs)

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("[Webhook] Handler error:", error);
    const err = error as { message?: string };
    return NextResponse.json(
      { error: err.message || "Failed to process webhook" },
      { status: 500 }
    );
  }
}

