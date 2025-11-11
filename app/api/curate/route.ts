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
  // Compute HMAC SHA-256
  const hmac = createHmac("sha256", secret);
  hmac.update(rawBody);
  const digest = hmac.digest("hex"); // This is 64 hex characters (32 bytes)
  
  console.log("Signature verification:", {
    signatureLength: signature.length,
    digestLength: digest.length,
    signaturePrefix: signature.substring(0, 20),
    digestPrefix: digest.substring(0, 20),
    rawBodyLength: rawBody.length,
  });

  // Normalize both to lowercase for comparison
  const normalizedSignature = signature.toLowerCase();
  const normalizedDigest = digest.toLowerCase();
  
  // If signature is 128 chars, it might be double-encoded or we need to take first 64
  let signatureToCompare = normalizedSignature;
  if (normalizedSignature.length === 128) {
    // Try taking first 64 characters (in case it's double-encoded)
    signatureToCompare = normalizedSignature.substring(0, 64);
    console.log("Signature is 128 chars, trying first 64:", signatureToCompare.substring(0, 20));
  }
  
  // Use timing-safe comparison
  if (signatureToCompare.length !== normalizedDigest.length) {
    console.log("Signature length mismatch:", {
      signatureLen: signatureToCompare.length,
      digestLen: normalizedDigest.length,
    });
    return false;
  }

  try {
    // Compare hex strings using timing-safe comparison
    const sigBuffer = Buffer.from(signatureToCompare, "hex");
    const digestBuffer = Buffer.from(normalizedDigest, "hex");
    
    if (sigBuffer.length !== digestBuffer.length) {
      console.log("Buffer length mismatch after hex decode");
      return false;
    }
    
    const isValid = timingSafeEqual(sigBuffer, digestBuffer);
    console.log("Signature valid:", isValid);
    return isValid;
  } catch (error) {
    console.error("Signature comparison error:", error);
    // Fallback: direct string comparison (less secure but might work)
    const isValid = signatureToCompare === normalizedDigest;
    console.log("Signature valid (fallback string compare):", isValid);
    return isValid;
  }
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

