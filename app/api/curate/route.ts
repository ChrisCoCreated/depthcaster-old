import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { curatedCasts } from "@/lib/schema";
import { createHmac, timingSafeEqual } from "crypto";
import { neynarClient } from "@/lib/neynar";
import { LookupCastConversationTypeEnum } from "@neynar/nodejs-sdk/build/api";

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
  
  console.log("Signature verification:", {
    signatureLength: signature.length,
    digest512Length: digest512.length,
    digest256Length: digest256.length,
    signaturePrefix: signature.substring(0, 20),
    digest512Prefix: digest512.substring(0, 20),
    digest256Prefix: digest256.substring(0, 20),
    rawBodyLength: rawBody.length,
  });

  // Normalize signature to lowercase
  const normalizedSignature = signature.toLowerCase();
  
  // Try SHA-512 first (matches 128 char signature)
  if (normalizedSignature.length === digest512.length) {
    try {
      const sigBuffer = Buffer.from(normalizedSignature, "hex");
      const digestBuffer = Buffer.from(digest512.toLowerCase(), "hex");
      
      if (sigBuffer.length === digestBuffer.length) {
        const isValid = timingSafeEqual(sigBuffer, digestBuffer);
        console.log("Signature valid (SHA-512):", isValid);
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
        console.log("Signature valid (SHA-256):", isValid);
        if (isValid) return true;
      }
    } catch (error) {
      console.error("SHA-256 comparison error:", error);
    }
  }
  
  console.log("Signature verification failed for both SHA-256 and SHA-512");
  return false;
}

export async function POST(request: NextRequest) {
  console.log("Curate endpoint hit");
  try {
    // Get the raw body for signature verification
    const rawBody = await request.text();
    
    // Get the signature from headers (check both lowercase and original case)
    const signature = request.headers.get("x-neynar-signature") || 
                      request.headers.get("X-Neynar-Signature") ||
                      request.headers.get("X-NEYNAR-SIGNATURE");
    const webhookSecret = process.env.WEBHOOK_SECRET;

    console.log("Webhook verification:", {
      hasSignature: !!signature,
      hasSecret: !!webhookSecret,
      signatureHeader: signature?.substring(0, 20) || "none",
      allHeaders: Object.fromEntries(request.headers.entries()),
    });

    // Verify webhook signature if secret is configured
    if (webhookSecret) {
      if (!signature) {
        console.log("Missing webhook signature header");
        return NextResponse.json(
          { error: "Missing webhook signature" },
          { status: 401 }
        );
      }

      const isValid = verifyWebhookSignature(rawBody, signature, webhookSecret);
      if (!isValid) {
        console.log("Invalid webhook signature - request rejected");
        return NextResponse.json(
          { error: "Invalid webhook signature" },
          { status: 401 }
        );
      }
      console.log("Webhook signature verified successfully");
    } else {
      console.log("WEBHOOK_SECRET not configured, skipping verification");
    }

    // Parse the body
    const body = JSON.parse(rawBody);
    
    // Extract cast hash from webhook payload or direct body
    // Neynar webhook format: { type: "cast.created", data: { hash: "0x...", parent_hash: "0x...", author: { fid: 123 } } }
    // Direct API format: { castHash: "0x...", curatorFid: 123 }
    const castData = body.data || body.castData;
    const parentHash = castData?.parent_hash;
    
    // If there's a parent_hash, fetch and store the parent cast instead
    let castHash: string;
    let finalCastData: unknown;
    
    if (parentHash) {
      console.log(`Cast has parent, fetching parent cast: ${parentHash}`);
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
          console.log(`Storing parent cast: ${parentHash}`);
        } else {
          // Fallback to current cast if parent not found
          castHash = castData?.hash || body.castHash;
          finalCastData = castData;
          console.log(`Parent cast not found, storing current cast: ${castHash}`);
        }
      } catch (error) {
        console.error("Error fetching parent cast:", error);
        // Fallback to current cast if fetch fails
        castHash = castData?.hash || body.castHash;
        finalCastData = castData;
        console.log(`Error fetching parent, storing current cast: ${castHash}`);
      }
    } else {
      // No parent, store the current cast
      castHash = castData?.hash || body.castHash;
      finalCastData = castData;
    }
    
    const curatorFid = castData?.author?.fid || body.curatorFid;
    
    console.log(`Processing curation for cast: ${castHash}, curator: ${curatorFid || 'unknown'}`);

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

    // Insert the cast into curated_casts table
    const result = await db.insert(curatedCasts).values({
      castHash,
      castData: finalCastData,
      curatorFid: curatorFid || null,
    }).returning();

    return NextResponse.json({ 
      success: true, 
      curatedCast: result[0] 
    });
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

