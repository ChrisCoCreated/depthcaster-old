import { NextRequest, NextResponse } from "next/server";
import { neynarClient } from "@/lib/neynar";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { signerUuid, text, parent, embeds, channelId, parentAuthorFid } = body;

    if (!signerUuid) {
      return NextResponse.json(
        { error: "signerUuid is required" },
        { status: 400 }
      );
    }

    const cast = await neynarClient.publishCast({
      signerUuid,
      text: text || "",
      parent,
      embeds,
      channelId,
      parentAuthorFid,
    });

    return NextResponse.json({ success: true, cast });
  } catch (error: any) {
    console.error("Cast API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to publish cast" },
      { status: 500 }
    );
  }
}

