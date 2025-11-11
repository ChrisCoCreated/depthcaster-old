import { NextRequest, NextResponse } from "next/server";
import { neynarClient } from "@/lib/neynar";
import { ReactionType } from "@neynar/nodejs-sdk/build/api";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { signerUuid, reactionType, target, targetAuthorFid } = body;

    if (!signerUuid || !reactionType || !target) {
      return NextResponse.json(
        { error: "signerUuid, reactionType, and target are required" },
        { status: 400 }
      );
    }

    const reaction = await neynarClient.publishReaction({
      signerUuid,
      reactionType: reactionType as ReactionType,
      target,
      targetAuthorFid,
    });

    return NextResponse.json({ success: true, reaction });
  } catch (error: any) {
    console.error("Reaction API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to publish reaction" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { signerUuid, reactionType, target, targetAuthorFid } = body;

    if (!signerUuid || !reactionType || !target) {
      return NextResponse.json(
        { error: "signerUuid, reactionType, and target are required" },
        { status: 400 }
      );
    }

    const reaction = await neynarClient.deleteReaction({
      signerUuid,
      reactionType: reactionType as ReactionType,
      target,
      targetAuthorFid,
    });

    return NextResponse.json({ success: true, reaction });
  } catch (error: any) {
    console.error("Delete reaction API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete reaction" },
      { status: 500 }
    );
  }
}


