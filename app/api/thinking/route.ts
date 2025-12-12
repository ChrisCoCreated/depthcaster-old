import { NextRequest, NextResponse } from "next/server";
import { neynarClient } from "@/lib/neynar";
import { LookupCastConversationTypeEnum, LookupCastConversationSortTypeEnum } from "@neynar/nodejs-sdk/build/api";
import { deduplicateRequest } from "@/lib/neynar-batch";
import { enrichCastsWithViewerContext } from "@/lib/interactions";

const THINKING_URL = "https://www.depthcaster.com/thinking";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const cursor = searchParams.get("cursor") || undefined;
    const limit = parseInt(searchParams.get("limit") || "25");
    const viewerFid = searchParams.get("viewerFid")
      ? parseInt(searchParams.get("viewerFid")!)
      : undefined;

    // Fetch conversation for the thinking URL
    // This will return the root cast (if any) and replies
    const conversation = await deduplicateRequest(
      `thinking-${viewerFid || "none"}-${cursor || "initial"}-${limit}`,
      async () => {
        return await neynarClient.lookupCastConversation({
          identifier: THINKING_URL,
          type: LookupCastConversationTypeEnum.Url,
          replyDepth: 1, // Get direct replies
          viewerFid,
          sortType: LookupCastConversationSortTypeEnum.DescChron,
        });
      }
    );

    // Extract casts from the conversation
    // For URL parents, replies are in cast.direct_replies
    let casts: any[] = [];
    
    const conv = conversation.conversation;
    if (conv?.cast) {
      // Get direct replies from the cast
      if (conv.cast.direct_replies && Array.isArray(conv.cast.direct_replies)) {
        casts = conv.cast.direct_replies;
      }
      // If the cast itself has parent_url matching our URL, include it
      else if (conv.cast.parent_url === THINKING_URL) {
        casts = [conv.cast];
      }
    }

    // Sort by timestamp (most recent first)
    casts.sort((a: any, b: any) => {
      const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return bTime - aTime;
    });

    // Apply pagination
    const startIndex = cursor ? parseInt(cursor) : 0;
    const paginatedCasts = casts.slice(startIndex, startIndex + limit);
    const nextCursor = startIndex + limit < casts.length ? (startIndex + limit).toString() : null;

    // Enrich casts with viewer context from database
    if (viewerFid && paginatedCasts.length > 0) {
      const enrichedCasts = await enrichCastsWithViewerContext(paginatedCasts, viewerFid);
      return NextResponse.json({
        casts: enrichedCasts,
        next: nextCursor ? { cursor: nextCursor } : null,
      });
    }

    return NextResponse.json({
      casts: paginatedCasts,
      next: nextCursor ? { cursor: nextCursor } : null,
    });
  } catch (error: any) {
    console.error("Thinking API error:", error);
    // If URL lookup fails, return empty array (no casts yet)
    if (error.message?.includes("not found") || error.message?.includes("404")) {
      return NextResponse.json({
        casts: [],
        next: null,
      });
    }
    return NextResponse.json(
      { error: error.message || "Failed to fetch thinking casts" },
      { status: 500 }
    );
  }
}
