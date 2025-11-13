import { NextRequest, NextResponse } from "next/server";
import { trackCuratedCastInteraction } from "@/lib/interactions";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { targetCastHash, interactionType, userFid } = body;

    if (!targetCastHash || !interactionType || !userFid) {
      return NextResponse.json(
        { error: "targetCastHash, interactionType, and userFid are required" },
        { status: 400 }
      );
    }

    if (!["reply", "like", "recast", "quote"].includes(interactionType)) {
      return NextResponse.json(
        { error: "Invalid interactionType" },
        { status: 400 }
      );
    }

    await trackCuratedCastInteraction(
      targetCastHash,
      interactionType as "reply" | "like" | "recast" | "quote",
      userFid
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Track interaction API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to track interaction" },
      { status: 500 }
    );
  }
}




