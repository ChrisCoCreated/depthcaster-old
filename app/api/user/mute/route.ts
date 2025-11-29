import { NextRequest, NextResponse } from "next/server";
import { neynarClient } from "@/lib/neynar";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { signerUuid, targetFid } = body;

    if (!signerUuid || !targetFid) {
      return NextResponse.json(
        { error: "signerUuid and targetFid are required" },
        { status: 400 }
      );
    }

    // Verify signer ownership and get user FID
    const signer = await neynarClient.lookupSigner({ signerUuid });
    const userFid = signer.fid;

    if (!userFid) {
      return NextResponse.json(
        { error: "Unable to determine user FID from signer" },
        { status: 400 }
      );
    }

    // Use Neynar SDK's publishMute method
    const result = await neynarClient.publishMute({
      fid: userFid,
      mutedFid: parseInt(targetFid),
    });

    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    console.error("Mute API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to mute user" },
      { status: 500 }
    );
  }
}
