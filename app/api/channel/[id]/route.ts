import { NextRequest, NextResponse } from "next/server";
import { neynarClient } from "@/lib/neynar";
import { FetchFeedFeedTypeEnum, FetchFeedFilterTypeEnum } from "@neynar/nodejs-sdk/build/api";
import { deduplicateRequest } from "@/lib/neynar-batch";
import { enrichCastsWithViewerContext } from "@/lib/interactions";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: channelId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const viewerFid = searchParams.get("viewerFid")
      ? parseInt(searchParams.get("viewerFid")!)
      : undefined;
    const cursor = searchParams.get("cursor") || undefined;
    const limit = parseInt(searchParams.get("limit") || "25");

    if (!channelId) {
      return NextResponse.json(
        { error: "Channel ID is required" },
        { status: 400 }
      );
    }

    // Fetch channel feed using Neynar API
    const feed = await deduplicateRequest(
      `channel-${channelId}-${viewerFid || "none"}-${cursor || "initial"}-${limit}`,
      async () => {
        return await neynarClient.fetchFeed({
          feedType: FetchFeedFeedTypeEnum.Filter,
          filterType: FetchFeedFilterTypeEnum.ChannelId,
          channelId: channelId,
          limit,
          cursor,
          withRecasts: true,
          ...(viewerFid ? { viewerFid } : {}),
        });
      }
    );

    let casts = feed.casts || [];
    const neynarCursor = feed.next?.cursor || null;

    // Enrich casts with viewer context from database
    if (viewerFid) {
      casts = await enrichCastsWithViewerContext(casts, viewerFid);
    }

    const response = {
      casts,
      next: { cursor: neynarCursor },
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("Channel API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch channel feed" },
      { status: 500 }
    );
  }
}






























