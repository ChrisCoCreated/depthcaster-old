import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pfpNfts } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tokenId, ownerAddress, imageUrl, metadata, transactionHash, replicateJobId } = body;

    if (!tokenId || !ownerAddress || !imageUrl) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Check if token already exists
    const existing = await db
      .select()
      .from(pfpNfts)
      .where(eq(pfpNfts.tokenId, Number(tokenId)))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: "Token already exists" },
        { status: 409 }
      );
    }

    // Insert new NFT record
    await db.insert(pfpNfts).values({
      tokenId: Number(tokenId),
      ownerAddress,
      imageUrl,
      metadata: metadata || null,
      transactionHash: transactionHash || null,
      replicateJobId: replicateJobId || null,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[pfp/mint] Error storing NFT:", error);
    return NextResponse.json(
      {
        error: "Failed to store NFT",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

