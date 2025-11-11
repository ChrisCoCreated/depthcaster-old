import { NextRequest, NextResponse } from "next/server";
import { neynarClient } from "@/lib/neynar";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const fid = searchParams.get("fid");
    const limit = parseInt(searchParams.get("limit") || "20");

    if (!fid) {
      return NextResponse.json(
        { error: "fid is required" },
        { status: 400 }
      );
    }

    const userFid = parseInt(fid);

    // Get best friends ranked by mutual affinity score based on interactions
    const bestFriends = await neynarClient.getUserBestFriends({
      fid: userFid,
      limit: Math.min(limit, 100), // API max is 100
    });

    const suggestedUsers = bestFriends.users || [];

    return NextResponse.json({
      users: suggestedUsers.map((u: any) => ({
        fid: u.fid,
        username: u.username,
        display_name: u.display_name,
        pfp_url: u.pfp_url,
        viewer_context: u.viewer_context,
      })),
    });
  } catch (error: any) {
    console.error("Error fetching suggested users:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch suggested users" },
      { status: 500 }
    );
  }
}

