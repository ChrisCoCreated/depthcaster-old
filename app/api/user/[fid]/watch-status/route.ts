import { NextRequest, NextResponse } from "next/server";
import { getWatchedFids } from "@/lib/webhooks";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fid: string }> }
) {
  try {
    const { fid: fidParam } = await params;
    const watchedFid = parseInt(fidParam);
    const searchParams = request.nextUrl.searchParams;
    const watcherFid = searchParams.get("watcherFid");

    if (isNaN(watchedFid)) {
      return NextResponse.json(
        { error: "Invalid FID" },
        { status: 400 }
      );
    }

    if (!watcherFid) {
      return NextResponse.json(
        { error: "watcherFid is required" },
        { status: 400 }
      );
    }

    const watchedFids = await getWatchedFids(parseInt(watcherFid));
    const isWatching = watchedFids.includes(watchedFid);

    return NextResponse.json({
      isWatching,
    });
  } catch (error: any) {
    console.error("Error checking watch status:", error);
    return NextResponse.json(
      { error: error.message || "Failed to check watch status" },
      { status: 500 }
    );
  }
}






