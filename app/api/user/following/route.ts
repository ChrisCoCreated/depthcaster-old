import { NextRequest, NextResponse } from "next/server";
import { neynarClient } from "@/lib/neynar";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const fid = searchParams.get("fid");
    const limit = parseInt(searchParams.get("limit") || "25");

    if (!fid) {
      return NextResponse.json(
        { error: "fid is required" },
        { status: 400 }
      );
    }

    const following = await neynarClient.fetchUserFollowing({
      fid: parseInt(fid),
      limit: Math.min(limit, 100),
    });

    return NextResponse.json({
      users: following.result?.users || [],
    });
  } catch (error: any) {
    console.error("Error fetching user following:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch following" },
      { status: 500 }
    );
  }
}

