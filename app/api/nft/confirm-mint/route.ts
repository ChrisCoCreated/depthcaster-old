import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { nftMints } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

/**
 * Confirm mint transaction after it's been executed on-chain
 * This endpoint should be called after the client successfully mints the NFT
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tokenId, transactionHash, userAddress } = body;

    if (!tokenId || !transactionHash || !userAddress) {
      return NextResponse.json(
        { error: "tokenId, transactionHash, and userAddress are required" },
        { status: 400 }
      );
    }

    // Update the mint record with the transaction hash
    await db
      .update(nftMints)
      .set({
        transactionHash,
        ownerAddress: userAddress.toLowerCase(),
      })
      .where(
        and(
          eq(nftMints.tokenId, tokenId),
          eq(nftMints.transactionHash, "pending")
        )
      );

    return NextResponse.json({
      success: true,
      message: "Mint confirmed",
    });
  } catch (error: any) {
    console.error("Error confirming mint:", error);
    return NextResponse.json(
      { error: error.message || "Failed to confirm mint" },
      { status: 500 }
    );
  }
}

