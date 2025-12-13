import { NextRequest, NextResponse } from "next/server";
import { getClientForUser, storeClientKeysForUser } from "@/lib/xmtp-server";
import { getAddress, type Address } from "viem";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userFid, walletAddress, keys, signature, message } = body;

    if (!userFid || !walletAddress) {
      return NextResponse.json(
        { error: "userFid and walletAddress are required" },
        { status: 400 }
      );
    }

    // Validate wallet address format
    let address: Address;
    try {
      address = getAddress(walletAddress);
    } catch (error) {
      return NextResponse.json(
        { error: "Invalid wallet address format" },
        { status: 400 }
      );
    }

    const fid = parseInt(userFid.toString(), 10);

    // Check if client already exists in our database
    const existing = await getClientForUser(fid, address);
    if (existing) {
      return NextResponse.json({
        success: true,
        address: existing.address,
        env: process.env.XMTP_ENV || "dev",
        alreadyInitialized: true,
      });
    }

    // If keys are provided from client-side, store them
    if (keys && Array.isArray(keys)) {
      const keysArray = new Uint8Array(keys);
      await storeClientKeysForUser(fid, address, keysArray);
      return NextResponse.json({
        success: true,
        address,
        env: process.env.XMTP_ENV || "dev",
        initialized: true,
      });
    }

    // If no keys but we have signature, we can't initialize server-side without a signer
    // The client should initialize and send keys
    return NextResponse.json(
      { 
        error: "Keys are required. Please initialize XMTP client on the client side first.",
        requiresClientInitialization: true 
      },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("Error storing XMTP client keys:", error);
    return NextResponse.json(
      { error: error.message || "Failed to store XMTP keys" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userFid = searchParams.get("userFid");
    const walletAddress = searchParams.get("walletAddress");

    if (!userFid || !walletAddress) {
      return NextResponse.json(
        { error: "userFid and walletAddress are required" },
        { status: 400 }
      );
    }

    const address = getAddress(walletAddress as Address);
    const fid = parseInt(userFid, 10);

    // Check if client exists
    const client = await getClientForUser(fid, address);
    if (client) {
      return NextResponse.json({
        success: true,
        address: client.address,
        env: process.env.XMTP_ENV || "dev",
        initialized: true,
      });
    }

    return NextResponse.json({
      success: false,
      initialized: false,
    });
  } catch (error: any) {
    console.error("Error checking XMTP client:", error);
    return NextResponse.json(
      { error: error.message || "Failed to check XMTP client" },
      { status: 500 }
    );
  }
}

