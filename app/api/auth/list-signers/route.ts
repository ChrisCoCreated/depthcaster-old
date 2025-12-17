import { NextRequest, NextResponse } from "next/server";
import { neynarClient } from "@/lib/neynar";

/**
 * List signers for a user using SIWF (Sign In With Farcaster) message and signature
 * This endpoint calls Neynar's /v2/farcaster/signer/list/ API to find existing approved signers
 * that can be reused instead of creating new ones on each login.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const message = searchParams.get("message");
    const signature = searchParams.get("signature");

    if (!message || !signature) {
      return NextResponse.json(
        { error: "message and signature query parameters are required" },
        { status: 400 }
      );
    }

    // Call Neynar API to list signers
    const { signers } = await neynarClient.fetchSigners({ message, signature });

    // Find the first approved signer
    const approvedSigner = signers?.find((signer) => signer.status === "approved");

    if (approvedSigner) {
      return NextResponse.json({
        signer_uuid: approvedSigner.signer_uuid,
        fid: approvedSigner.fid,
        status: approvedSigner.status,
        all_signers: signers, // Return all signers for debugging/info
      });
    }

    // No approved signer found
    return NextResponse.json({
      signer_uuid: null,
      all_signers: signers || [],
    });
  } catch (error: any) {
    console.error("Error listing signers:", error);
    return NextResponse.json(
      { error: error.message || "Failed to list signers" },
      { status: 500 }
    );
  }
}

/**
 * POST endpoint for list-signers (alternative to GET with query params)
 * Accepts message and signature in request body
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, signature } = body;

    if (!message || !signature) {
      return NextResponse.json(
        { error: "message and signature are required in request body" },
        { status: 400 }
      );
    }

    // Call Neynar API to list signers
    const { signers } = await neynarClient.fetchSigners({ message, signature });

    // Find the first approved signer
    const approvedSigner = signers?.find((signer) => signer.status === "approved");

    if (approvedSigner) {
      return NextResponse.json({
        signer_uuid: approvedSigner.signer_uuid,
        fid: approvedSigner.fid,
        status: approvedSigner.status,
        all_signers: signers, // Return all signers for debugging/info
      });
    }

    // No approved signer found
    return NextResponse.json({
      signer_uuid: null,
      all_signers: signers || [],
    });
  } catch (error: any) {
    console.error("Error listing signers:", error);
    return NextResponse.json(
      { error: error.message || "Failed to list signers" },
      { status: 500 }
    );
  }
}




























