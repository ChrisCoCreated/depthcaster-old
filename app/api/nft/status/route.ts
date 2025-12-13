import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { nftMints } from "@/lib/schema";
import { count, eq } from "drizzle-orm";

const MAX_SUPPLY = 1111;

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userAddress = searchParams.get("userAddress");

    // Get current supply
    const [supplyResult] = await db
      .select({ count: count() })
      .from(nftMints);

    const currentSupply = supplyResult?.count || 0;
    const remaining = MAX_SUPPLY - currentSupply;
    const isSoldOut = currentSupply >= MAX_SUPPLY;

    // Check if user has minted
    let userHasMinted = false;
    let userMintCount = 0;
    if (userAddress) {
      const userMints = await db
        .select({ count: count() })
        .from(nftMints)
        .where(eq(nftMints.ownerAddress, userAddress.toLowerCase()));

      userMintCount = userMints[0]?.count || 0;
      userHasMinted = userMintCount > 0;
    }

    return NextResponse.json({
      currentSupply,
      maxSupply: MAX_SUPPLY,
      remaining,
      isSoldOut,
      userHasMinted,
      userMintCount,
      price: "0.001", // ETH
    });
  } catch (error: any) {
    console.error("Error fetching NFT status:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch status" },
      { status: 500 }
    );
  }
}

