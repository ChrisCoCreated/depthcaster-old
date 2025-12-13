import { NextRequest, NextResponse } from "next/server";
import { getClientForUser } from "@/lib/xmtp-server";
import { getAddress, type Address } from "viem";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userFid, walletAddress } = body;

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

    // Check if client already exists
    const existing = await getClientForUser(userFid, address);
    if (existing) {
      return NextResponse.json({
        success: true,
        address: existing.address,
        env: process.env.XMTP_ENV || "dev",
        alreadyInitialized: true,
      });
    }

    // Client initialization should happen on the client side with wallet signature
    // This endpoint just checks if it's initialized
    return NextResponse.json(
      { 
        error: "XMTP client not found. Please initialize on client side with wallet signature.",
        requiresClientInitialization: true 
      },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("Error checking XMTP client:", error);
    return NextResponse.json(
      { error: error.message || "Failed to check XMTP client" },
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

