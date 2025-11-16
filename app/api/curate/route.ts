import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { curatedCasts, users, curatorCastCurations } from "@/lib/schema";
import { createHmac, timingSafeEqual } from "crypto";
import { neynarClient } from "@/lib/neynar";
import { LookupCastConversationTypeEnum } from "@neynar/nodejs-sdk/build/api";
import { eq, asc, and } from "drizzle-orm";
import { hasCuratorOrAdminRole } from "@/lib/roles";
import { fetchAndStoreConversation } from "@/lib/conversation";
import { createCuratedConversationWebhook, createQuoteCastWebhook } from "@/lib/webhooks";

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
    } else if (!isWebhook) {
      // Direct API call - check curator role
      const curatorFid = body.curatorFid;
      
      if (!curatorFid) {
        return NextResponse.json(
          { error: "curatorFid is required" },
          { status: 400 }
        );
      }

      // Check if user has curator/admin/superadmin role
      const user = await db.select().from(users).where(eq(users.fid, curatorFid)).limit(1);
      if (user.length === 0 || !hasCuratorOrAdminRole(user[0].role)) {
        return NextResponse.json(
          { error: "User does not have curator, admin, or superadmin role" },
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
    
    const isFirstCuration = existingCast.length === 0;
    const conversationNotFetched = !existingCast[0]?.conversationFetchedAt;
    
    if (isFirstCuration) {
      // Insert the cast into curated_casts table (store cast data once)
      // Replies are now stored in cast_replies table, not in topReplies field
      await db.insert(curatedCasts).values({
        castHash,
        castData: finalCastData,
        curatorFid: curatorFid || null,
        topReplies: null, // No longer storing replies here - they're in cast_replies
        repliesUpdatedAt: null, // No longer storing replies here - they're in cast_replies
        conversationFetchedAt: null,
      });
    }

    // Fetch and store full conversation if this is the first curation
    if (isFirstCuration || conversationNotFetched) {
      try {
        await fetchAndStoreConversation(castHash, 5, 50);
        
        // Mark conversation as fetched
        await db
          .update(curatedCasts)
          .set({
            conversationFetchedAt: new Date(),
          })
          .where(eq(curatedCasts.castHash, castHash));

        // Set up webhooks for replies and quote casts
        try {
          await createCuratedConversationWebhook(castHash);
          await createQuoteCastWebhook(castHash);
        } catch (webhookError) {
          console.error(`Error creating webhooks for cast ${castHash}:`, webhookError);
          // Don't fail curation if webhook creation fails
        }
      } catch (error) {
        console.error(`Error fetching conversation for cast ${castHash}:`, error);
        // Don't fail curation if conversation fetch fails
      }
    }

    // Insert into curator_cast_curations (link curator to cast)
    try {
      const curationResult = await db.insert(curatorCastCurations).values({
        castHash,
        curatorFid,
      }).returning();

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
    
    const err = error as { code?: string; message?: string };
    
    // Handle unique constraint violation (cast already curated)
    if (err.code === "23505" || err.message?.includes("unique")) {
      return NextResponse.json(
        { error: "Cast is already curated" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: err.message || "Failed to curate cast" },
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

    // Check if user has curator/admin/superadmin role
    const user = await db.select().from(users).where(eq(users.fid, curatorFid)).limit(1);
    if (user.length === 0 || !hasCuratorOrAdminRole(user[0].role)) {
      return NextResponse.json(
        { error: "User does not have curator, admin, or superadmin role" },
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
      await db
        .delete(curatedCasts)
        .where(eq(curatedCasts.castHash, castHash));
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

