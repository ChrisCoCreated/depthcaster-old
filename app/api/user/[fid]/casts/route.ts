import { NextRequest, NextResponse } from "next/server";
import { neynarClient } from "@/lib/neynar";
import { FetchFeedFeedTypeEnum, FetchFeedFilterTypeEnum } from "@neynar/nodejs-sdk/build/api";
import { deduplicateRequest } from "@/lib/neynar-batch";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fid: string }> }
) {
  try {
    const { fid: fidParam } = await params;
    const fid = parseInt(fidParam);
    const searchParams = request.nextUrl.searchParams;
    const cursor = searchParams.get("cursor") || undefined;
    const limit = parseInt(searchParams.get("limit") || "25");
    const viewerFid = searchParams.get("viewerFid")
      ? parseInt(searchParams.get("viewerFid")!)
      : undefined;

    if (isNaN(fid)) {
      return NextResponse.json(
        { error: "Invalid FID" },
        { status: 400 }
      );
    }

    // Fetch user casts using feed API filtered by FID
    const feed = await deduplicateRequest(
      `user-casts-${fid}-${viewerFid || "none"}-${cursor || "initial"}-${limit}`,
      async () => {
        return await neynarClient.fetchFeed({
          feedType: FetchFeedFeedTypeEnum.Filter,
          filterType: FetchFeedFilterTypeEnum.Fids,
          fids: [fid],
          limit: Math.min(limit, 100),
          ...(cursor ? { cursor } : {}),
          withRecasts: false, // Only parent casts, no recasts
          ...(viewerFid ? { viewerFid } : {}),
        });
      }
    );

    // Filter to only parent casts (no replies, no recasts)
    const casts = (feed.casts || []).filter((cast: any) => {
      // Only include casts without parent_hash (parent casts)
      return !cast.parent_hash;
    });

    return NextResponse.json({
      casts,
      next: feed.next ? { cursor: feed.next.cursor } : null,
    });
  } catch (error: any) {
    console.error("Error fetching user casts:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch user casts" },
      { status: 500 }
    );
  }
}

