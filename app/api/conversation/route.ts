import { NextRequest, NextResponse } from "next/server";
import { neynarClient } from "@/lib/neynar";
import { LookupCastConversationTypeEnum, LookupCastConversationSortTypeEnum, LookupCastConversationFoldEnum } from "@neynar/nodejs-sdk/build/api";
import { cacheConversation } from "@/lib/cache";
import { deduplicateRequest } from "@/lib/neynar-batch";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const identifier = searchParams.get("identifier");
    const typeParam = searchParams.get("type") || "hash";
    const replyDepth = parseInt(searchParams.get("replyDepth") || "3");
    const foldParam = searchParams.get("fold") || "above"; // above, below, or not set
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

    // Determine fold enum value
    const foldEnum = foldParam === "below" 
      ? LookupCastConversationFoldEnum.Below 
      : LookupCastConversationFoldEnum.Above;

    // Generate cache key (include fold in cache key)
    const cacheKey = cacheConversation.generateKey({
      identifier,
      type: typeParam,
      replyDepth,
      viewerFid,
      fold: foldParam, // Include fold in cache key
    });

    // Check cache first
    const cachedResult = cacheConversation.get(cacheKey);
    if (cachedResult) {
      return NextResponse.json(cachedResult);
    }

    // Use deduplication to prevent concurrent duplicate requests
    const conversation = await deduplicateRequest(cacheKey, async () => {
      return await neynarClient.lookupCastConversation({
        identifier,
        type,
        replyDepth,
        viewerFid,
        sortType: LookupCastConversationSortTypeEnum.Algorithmic, // Rank by quality
        fold: foldEnum, // Use Neynar's fold to separate high/low quality replies
        includeChronologicalParentCasts: true,
      });
    });

    // Cache the response
    cacheConversation.set(cacheKey, conversation);

    return NextResponse.json(conversation);
  } catch (error: any) {
    console.error("Conversation API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch conversation" },
      { status: 500 }
    );
  }
}

