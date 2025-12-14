import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { userNotifications, webhooks, castReplies, curatedCasts, curatedCastInteractions } from "@/lib/schema";
import { eq, and, or } from "drizzle-orm";
import { sendPushNotificationToUser } from "@/lib/pushNotifications";
import { meetsCastQualityThreshold } from "@/lib/cast-quality";
import { isQuoteCast, extractQuotedCastHashes, getRootCastHash } from "@/lib/conversation";
import { addQuoteCastToUnifiedReplyWebhook, addReplyToUnifiedReplyWebhook } from "@/lib/webhooks-unified";
import { neynarClient } from "@/lib/neynar";
import { LookupCastConversationTypeEnum } from "@neynar/nodejs-sdk/build/api";
import { analyzeCastQualityAsync } from "@/lib/deepseek-quality";
import { findOriginalCuratedCast } from "@/lib/interactions";
import { getUserRoles } from "@/lib/roles";
import { upsertUser } from "@/lib/users";

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

/**
 * Handle reaction webhook events (reaction.created and reaction.deleted)
 */
async function handleReactionEvent(
  eventType: string,
  reactionData: { reaction_type?: string; target?: string; user?: { fid?: number }; cast?: { hash?: string } },
  webhookType: string | null
): Promise<NextResponse> {
  // Only process if this is from the curated-reaction webhook
  if (webhookType !== "curated-reaction") {
    console.log(`[Webhook] Reaction event not from curated-reaction webhook (type: ${webhookType}), ignoring`);
    return NextResponse.json({ success: true, message: "Event ignored" });
  }

  const reactionType = reactionData.reaction_type; // "like" or "recast"
  const targetCastHash = reactionData.target; // Cast hash that was reacted to
  const userFid = reactionData.user?.fid;

  console.log(`[Webhook] Processing ${eventType} - reactionType: ${reactionType}, target: ${targetCastHash}, userFid: ${userFid}`);

  if (!targetCastHash || !userFid || !reactionType) {
    console.log("[Webhook] Missing required fields in reaction webhook payload", { targetCastHash, userFid, reactionType });
    return NextResponse.json({ success: true, message: "Missing required fields" });
  }

  // Only process likes and recasts
  if (reactionType !== "like" && reactionType !== "recast") {
    console.log(`[Webhook] Ignoring reaction type: ${reactionType}`);
    return NextResponse.json({ success: true, message: "Reaction type not supported" });
  }

  // Check if user has a role
  const userRoles = await getUserRoles(userFid);
  if (userRoles.length === 0) {
    console.log(`[Webhook] User ${userFid} has no roles, skipping reaction storage`);
    return NextResponse.json({ success: true, message: "User has no roles" });
  }

  // Find the original curated cast for this target cast
  const curatedCastHash = await findOriginalCuratedCast(targetCastHash);
  
  if (!curatedCastHash) {
    console.log(`[Webhook] Target cast ${targetCastHash} is not part of a curated thread, skipping`);
    return NextResponse.json({ success: true, message: "Not part of curated thread" });
  }

  if (eventType === "cast.reaction.created") {
    // Store the reaction
    try {
      await db.insert(curatedCastInteractions).values({
        curatedCastHash,
        targetCastHash,
        interactionType: reactionType,
        userFid,
      }).onConflictDoNothing();

      console.log(`[Webhook] Stored ${reactionType} interaction for cast ${targetCastHash} by user ${userFid} in curated cast ${curatedCastHash}`);
    } catch (error: any) {
      if (error.code !== "23505") { // Ignore duplicate key errors
        console.error(`[Webhook] Error storing reaction interaction:`, error);
      } else {
        console.log(`[Webhook] Reaction interaction already exists (duplicate), skipping`);
      }
    }
  } else if (eventType === "cast.reaction.deleted") {
    // Remove the reaction
    try {
      await db
        .delete(curatedCastInteractions)
        .where(
          and(
            eq(curatedCastInteractions.curatedCastHash, curatedCastHash),
            eq(curatedCastInteractions.targetCastHash, targetCastHash),
            eq(curatedCastInteractions.interactionType, reactionType),
            eq(curatedCastInteractions.userFid, userFid)
          )
        );

      console.log(`[Webhook] Removed ${reactionType} interaction for cast ${targetCastHash} by user ${userFid} in curated cast ${curatedCastHash}`);
    } catch (error: any) {
      console.error(`[Webhook] Error removing reaction interaction:`, error);
    }
  }

  return NextResponse.json({ success: true });
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
    // Multiple webhook types use the same URL endpoint, so we look up all types
    // and try each secret until one validates (each webhook has its own secret)
    const webhookRecords = await db
      .select()
      .from(webhooks)
      .where(
        or(
          eq(webhooks.type, "user-watch"),
          eq(webhooks.type, "curated-reply"),
          eq(webhooks.type, "curated-quote"),
          eq(webhooks.type, "curated-reaction")
        )
      );

    // Verify webhook signature using stored secret(s)
    let verifiedWebhookId: string | null = null;
    if (signature && webhookRecords.length > 0) {
      // Try each webhook's secret until one validates
      let isValid = false;
      
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
    
    // Log full webhook structure for analysis
    console.log(`[Webhook] Full webhook payload structure:`, JSON.stringify(body, null, 2));
    
    // Neynar webhook format: { type: "cast.created" | "reaction.created" | "reaction.deleted", data: {...} }
    const eventType = body.type;
    const eventData = body.data;

    console.log(`[Webhook] Received event: ${eventType}`);

    // Determine which webhook type this event belongs to based on verified webhook
    let webhookType: string | null = null;
    let webhookConfig: any = null;
    
    if (verifiedWebhookId) {
      const verifiedWebhook = webhookRecords.find(w => w.neynarWebhookId === verifiedWebhookId);
      if (verifiedWebhook) {
        webhookType = verifiedWebhook.type;
        webhookConfig = verifiedWebhook.config;
        console.log(`[Webhook] Verified hook type: ${webhookType} (${verifiedWebhookId})`);
      }
    }

    // Handle reaction events
    if (eventType === "reaction.created" || eventType === "reaction.deleted") {
      return await handleReactionEvent(eventType, eventData, webhookType);
    }

    // Handle cast.created events (replies and quotes)
    if (eventType !== "cast.created" || !eventData) {
      console.log(`[Webhook] Ignoring unsupported event (type: ${eventType}) or missing data`);
      return NextResponse.json({ success: true, message: "Event ignored" });
    }

    const castData = eventData;

    const castHash = castData.hash;
    const parentHash = castData.parent_hash;
    const authorFid = castData.author?.fid;

    console.log(`[Webhook] Processing cast.created - hash: ${castHash}, authorFid: ${authorFid}, parentHash: ${parentHash}`);

    if (!castHash || !authorFid) {
      console.log("[Webhook] Missing required fields in webhook payload", { castHash, authorFid });
      return NextResponse.json({ success: true, message: "Missing required fields" });
    }

    // Handle curated conversation webhooks (unified webhooks)
    if (webhookType === "curated-reply" || webhookType === "curated-quote") {
      // Check if cast meets quality threshold (webhook filter may have already done this, but double-check)
      if (!meetsCastQualityThreshold(castData)) {
        console.log(`[Webhook] Cast ${castHash} does not meet quality threshold, skipping`);
        return NextResponse.json({ success: true, message: "Cast does not meet quality threshold" });
      }

      // Check if this is a quote cast
      const isQuote = isQuoteCast(castData);
      
      if (isQuote && webhookType === "curated-quote") {
        // Handle quote cast - check if any quoted cast is curated
        const quotedCastHashes = extractQuotedCastHashes(castData);
        
        for (const quotedCastHash of quotedCastHashes) {
          // Check if quoted cast is curated
          const curatedCast = await db
            .select()
            .from(curatedCasts)
            .where(eq(curatedCasts.castHash, quotedCastHash))
            .limit(1);

          if (curatedCast.length > 0) {
            // Calculate reply depth (0 for top-level quote, or traverse parent chain)
            let replyDepth = 0;
            if (parentHash) {
              // If quote cast is also a reply, calculate depth
              const rootHash = await getRootCastHash(castHash);
              // For now, assume depth 1 if it has a parent
              replyDepth = 1;
            }

            // Store quote cast as reply (quality already checked at top level)
            try {
              const { extractCastTimestamp } = await import("@/lib/cast-timestamp");
              const { extractCastMetadata } = await import("@/lib/cast-metadata");
              const metadata = extractCastMetadata(castData);

              // Ensure the author exists in the users table before inserting the cast reply
              let finalAuthorFid = metadata.authorFid;
              if (metadata.authorFid) {
                const authorData = castData?.author;
                try {
                  await upsertUser(metadata.authorFid, {
                    username: authorData?.username,
                    displayName: authorData?.display_name,
                    pfpUrl: authorData?.pfp_url,
                  });
                } catch (error) {
                  console.error(`[Webhook] Failed to upsert author ${metadata.authorFid} for quote cast:`, error);
                  // If upsert fails, set authorFid to null to avoid foreign key constraint violation
                  // The foreign key constraint has onDelete: "set null", so null is acceptable
                  finalAuthorFid = null;
                }
              }

              await db.insert(castReplies).values({
                curatedCastHash: quotedCastHash,
                replyCastHash: castHash,
                castData: castData,
                castCreatedAt: extractCastTimestamp(castData),
                parentCastHash: parentHash || null,
                rootCastHash: quotedCastHash,
                replyDepth,
                isQuoteCast: true,
                quotedCastHash: quotedCastHash,
                castText: metadata.castText,
                castTextLength: metadata.castTextLength,
                authorFid: finalAuthorFid,
                likesCount: metadata.likesCount,
                recastsCount: metadata.recastsCount,
                repliesCount: metadata.repliesCount,
                engagementScore: metadata.engagementScore,
              }).onConflictDoNothing({ target: castReplies.replyCastHash });

              // Note: We don't record activity events for webhook events as they are protocol-level,
              // not app-specific activities. Only app-originated casts (via /api/cast) count as active users.

              console.log(`[Webhook] Stored cast via curated-quote webhook: castHash=${castHash} curatedCastHash=${quotedCastHash}`);

              // Trigger async quality analysis (non-blocking)
              analyzeCastQualityAsync(castHash, castData, async (hash, result) => {
                try {
                  await db
                    .update(castReplies)
                    .set({
                      qualityScore: result.qualityScore,
                      category: result.category,
                      qualityAnalyzedAt: new Date(),
                    })
                    .where(eq(castReplies.replyCastHash, hash));
                  console.log(`[Webhook] Quality analysis completed for quote cast ${hash}: score=${result.qualityScore}, category=${result.category}`);
                  
                  // Notify curators if quality score meets threshold
                  if (result.qualityScore !== undefined) {
                    const { notifyCuratorsAboutQualityReply } = await import("@/lib/notifications");
                    notifyCuratorsAboutQualityReply(
                      quotedCastHash,
                      hash,
                      castData,
                      result.qualityScore
                    ).catch((error) => {
                      console.error(`[Webhook] Error notifying curators about quality quote ${hash}:`, error);
                      // Don't fail if notification fails
                    });
                  }
                } catch (error: any) {
                  console.error(`[Webhook] Error updating quality analysis for quote cast ${hash}:`, error.message);
                }
              });

              // Ensure unified reply webhook tracks this quote conversation
              try {
                await addQuoteCastToUnifiedReplyWebhook(castHash);
              } catch (error) {
                console.error(
                  `[Webhook] Error updating unified reply webhook for quote cast ${castHash}:`,
                  error
                );
              }

              // Fetch and update the root cast to refresh reactions data
              try {
                const rootCastResponse = await neynarClient.lookupCastConversation({
                  identifier: quotedCastHash,
                  type: LookupCastConversationTypeEnum.Hash,
                  replyDepth: 0,
                  includeChronologicalParentCasts: false,
                });

                const updatedRootCast = rootCastResponse.conversation?.cast;
                if (updatedRootCast) {
                  const { extractCastMetadata } = await import("@/lib/cast-metadata");
                  const metadata = extractCastMetadata(updatedRootCast);
                  await db
                    .update(curatedCasts)
                    .set({
                      castData: updatedRootCast,
                      castText: metadata.castText,
                      castTextLength: metadata.castTextLength,
                      authorFid: metadata.authorFid,
                      likesCount: metadata.likesCount,
                      recastsCount: metadata.recastsCount,
                      repliesCount: metadata.repliesCount,
                      engagementScore: metadata.engagementScore,
                      parentHash: metadata.parentHash,
                    })
                    .where(eq(curatedCasts.castHash, quotedCastHash));
                  
                  console.log(`[Webhook] Updated root cast ${quotedCastHash} with fresh reactions data`);
                }
              } catch (error) {
                console.error(`[Webhook] Error updating root cast ${quotedCastHash}:`, error);
                // Don't fail the webhook processing if root cast update fails
              }
            } catch (error: any) {
              if (error.code !== "23505") { // Ignore duplicate key errors
                console.error(`[Webhook] Error storing quote cast ${castHash}:`, error);
              }
            }
          }
        }
      } else if (!isQuote && webhookType === "curated-reply") {
        // Handle regular reply - find the root curated cast
        // With unified webhooks, we need to check if the root parent is a curated cast
        const rootHash = await getRootCastHash(castHash);
        
        if (rootHash) {
          // Check if root cast is curated
          const curatedCast = await db
            .select()
            .from(curatedCasts)
            .where(eq(curatedCasts.castHash, rootHash))
            .limit(1);

          if (curatedCast.length > 0) {
            const curatedCastHash = rootHash;
            
            // Calculate reply depth by traversing parent chain
            let replyDepth = 1;
            let currentParentHash = parentHash;
            let depth = 1;
            
            // Traverse up to find depth (limit to prevent infinite loops)
            while (currentParentHash && depth < 10) {
              const parentReply = await db
                .select()
                .from(castReplies)
                .where(eq(castReplies.replyCastHash, currentParentHash))
                .limit(1);
              
              if (parentReply.length > 0) {
                replyDepth = parentReply[0].replyDepth + 1;
                break;
              }
              
              // Try to get parent from Neynar if not in database
              try {
                const parentRootHash = await getRootCastHash(currentParentHash);
                if (parentRootHash === curatedCastHash) {
                  depth++;
                  replyDepth = depth;
                  break;
                }
              } catch (error) {
                console.error(`[Webhook] Error getting root hash for ${currentParentHash}:`, error);
                break;
              }
              
              depth++;
              if (depth >= 10) break;
            }

            // Store reply (quality already checked at top level)
            try {
              const { extractCastTimestamp } = await import("@/lib/cast-timestamp");
              const { extractCastMetadata } = await import("@/lib/cast-metadata");
              const metadata = extractCastMetadata(castData);

              // Ensure the author exists in the users table before inserting the cast reply
              let finalAuthorFid = metadata.authorFid;
              if (metadata.authorFid) {
                const authorData = castData?.author;
                try {
                  await upsertUser(metadata.authorFid, {
                    username: authorData?.username,
                    displayName: authorData?.display_name,
                    pfpUrl: authorData?.pfp_url,
                  });
                } catch (error) {
                  console.error(`[Webhook] Failed to upsert author ${metadata.authorFid} for reply:`, error);
                  // If upsert fails, set authorFid to null to avoid foreign key constraint violation
                  // The foreign key constraint has onDelete: "set null", so null is acceptable
                  finalAuthorFid = null;
                }
              }

              await db.insert(castReplies).values({
                curatedCastHash,
                replyCastHash: castHash,
                castData: castData,
                castCreatedAt: extractCastTimestamp(castData),
                parentCastHash: parentHash || null,
                rootCastHash: curatedCastHash,
                replyDepth,
                isQuoteCast: false,
                quotedCastHash: null,
                castText: metadata.castText,
                castTextLength: metadata.castTextLength,
                authorFid: finalAuthorFid,
                likesCount: metadata.likesCount,
                recastsCount: metadata.recastsCount,
                repliesCount: metadata.repliesCount,
                engagementScore: metadata.engagementScore,
              }).onConflictDoNothing({ target: castReplies.replyCastHash });

            // Note: We don't record activity events for webhook events as they are protocol-level,
            // not app-specific activities. Only app-originated casts (via /api/cast) count as active users.

            console.log(`[Webhook] Stored cast via curated-reply webhook: castHash=${castHash} curatedCastHash=${curatedCastHash} depth=${replyDepth}`);
            
            // Trigger async quality analysis (non-blocking)
            analyzeCastQualityAsync(castHash, castData, async (hash, result) => {
              try {
                await db
                  .update(castReplies)
                  .set({
                    qualityScore: result.qualityScore,
                    category: result.category,
                    qualityAnalyzedAt: new Date(),
                  })
                  .where(eq(castReplies.replyCastHash, hash));
                console.log(`[Webhook] Quality analysis completed for reply ${hash}: score=${result.qualityScore}, category=${result.category}`);
                
                // Notify curators if quality score meets threshold
                if (result.qualityScore !== undefined) {
                  const { notifyCuratorsAboutQualityReply } = await import("@/lib/notifications");
                  notifyCuratorsAboutQualityReply(
                    curatedCastHash,
                    hash,
                    castData,
                    result.qualityScore
                  ).catch((error) => {
                    console.error(`[Webhook] Error notifying curators about quality reply ${hash}:`, error);
                    // Don't fail if notification fails
                  });
                }
              } catch (error: any) {
                console.error(`[Webhook] Error updating quality analysis for reply ${hash}:`, error.message);
              }
            });
            
            // Add this reply to the unified webhook so nested replies are captured
            try {
              await addReplyToUnifiedReplyWebhook(castHash);
            } catch (error) {
              console.error(`[Webhook] Error adding reply ${castHash} to unified webhook:`, error);
            }

            // Fetch and update the root cast to refresh reactions data
            try {
              const rootCastResponse = await neynarClient.lookupCastConversation({
                identifier: curatedCastHash,
                type: LookupCastConversationTypeEnum.Hash,
                replyDepth: 0,
                includeChronologicalParentCasts: false,
              });

              const updatedRootCast = rootCastResponse.conversation?.cast;
              if (updatedRootCast) {
                const { extractCastMetadata } = await import("@/lib/cast-metadata");
                const metadata = extractCastMetadata(updatedRootCast);
                await db
                  .update(curatedCasts)
                  .set({
                    castData: updatedRootCast,
                    castText: metadata.castText,
                    castTextLength: metadata.castTextLength,
                    authorFid: metadata.authorFid,
                    likesCount: metadata.likesCount,
                    recastsCount: metadata.recastsCount,
                    repliesCount: metadata.repliesCount,
                    engagementScore: metadata.engagementScore,
                    parentHash: metadata.parentHash,
                  })
                  .where(eq(curatedCasts.castHash, curatedCastHash));
                
                console.log(`[Webhook] Updated root cast ${curatedCastHash} with fresh reactions data`);
              }
            } catch (error) {
              console.error(`[Webhook] Error updating root cast ${curatedCastHash}:`, error);
              // Don't fail the webhook processing if root cast update fails
            }
            } catch (error: any) {
              if (error.code !== "23505") { // Ignore duplicate key errors
                console.error(`[Webhook] Error storing reply ${castHash}:`, error);
              }
            }
          }
        }
      }
    }

    // Handle user notifications for parent casts (not replies)
    // Unified webhook sends all casts from watched users, we filter by watch table
    if ((parentHash === null || parentHash === undefined) && webhookType === "user-watch") {
      // Parent cast - check if this should trigger user notifications
      // With unified webhook, we need to check the watch table to see who is watching this author
      const { userWatches } = await import("@/lib/schema");
      const watchers = await db
        .select({ watcherFid: userWatches.watcherFid })
        .from(userWatches)
        .where(eq(userWatches.watchedFid, authorFid));

      console.log(`[Webhook] Found ${watchers.length} watcher(s) for author ${authorFid}`);

      // Create notifications for all watchers
      if (watchers.length > 0) {
        // Check for existing notifications to prevent duplicates
        const existingNotifications = await db
          .select({ userFid: userNotifications.userFid })
          .from(userNotifications)
          .where(eq(userNotifications.castHash, castHash));
        
        const existingUserFids = new Set(existingNotifications.map(n => n.userFid));
        console.log(`[Webhook] Found ${existingNotifications.length} existing notification(s) for cast ${castHash}`);

        // Only create notifications for users who don't already have one
        const notificationsToCreate = watchers
          .filter(w => !existingUserFids.has(w.watcherFid))
          .map((w) => ({
            userFid: w.watcherFid,
            type: "cast.created",
            castHash,
            castData,
            authorFid,
            isRead: false,
          }));

        if (notificationsToCreate.length > 0) {
          await db.insert(userNotifications).values(notificationsToCreate).onConflictDoNothing();
          console.log(`[Webhook] Created ${notificationsToCreate.length} new notification(s) for cast ${castHash} (skipped ${watchers.length - notificationsToCreate.length} duplicate(s))`);
          
          // Invalidate count cache for all affected users
          const { cacheNotificationCount } = await import("@/lib/cache");
          for (const notification of notificationsToCreate) {
            cacheNotificationCount.invalidateUser(notification.userFid);
          }

          // Send badge refresh push notifications to trigger immediate badge update
          // This is a lightweight push that tells the client to refresh the badge count
          for (const notification of notificationsToCreate) {
            try {
              await sendPushNotificationToUser(notification.userFid, {
                title: "New notification",
                body: "",
                icon: "/icon-192x192.webp",
                badge: "/icon-96x96.webp",
                data: { type: "badge-refresh" },
              });
            } catch (error) {
              // Don't fail if badge refresh push fails - it's non-critical
              console.error(`[Webhook] Error sending badge refresh push to user ${notification.userFid}:`, error);
            }
          }
        } else {
          console.log(`[Webhook] All watchers already have notifications for cast ${castHash}, skipping creation`);
        }

        // Send push notifications to all watchers who have push subscriptions
        // Only send to users who actually got new notifications
        const authorUsername = castData.author?.username || castData.author?.display_name || "Someone";
        const castText = castData.text || "";
        const previewText = castText.length > 100 ? castText.substring(0, 100) + "..." : castText;

        for (const notification of notificationsToCreate) {
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
    } else if (parentHash && webhookType === "user-watch") {
      console.log(`[Webhook] Cast is a reply (parentHash: ${parentHash}), skipping notification`);
    }

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

