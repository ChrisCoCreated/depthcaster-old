import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { curatedCasts, users, curatorCastCurations } from "@/lib/schema";
import { createHmac, timingSafeEqual } from "crypto";
import { neynarClient } from "@/lib/neynar";
import { LookupCastConversationTypeEnum } from "@neynar/nodejs-sdk/build/api";
import { eq, asc, and } from "drizzle-orm";
import { hasCuratorOrAdminRole, getUserRoles } from "@/lib/roles";
import { fetchAndStoreConversation } from "@/lib/conversation";
import { deleteCuratedCastWebhooks } from "@/lib/webhooks";
import { refreshUnifiedCuratedWebhooks } from "@/lib/webhooks-unified";
import { sendPushNotificationToUser } from "@/lib/pushNotifications";
import { upsertUser } from "@/lib/users";
import { analyzeCastQualityAsync } from "@/lib/deepseek-quality";

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
      // Continue to try SHA-256
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
      // Signature verification failed
    }
  }
  
  return false;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const castHash = searchParams.get("castHash");

    if (!castHash) {
      return NextResponse.json(
        { error: "castHash is required" },
        { status: 400 }
      );
    }

    // Check curator_cast_curations table and join with users to get curator info
    // Order by createdAt ASC to show oldest curator first
    const curations = await db
      .select({
        curatorFid: curatorCastCurations.curatorFid,
        createdAt: curatorCastCurations.createdAt,
        username: users.username,
        displayName: users.displayName,
        pfpUrl: users.pfpUrl,
      })
      .from(curatorCastCurations)
      .leftJoin(users, eq(curatorCastCurations.curatorFid, users.fid))
      .where(eq(curatorCastCurations.castHash, castHash))
      .orderBy(asc(curatorCastCurations.createdAt));

    const curatorInfo = curations.map(c => ({
      fid: c.curatorFid,
      username: c.username || undefined,
      display_name: c.displayName || undefined,
      pfp_url: c.pfpUrl || undefined,
    }));

    return NextResponse.json({ 
      isCurated: curations.length > 0,
      curatorFids: curations.map(c => c.curatorFid),
      curatorInfo: curatorInfo,
    });
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string };
    console.error("Check curated API error:", err.message || err);
    return NextResponse.json(
      { error: err.message || "Failed to check curation status" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get the raw body for signature verification
    const rawBody = await request.text();
    
    // Get the signature from headers (check both lowercase and original case)
    const signature = request.headers.get("x-neynar-signature") || 
                      request.headers.get("X-Neynar-Signature") ||
                      request.headers.get("X-NEYNAR-SIGNATURE");
    const webhookSecret = process.env.WEBHOOK_SECRET;

    // Check if this is a webhook call (has signature) or direct API call
    const isWebhook = !!signature && !!webhookSecret;

    // Parse the body once
    const body = JSON.parse(rawBody);

    // Verify webhook signature if secret is configured
    if (isWebhook && webhookSecret) {
      if (!signature) {
        return NextResponse.json(
          { error: "Missing webhook signature" },
          { status: 401 }
        );
      }

      const isValid = verifyWebhookSignature(rawBody, signature, webhookSecret);
      if (!isValid) {
        return NextResponse.json(
          { error: "Invalid webhook signature" },
          { status: 401 }
        );
      }

      // For webhook calls, check if the author has curator role
      // Extract curatorFid from webhook payload (cast author who mentioned @deepbot)
      const castData = body.data || body.castData;
      const curatorFid = castData?.author?.fid;

      if (!curatorFid) {
        return NextResponse.json(
          { error: "curatorFid is required" },
          { status: 400 }
        );
      }

      // Check if user has curator role
      const user = await db.select().from(users).where(eq(users.fid, curatorFid)).limit(1);
      if (user.length === 0) {
        return NextResponse.json(
          { error: "User not found" },
          { status: 404 }
        );
      }
      const roles = await getUserRoles(curatorFid);
      if (!hasCuratorOrAdminRole(roles)) {
        return NextResponse.json(
          { error: "User does not have curator role" },
          { status: 403 }
        );
      }
    } else if (!isWebhook) {
      // Direct API call - check curator role
      const curatorFid = body.curatorFid;
      
      if (!curatorFid) {
        return NextResponse.json(
          { error: "curatorFid is required" },
          { status: 400 }
        );
      }

      // Check if user has curator role
      const user = await db.select().from(users).where(eq(users.fid, curatorFid)).limit(1);
      if (user.length === 0) {
        return NextResponse.json(
          { error: "User not found" },
          { status: 404 }
        );
      }
      const roles = await getUserRoles(curatorFid);
      if (!hasCuratorOrAdminRole(roles)) {
        return NextResponse.json(
          { error: "User does not have curator role" },
          { status: 403 }
        );
      }
    }
    
    // Extract cast hash from webhook payload or direct body
    // Neynar webhook format: { type: "cast.created", data: { hash: "0x...", parent_hash: "0x...", author: { fid: 123 } } }
    // Direct API format: { castHash: "0x...", curatorFid: 123, castData: {...} }
    const castData = body.data || body.castData;
    const parentHash = castData?.parent_hash;
    
    // For direct API calls, prioritize explicitly provided values
    let castHash: string = body.castHash || castData?.hash;
    let finalCastData: unknown = castData;
    const curatorFid = body.curatorFid || castData?.author?.fid;
    
    // If there's a parent_hash, fetch and store the parent cast instead
    if (parentHash && isWebhook) {
      try {
        // Fetch the parent cast
        const conversation = await neynarClient.lookupCastConversation({
          identifier: parentHash,
          type: LookupCastConversationTypeEnum.Hash,
          replyDepth: 0,
          includeChronologicalParentCasts: false,
        });
        
        const parentCast = conversation.conversation?.cast;
        if (parentCast) {
          castHash = parentHash;
          finalCastData = parentCast;
        } else {
          // Fallback to current cast if parent not found
          castHash = castData?.hash || body.castHash;
          finalCastData = castData;
        }
      } catch (error) {
        // Fallback to current cast if fetch fails
        castHash = castData?.hash || body.castHash;
        finalCastData = castData;
      }
    }

    if (!castHash) {
      return NextResponse.json(
        { error: "castHash is required" },
        { status: 400 }
      );
    }

    if (!finalCastData) {
      return NextResponse.json(
        { error: "castData is required" },
        { status: 400 }
      );
    }

    if (!curatorFid) {
      return NextResponse.json(
        { error: "curatorFid is required" },
        { status: 400 }
      );
    }

    // Check if cast already exists in curated_casts, if not insert it
    const existingCast = await db.select().from(curatedCasts).where(eq(curatedCasts.castHash, castHash)).limit(1);
    
    // Check if this curator has already curated this cast
    const existingCuration = await db
      .select()
      .from(curatorCastCurations)
      .where(
        and(
          eq(curatorCastCurations.castHash, castHash),
          eq(curatorCastCurations.curatorFid, curatorFid)
        )
      )
      .limit(1);
    
    // Early return if this curator has already curated this cast
    if (existingCuration.length > 0) {
      return NextResponse.json(
        { error: "Cast is already curated by this user" },
        { status: 409 }
      );
    }
    
    const isFirstCuration = existingCast.length === 0;
    const isAdditionalCuration = existingCast.length > 0 && existingCuration.length === 0;
    const conversationNotFetched = !existingCast[0]?.conversationFetchedAt;
    
    if (isFirstCuration) {
      // Insert the cast into curated_casts table (store cast data once)
      // Replies are now stored in cast_replies table, not in topReplies field
      const { extractCastTimestamp } = await import("@/lib/cast-timestamp");
      const { extractCastMetadata } = await import("@/lib/cast-metadata");
      const metadata = extractCastMetadata(finalCastData);
      
      // Ensure the author exists in the users table before inserting the cast
      if (metadata.authorFid) {
        const authorData = (finalCastData as any)?.author;
        await upsertUser(metadata.authorFid, {
          username: authorData?.username,
          displayName: authorData?.display_name,
          pfpUrl: authorData?.pfp_url,
        }).catch((error) => {
          console.error(`[Curate] Failed to upsert author ${metadata.authorFid}:`, error);
          // Continue anyway - we'll handle the foreign key error if it occurs
        });
      }
      
      try {
        await db.insert(curatedCasts).values({
          castHash,
          castData: finalCastData,
          castCreatedAt: extractCastTimestamp(finalCastData),
          curatorFid: curatorFid || null,
          topReplies: null, // No longer storing replies here - they're in cast_replies
          repliesUpdatedAt: null, // No longer storing replies here - they're in cast_replies
          conversationFetchedAt: null,
          castText: metadata.castText,
          castTextLength: metadata.castTextLength,
          authorFid: metadata.authorFid,
          likesCount: metadata.likesCount,
          recastsCount: metadata.recastsCount,
          repliesCount: metadata.repliesCount,
          engagementScore: metadata.engagementScore,
          parentHash: metadata.parentHash,
        });

        // Trigger async quality analysis (non-blocking)
        analyzeCastQualityAsync(castHash, finalCastData, async (hash, result) => {
          try {
            await db
              .update(curatedCasts)
              .set({
                qualityScore: result.qualityScore,
                category: result.category,
                qualityAnalyzedAt: new Date(),
              })
              .where(eq(curatedCasts.castHash, hash));
            console.log(`[Curate] Quality analysis completed for cast ${hash}: score=${result.qualityScore}, category=${result.category}`);
            
            // Notify cast author about quality score
            const castRecord = await db
              .select({ authorFid: curatedCasts.authorFid })
              .from(curatedCasts)
              .where(eq(curatedCasts.castHash, hash))
              .limit(1);
            
            if (castRecord[0]?.authorFid) {
              sendPushNotificationToUser(castRecord[0].authorFid, {
                title: "Your cast has been curated",
                body: `Quality score: ${result.qualityScore}. DM @chris if this doesn't seem right.`,
                icon: "/icon-192x192.webp",
                badge: "/icon-96x96.webp",
                data: {
                  type: "cast_curated_quality",
                  castHash: hash,
                  qualityScore: result.qualityScore,
                  url: `/cast/${hash}`
                },
              }).catch((error) => {
                console.error(`[Curate] Error sending quality score notification to author ${castRecord[0].authorFid}:`, error);
              });
            }
          } catch (error: any) {
            console.error(`[Curate] Error updating quality analysis for cast ${hash}:`, error.message);
          }
        });
      } catch (insertError: any) {
        // Handle case where cast was inserted by another request (race condition)
        // or if there are orphaned curator_cast_curations rows
        if (insertError.code === "23505" || insertError.code === "23503" || insertError.message?.includes("unique") || insertError.message?.includes("foreign key")) {
          console.error(`[Curate] Insert error for cast ${castHash}:`, {
            code: insertError.code,
            message: insertError.message,
            detail: insertError.detail,
            constraint: insertError.constraint,
          });
          
          // Re-check if cast now exists (might have been inserted by another request)
          const recheckCast = await db.select().from(curatedCasts).where(eq(curatedCasts.castHash, castHash)).limit(1);
          if (recheckCast.length > 0) {
            // Cast now exists, continue with the flow (it was a race condition)
            console.log(`[Curate] Cast ${castHash} now exists after race condition, continuing...`);
          } else {
            // Cast still doesn't exist, check what the actual error was
            if (insertError.constraint === "curated_casts_author_fid_fkey" && metadata.authorFid) {
              // Author doesn't exist, try to create them and retry
              console.log(`[Curate] Author ${metadata.authorFid} doesn't exist, creating user...`);
              const authorData = (finalCastData as any)?.author;
              try {
                await upsertUser(metadata.authorFid, {
                  username: authorData?.username,
                  displayName: authorData?.display_name,
                  pfpUrl: authorData?.pfp_url,
                });
                console.log(`[Curate] Created author ${metadata.authorFid}, retrying insert...`);
              } catch (userError) {
                console.error(`[Curate] Failed to create author ${metadata.authorFid}:`, userError);
                // If we can't create the user, set authorFid to null
                metadata.authorFid = null;
              }
            }
            
            // Check if there are orphaned curator_cast_curations rows
            const orphanedCurations = await db
              .select()
              .from(curatorCastCurations)
              .where(eq(curatorCastCurations.castHash, castHash))
              .limit(1);
            
            if (orphanedCurations.length > 0) {
              console.log(`[Curate] Found orphaned curator_cast_curations rows for ${castHash}, cleaning up...`);
              // Clean up orphaned rows and retry
              await db.delete(curatorCastCurations).where(eq(curatorCastCurations.castHash, castHash));
            }
            
            // Retry insert
            try {
              await db.insert(curatedCasts).values({
                castHash,
                castData: finalCastData,
                castCreatedAt: extractCastTimestamp(finalCastData),
                curatorFid: curatorFid || null,
                topReplies: null,
                repliesUpdatedAt: null,
                conversationFetchedAt: null,
                castText: metadata.castText,
                castTextLength: metadata.castTextLength,
                authorFid: metadata.authorFid,
                likesCount: metadata.likesCount,
                recastsCount: metadata.recastsCount,
                repliesCount: metadata.repliesCount,
                engagementScore: metadata.engagementScore,
                parentHash: metadata.parentHash,
              });
              console.log(`[Curate] Successfully inserted cast ${castHash} after cleanup/retry`);

              // Trigger async quality analysis (non-blocking)
              analyzeCastQualityAsync(castHash, finalCastData, async (hash, result) => {
                try {
                  await db
                    .update(curatedCasts)
                    .set({
                      qualityScore: result.qualityScore,
                      category: result.category,
                      qualityAnalyzedAt: new Date(),
                    })
                    .where(eq(curatedCasts.castHash, hash));
                  console.log(`[Curate] Quality analysis completed for cast ${hash}: score=${result.qualityScore}, category=${result.category}`);
                  
                  // Notify cast author about quality score
                  const castRecord = await db
                    .select({ authorFid: curatedCasts.authorFid })
                    .from(curatedCasts)
                    .where(eq(curatedCasts.castHash, hash))
                    .limit(1);
                  
                  if (castRecord[0]?.authorFid) {
                    sendPushNotificationToUser(castRecord[0].authorFid, {
                      title: "Your cast has been curated",
                      body: `Quality score: ${result.qualityScore}. DM @chris if this doesn't seem right.`,
                      icon: "/icon-192x192.webp",
                      badge: "/icon-96x96.webp",
                      data: {
                        type: "cast_curated_quality",
                        castHash: hash,
                        qualityScore: result.qualityScore,
                        url: `/cast/${hash}`
                      },
                    }).catch((error) => {
                      console.error(`[Curate] Error sending quality score notification to author ${castRecord[0].authorFid}:`, error);
                    });
                  }
                } catch (error: any) {
                  console.error(`[Curate] Error updating quality analysis for cast ${hash}:`, error.message);
                }
              });
            } catch (retryError: any) {
              console.error(`[Curate] Retry insert also failed for ${castHash}:`, retryError);
              throw retryError;
            }
          }
        } else {
          throw insertError;
        }
      }
    } else if (isAdditionalCuration) {
      // Additional curation: refetch cast data to update reaction counts
      try {
        const conversation = await neynarClient.lookupCastConversation({
          identifier: castHash,
          type: LookupCastConversationTypeEnum.Hash,
          replyDepth: 0,
          includeChronologicalParentCasts: false,
        });
        
        const updatedCastData = conversation.conversation?.cast;
        if (updatedCastData) {
          const { extractCastTimestamp } = await import("@/lib/cast-timestamp");
          const { extractCastMetadata } = await import("@/lib/cast-metadata");
          const metadata = extractCastMetadata(updatedCastData);
          await db
            .update(curatedCasts)
            .set({
              castData: updatedCastData,
              castCreatedAt: extractCastTimestamp(updatedCastData),
              castText: metadata.castText,
              castTextLength: metadata.castTextLength,
              authorFid: metadata.authorFid,
              likesCount: metadata.likesCount,
              recastsCount: metadata.recastsCount,
              repliesCount: metadata.repliesCount,
              engagementScore: metadata.engagementScore,
              parentHash: metadata.parentHash,
            })
            .where(eq(curatedCasts.castHash, castHash));
          
          console.log(`[Curate] Updated cast data for ${castHash} due to additional curation`);
        }
      } catch (error) {
        console.error(`[Curate] Error updating cast data for ${castHash}:`, error);
        // Don't fail curation if cast data update fails
      }
    }

    // Fetch and store full conversation if this is the first curation OR if it's an additional curation (to refresh data)
    if (isFirstCuration || conversationNotFetched || isAdditionalCuration) {
      try {
        await fetchAndStoreConversation(castHash, 5, 50);
        
        // Mark conversation as fetched
        await db
          .update(curatedCasts)
          .set({
            conversationFetchedAt: new Date(),
          })
          .where(eq(curatedCasts.castHash, castHash));

        // Refresh unified webhooks to include this new curated cast
        try {
          await refreshUnifiedCuratedWebhooks();
        } catch (webhookError) {
          console.error(`Error refreshing unified webhooks for cast ${castHash}:`, webhookError);
          // Don't fail curation if webhook refresh fails
        }
      } catch (error) {
        console.error(`Error fetching conversation for cast ${castHash}:`, error);
        // Don't fail curation if conversation fetch fails
      }
    }

    // Insert into curator_cast_curations (link curator to cast)
    try {
      // Check if there are any existing curators for this cast (before inserting)
      const existingCurators = await db
        .select()
        .from(curatorCastCurations)
        .where(eq(curatorCastCurations.castHash, castHash))
        .limit(1);
      
      const isNewCuration = existingCurators.length === 0;

      const curationResult = await db.insert(curatorCastCurations).values({
        castHash,
        curatorFid,
      }).returning();

      // Send miniapp notification to all users when a cast is first curated
      if (isNewCuration) {
        try {
          const { notifyAllMiniappUsersAboutNewCuratedCast } = await import("@/lib/miniapp");
          notifyAllMiniappUsersAboutNewCuratedCast(castHash, finalCastData).catch((error) => {
            console.error(`[Curate] Error sending miniapp notification for new curated cast ${castHash}:`, error);
            // Don't fail curation if notification fails
          });
        } catch (error) {
          console.error(`[Curate] Error importing miniapp notification function:`, error);
          // Don't fail curation if import fails
        }
      }

      // Send notification to admin user 5701 when a cast is curated for the first time
      const ADMIN_FID = 5701;
      if (isNewCuration) {
        // Get curator's name for the notification
        // Try database first, then castData, then fallback to FID
        let curatorName = `User ${curatorFid}`;
        
        const curatorUser = await db.select().from(users).where(eq(users.fid, curatorFid)).limit(1);
        if (curatorUser[0]) {
          curatorName = curatorUser[0].displayName || curatorUser[0].username || curatorName;
        } else if (finalCastData && typeof finalCastData === 'object' && 'author' in finalCastData) {
          // Try to get name from cast data (for webhook curations)
          const author = (finalCastData as any).author;
          curatorName = author?.display_name || author?.username || curatorName;
        }
        
        // Send notification asynchronously (don't block the response)
        sendPushNotificationToUser(ADMIN_FID, {
          title: "New Cast Curated",
          body: `${curatorName} curated a cast`,
          icon: "/icon-192x192.webp",
          badge: "/icon-96x96.webp",
          data: { 
            type: "cast_curated",
            castHash,
            curatorFid,
            url: `/cast/${castHash}`
          },
        }).catch((error) => {
          console.error(`[Curate] Error sending notification to admin for curation by ${curatorFid}:`, error);
          // Don't fail curation if notification fails
        });
      }

      // Check if deepbot is a curator and send notification to cast author if enabled
      try {
        // Get all curators for this cast to check if deepbot is one of them
        const allCurations = await db
          .select({
            curatorFid: curatorCastCurations.curatorFid,
            username: users.username,
          })
          .from(curatorCastCurations)
          .leftJoin(users, eq(curatorCastCurations.curatorFid, users.fid))
          .where(eq(curatorCastCurations.castHash, castHash));

        const isCuratedByDeepbot = allCurations.some(c => c.username?.toLowerCase() === "deepbot");

        if (isCuratedByDeepbot && finalCastData && typeof finalCastData === 'object' && 'author' in finalCastData) {
          const author = (finalCastData as any).author;
          const authorFid = author?.fid;

          if (authorFid) {
            // Get cast author's preferences
            const authorUser = await db.select().from(users).where(eq(users.fid, authorFid)).limit(1);
            if (authorUser[0]) {
              const preferences = (authorUser[0].preferences || {}) as { notifyOnDeepbotCurate?: boolean };
              const notifyOnDeepbotCurate = preferences.notifyOnDeepbotCurate !== undefined ? preferences.notifyOnDeepbotCurate : true;

              if (notifyOnDeepbotCurate) {
                // Send notification to cast author
                sendPushNotificationToUser(authorFid, {
                  title: "Your cast was curated",
                  body: "Your cast was curated using @deepbot",
                  icon: "/icon-192x192.webp",
                  badge: "/icon-96x96.webp",
                  data: {
                    type: "deepbot_curated",
                    castHash,
                    url: `/cast/${castHash}`
                  },
                }).catch((error) => {
                  console.error(`[Curate] Error sending deepbot curation notification to author ${authorFid}:`, error);
                  // Don't fail curation if notification fails
                });
              }
            }
          }
        }
      } catch (error) {
        console.error(`[Curate] Error checking for deepbot curation notification:`, error);
        // Don't fail curation if notification check fails
      }

      // Notify existing curators about new curation
      try {
        const { notifyCuratorsAboutNewCuration } = await import("@/lib/notifications");
        const castDataForNotification = finalCastData || castData;
        notifyCuratorsAboutNewCuration(
          castHash,
          castDataForNotification,
          curatorFid
        ).catch((error) => {
          console.error(`[Curate] Error notifying existing curators about new curation:`, error);
          // Don't fail curation if notification fails
        });
      } catch (error) {
        console.error(`[Curate] Error notifying existing curators:`, error);
        // Don't fail curation if notification fails
      }

      return NextResponse.json({ 
        success: true, 
        curation: curationResult[0] 
      });
    } catch (insertError: any) {
      // Handle unique constraint violation (same user trying to curate twice)
      if (insertError.code === "23505" || insertError.message?.includes("unique")) {
        return NextResponse.json(
          { error: "Cast is already curated by this user" },
          { status: 409 }
        );
      }
      throw insertError;
    }
  } catch (error: unknown) {
    console.error("Curate API error:", error);
    
    const err = error as { code?: string; message?: string; detail?: string; constraint?: string };
    
    // Log detailed error information for debugging
    if (err.code || err.message || err.detail) {
      console.error("Database error details:", {
        code: err.code,
        message: err.message,
        detail: err.detail,
        constraint: err.constraint,
      });
    }
    
    // Handle unique constraint violation (cast already curated)
    if (err.code === "23505" || err.message?.includes("unique")) {
      return NextResponse.json(
        { error: "Cast is already curated" },
        { status: 409 }
      );
    }
    
    // Handle foreign key constraint violation
    if (err.code === "23503" || err.message?.includes("foreign key")) {
      return NextResponse.json(
        { error: "Database constraint violation. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: err.message || err.detail || "Failed to curate cast" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const castHash = searchParams.get("castHash");
    const curatorFid = searchParams.get("curatorFid") ? parseInt(searchParams.get("curatorFid")!) : undefined;

    if (!castHash) {
      return NextResponse.json(
        { error: "castHash is required" },
        { status: 400 }
      );
    }

    if (!curatorFid) {
      return NextResponse.json(
        { error: "curatorFid is required" },
        { status: 400 }
      );
    }

    // Check if user has curator role
    const user = await db.select().from(users).where(eq(users.fid, curatorFid)).limit(1);
    if (user.length === 0) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }
    const roles = await getUserRoles(curatorFid);
    if (!hasCuratorOrAdminRole(roles)) {
      return NextResponse.json(
        { error: "User does not have curator role" },
        { status: 403 }
      );
    }

    // Check if this curator has curated this cast
    const curation = await db
      .select()
      .from(curatorCastCurations)
      .where(
        and(
          eq(curatorCastCurations.castHash, castHash),
          eq(curatorCastCurations.curatorFid, curatorFid)
        )
      )
      .limit(1);

    if (curation.length === 0) {
      return NextResponse.json(
        { error: "Cast is not curated by this user" },
        { status: 404 }
      );
    }

    // Delete from curator_cast_curations
    await db
      .delete(curatorCastCurations)
      .where(
        and(
          eq(curatorCastCurations.castHash, castHash),
          eq(curatorCastCurations.curatorFid, curatorFid)
        )
      );

    // Check if there are any remaining curators for this cast
    const remainingCurations = await db
      .select()
      .from(curatorCastCurations)
      .where(eq(curatorCastCurations.castHash, castHash))
      .limit(1);

    // If no curators remain, remove the cast from curated_casts table
    // This ensures it won't appear in the curated feed
    if (remainingCurations.length === 0) {
      // Delete all webhooks related to this cast before deleting the cast
      try {
        const deletedCount = await deleteCuratedCastWebhooks(castHash);
        console.log(`Deleted ${deletedCount} webhook(s) for cast ${castHash}`);
      } catch (webhookError) {
        console.error(`Error deleting webhooks for cast ${castHash}:`, webhookError);
        // Continue with cast deletion even if webhook deletion fails
      }

      await db
        .delete(curatedCasts)
        .where(eq(curatedCasts.castHash, castHash));

      // Refresh unified webhooks to remove this cast and its children from the webhook
      try {
        await refreshUnifiedCuratedWebhooks();
        console.log(`Refreshed unified webhooks after removing cast ${castHash}`);
      } catch (webhookError) {
        console.error(`Error refreshing unified webhooks after removing cast ${castHash}:`, webhookError);
        // Continue even if webhook refresh fails
      }
    }

    return NextResponse.json({ 
      success: true,
      message: "Cast removed from curated feed"
    });
  } catch (error: unknown) {
    console.error("Uncurate API error:", error);
    const err = error as { message?: string };
    return NextResponse.json(
      { error: err.message || "Failed to uncurate cast" },
      { status: 500 }
    );
  }
}

