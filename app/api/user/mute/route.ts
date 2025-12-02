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

    // Try using Neynar SDK's publishMute method if available
    // If not available, fall back to direct HTTP call
    let result;
    try {
      // Check if publishMute exists on the client
      if (typeof (neynarClient as any).publishMute === 'function') {
        result = await (neynarClient as any).publishMute({
          signerUuid,
          mutedFid: parseInt(targetFid),
        });
      } else {
        // Fall back to direct HTTP call
        // Neynar API requires signer_uuid for authentication (not fid)
        const response = await fetch("https://api.neynar.com/v2/farcaster/mute", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.NEYNAR_API_KEY!,
          },
          body: JSON.stringify({
            signer_uuid: signerUuid,
            muted_fid: parseInt(targetFid),
          }),
        });

        if (!response.ok) {
          let errorMessage = "Failed to mute user";
          try {
            const errorData = await response.json();
            errorMessage = errorData.message || errorData.error || `Neynar API error: ${response.status} ${response.statusText}`;
          } catch (e) {
            const errorText = await response.text().catch(() => "");
            errorMessage = `Neynar API error: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ""}`;
          }
          throw new Error(errorMessage);
        }

        result = await response.json();
      }
    } catch (apiError: any) {
      console.error("Neynar mute API error:", {
        message: apiError.message,
        response: apiError.response?.data,
        status: apiError.response?.status,
      });
      throw apiError;
    }

    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    console.error("Mute API error:", error);
    const errorMessage = error.message || error.response?.data?.message || "Failed to mute user";
    return NextResponse.json(
      { error: errorMessage },
      { status: error.response?.status || 500 }
    );
  }
}





