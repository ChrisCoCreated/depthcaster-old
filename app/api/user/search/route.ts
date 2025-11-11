import { NextRequest, NextResponse } from "next/server";
import { neynarClient } from "@/lib/neynar";
import { cacheSearch } from "@/lib/cache";
import { deduplicateRequest } from "@/lib/neynar-batch";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get("q");
    const viewerFid = searchParams.get("viewerFid") 
      ? parseInt(searchParams.get("viewerFid")!) 
      : undefined;
    const limit = parseInt(searchParams.get("limit") || "10");

    if (!q || q.length === 0) {
      return NextResponse.json({ users: [] });
    }

    // Generate cache key
    const cacheKey = cacheSearch.generateKey({
      q: q.toLowerCase().trim(),
      viewerFid,
      limit,
    });

    // Check cache first
    const cachedResult = cacheSearch.get(cacheKey);
    if (cachedResult) {
      return NextResponse.json(cachedResult);
    }

    // Use deduplication to prevent concurrent duplicate requests
    const searchResult = await deduplicateRequest(cacheKey, async () => {
      return await neynarClient.searchUser({
        q,
        limit: Math.min(limit, 50),
        viewerFid,
      });
    });

    const response = {
      users: (searchResult.result?.users || []).map((u: any) => ({
        fid: u.fid,
        username: u.username,
        display_name: u.display_name,
        pfp_url: u.pfp_url,
        viewer_context: u.viewer_context,
      })),
    };

    // Cache the response
    cacheSearch.set(cacheKey, response);

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("Error searching users:", error);
    return NextResponse.json(
      { error: error.message || "Failed to search users" },
      { status: 500 }
    );
  }
}

