import { NextRequest, NextResponse } from "next/server";
import { neynarClient } from "@/lib/neynar";
import { deduplicateRequest } from "@/lib/neynar-batch";
import { enrichCastsWithViewerContext } from "@/lib/interactions";

const THINKING_URL = "https://www.sopha.social/thinking";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const cursor = searchParams.get("cursor") || undefined;
    const limit = parseInt(searchParams.get("limit") || "25");
    const viewerFid = searchParams.get("viewerFid")
      ? parseInt(searchParams.get("viewerFid")!)
      : undefined;

    // Use Neynar's parent_urls endpoint
    const feed = await deduplicateRequest(
      `thinking-${viewerFid || "none"}-${cursor || "initial"}-${limit}`,
      async () => {
        // Use the Neynar SDK's fetchFeedByParentUrls method if available, otherwise make direct API call
        const apiKey = process.env.NEYNAR_API_KEY;
        if (!apiKey) {
          throw new Error("NEYNAR_API_KEY is not set");
        }

        const params = new URLSearchParams({
          limit: limit.toString(),
          parent_urls: THINKING_URL,
        });

        if (cursor) {
          params.append("cursor", cursor);
        }

        if (viewerFid) {
          params.append("viewer_fid", viewerFid.toString());
        }

        const response = await fetch(
          `https://api.neynar.com/v2/farcaster/feed/parent_urls/?${params.toString()}`,
          {
            method: "GET",
            headers: {
              "x-api-key": apiKey,
            },
          }
        );

        if (!response.ok) {
          throw new Error(`Neynar API error: ${response.status} ${response.statusText}`);
        }

        return await response.json();
      }
    );

    const casts = feed.casts || [];
    const neynarCursor = feed.next?.cursor || null;

    // Enrich casts with viewer context from database
    let enrichedCasts = casts;
    if (viewerFid && casts.length > 0) {
      enrichedCasts = await enrichCastsWithViewerContext(casts, viewerFid);
    }

    return NextResponse.json({
      casts: enrichedCasts,
      next: neynarCursor ? { cursor: neynarCursor } : null,
    });
  } catch (error: any) {
    console.error("Thinking API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch thinking casts" },
      { status: 500 }
    );
  }
}
