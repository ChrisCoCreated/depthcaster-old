import { NextRequest, NextResponse } from "next/server";
import { neynarClient } from "@/lib/neynar";
import { LookupCastConversationTypeEnum, LookupCastConversationSortTypeEnum, LookupCastConversationFoldEnum } from "@neynar/nodejs-sdk/build/api";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const identifier = searchParams.get("identifier");
    const typeParam = searchParams.get("type") || "hash";
    const replyDepth = parseInt(searchParams.get("replyDepth") || "3");
    const viewerFid = searchParams.get("viewerFid")
      ? parseInt(searchParams.get("viewerFid")!)
      : undefined;

    if (!identifier) {
      return NextResponse.json(
        { error: "identifier is required" },
        { status: 400 }
      );
    }

    const type = typeParam === "url" 
      ? LookupCastConversationTypeEnum.Url 
      : LookupCastConversationTypeEnum.Hash;

    const conversation = await neynarClient.lookupCastConversation({
      identifier,
      type,
      replyDepth,
      viewerFid,
      sortType: LookupCastConversationSortTypeEnum.Quality, // Rank by quality
      // fold: LookupCastConversationFoldEnum.Above, // Temporarily remove fold to see all replies
      includeChronologicalParentCasts: true,
    });

    return NextResponse.json(conversation);
  } catch (error: any) {
    console.error("Conversation API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch conversation" },
      { status: 500 }
    );
  }
}

