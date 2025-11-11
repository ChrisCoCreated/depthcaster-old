import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { curatedCasts } from "@/lib/schema";
import { createHmac, timingSafeEqual } from "crypto";

// Disable body parsing to read raw body for signature verification
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string
): boolean {
  const hmac = createHmac("sha256", secret);
  hmac.update(rawBody);
  const digest = hmac.digest("hex");

  // Use timing-safe comparison to prevent timing attacks
  if (signature.length !== digest.length) {
    return false;
  }

  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get the raw body for signature verification
    const rawBody = await request.text();
    
    // Get the signature from headers
    const signature = request.headers.get("x-neynar-signature");
    const webhookSecret = process.env.WEBHOOK_SECRET;

    // Verify webhook signature if secret is configured
    if (webhookSecret) {
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
    }

    // Parse the body
    const body = JSON.parse(rawBody);
    
    // Extract cast hash from webhook payload or direct body
    // Neynar webhook format: { type: "cast.created", data: { hash: "0x...", author: { fid: 123 } } }
    // Direct API format: { castHash: "0x...", curatorFid: 123 }
    const castHash = body.data?.hash || body.castHash;
    const curatorFid = body.data?.author?.fid || body.curatorFid;
    // Store the full cast data object for easy rendering
    const castData = body.data || body.castData;
    
    console.log(`Processing curation for cast: ${castHash}, curator: ${curatorFid || 'unknown'}`);

    if (!castHash) {
      return NextResponse.json(
        { error: "castHash is required" },
        { status: 400 }
      );
    }

    if (!castData) {
      return NextResponse.json(
        { error: "castData is required" },
        { status: 400 }
      );
    }

    // Insert the cast into curated_casts table
    const result = await db.insert(curatedCasts).values({
      castHash,
      castData,
      curatorFid: curatorFid || null,
    }).returning();

    return NextResponse.json({ 
      success: true, 
      curatedCast: result[0] 
    });
  } catch (error: any) {
    console.error("Curate API error:", error);
    
    // Handle unique constraint violation (cast already curated)
    if (error.code === "23505" || error.message?.includes("unique")) {
      return NextResponse.json(
        { error: "Cast is already curated" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: error.message || "Failed to curate cast" },
      { status: 500 }
    );
  }
}

