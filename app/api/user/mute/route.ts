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

    // Verify signer ownership
    const signer = await neynarClient.lookupSigner({ signerUuid });
    const userFid = signer.fid;

    // Make direct HTTP call to Neynar mute API
    // The SDK doesn't expose a mute method, so we call the API directly
    const response = await fetch("https://api.neynar.com/v2/farcaster/mute", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.NEYNAR_API_KEY!,
      },
      body: JSON.stringify({
        signer_uuid: signerUuid,
        target_fid: parseInt(targetFid),
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Failed to mute user" }));
      console.error("Neynar mute API error:", errorData);
      return NextResponse.json(
        { error: errorData.error || "Failed to mute user" },
        { status: response.status }
      );
    }

    const result = await response.json();

    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    console.error("Mute API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to mute user" },
      { status: 500 }
    );
  }
}
