import { NextRequest, NextResponse } from "next/server";
import { canMessage } from "@/lib/xmtp-server";
import { getAddress, type Address } from "viem";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address: addressParam } = await params;
    
    let address: Address;
    try {
      address = getAddress(addressParam as Address);
    } catch (error) {
      return NextResponse.json(
        { error: "Invalid address format" },
        { status: 400 }
      );
    }

    // Check if address can receive messages
    const canMsg = await canMessage(address);

    return NextResponse.json({
      address,
      canMessage: canMsg,
    });
  } catch (error: any) {
    console.error("Error checking if address can message:", error);
    return NextResponse.json(
      { error: error.message || "Failed to check address" },
      { status: 500 }
    );
  }
}

