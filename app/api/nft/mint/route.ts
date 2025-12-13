import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { nftMints } from "@/lib/schema";
import { count } from "drizzle-orm";
import { uploadToIPFS, uploadMetadataToIPFS } from "@/lib/nft-storage";

const THIRDWEB_CLIENT_ID = process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID;
const THIRDWEB_SECRET_KEY = process.env.THIRDWEB_SECRET_KEY;
const NFT_CONTRACT_ADDRESS = process.env.NFT_CONTRACT_ADDRESS;
const MINT_PRICE = "1000000000000000"; // 0.001 ETH in wei
const MAX_SUPPLY = 1111;

if (!NFT_CONTRACT_ADDRESS) {
  console.warn("NFT_CONTRACT_ADDRESS not set - minting will fail");
}

export async function POST(request: NextRequest) {
  try {
    if (!THIRDWEB_SECRET_KEY || !NFT_CONTRACT_ADDRESS) {
      return NextResponse.json(
        { error: "NFT contract not configured" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { userAddress } = body;

    if (!userAddress || typeof userAddress !== "string") {
      return NextResponse.json(
        { error: "User address is required" },
        { status: 400 }
      );
    }

    // Check current supply
    const [supplyResult] = await db
      .select({ count: count() })
      .from(nftMints);

    const currentSupply = supplyResult?.count || 0;

    if (currentSupply >= MAX_SUPPLY) {
      return NextResponse.json(
        { error: "Collection is sold out" },
        { status: 400 }
      );
    }

    // Generate image
    console.log("Generating image...");
    const imageResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/nft/generate-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    if (!imageResponse.ok) {
      throw new Error("Failed to generate image");
    }

    const { imageUrl, imageData } = await imageResponse.json();

    // Fetch the image
    const imageFetchResponse = await fetch(imageUrl);
    if (!imageFetchResponse.ok) {
      throw new Error("Failed to fetch generated image");
    }

    const imageBuffer = Buffer.from(await imageFetchResponse.arrayBuffer());

    // Upload image to IPFS
    console.log("Uploading image to IPFS...");
    const imageIpfsUrl = await uploadToIPFS(imageBuffer, `nft-${Date.now()}.png`);

    // Create metadata
    const tokenId = currentSupply + 1;
    const metadata = {
      name: `Deepsea Diver PFP #${tokenId}`,
      description: "A generative PFP of a deepsea diver in dystopic graphic novel style",
      image: imageIpfsUrl,
      attributes: [
        { trait_type: "Collection", value: "Deepsea Diver PFPs" },
        { trait_type: "Token ID", value: tokenId.toString() },
      ],
    };

    // Upload metadata to IPFS
    console.log("Uploading metadata to IPFS...");
    const metadataIpfsUrl = await uploadMetadataToIPFS(metadata);

    // Reserve the token ID by storing a pending mint record
    // The actual minting will happen client-side
    // We'll update this record when the transaction is confirmed
    
    // Store pending mint record (transactionHash will be null until confirmed)
    await db.insert(nftMints).values({
      tokenId,
      ownerAddress: userAddress.toLowerCase(),
      imageUrl: imageIpfsUrl,
      metadataUrl: metadataIpfsUrl,
      transactionHash: "pending", // Will be updated when transaction is confirmed
    });

    // Return metadata for client-side minting
    return NextResponse.json({
      success: true,
      tokenId,
      metadataUrl: metadataIpfsUrl,
      imageUrl: imageIpfsUrl,
      mintPrice: MINT_PRICE,
      contractAddress: NFT_CONTRACT_ADDRESS,
      // Client will call the contract's mint function with this metadata
    });
  } catch (error: any) {
    console.error("Error minting NFT:", error);
    return NextResponse.json(
      { error: error.message || "Failed to mint NFT" },
      { status: 500 }
    );
  }
}

