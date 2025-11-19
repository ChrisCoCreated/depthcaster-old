import { NextRequest, NextResponse } from "next/server";
import { neynarClient } from "@/lib/neynar";
import { getUser } from "@/lib/users";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const fidsParam = searchParams.get("fids");

    if (!fidsParam) {
      return NextResponse.json(
        { error: "fids parameter is required" },
        { status: 400 }
      );
    }

    const fids = fidsParam
      .split(",")
      .map((fid) => parseInt(fid.trim()))
      .filter((fid) => !isNaN(fid));

    if (fids.length === 0) {
      return NextResponse.json({ users: [] });
    }

    // Try to get users from database first
    const users = [];
    const fidsToFetch: number[] = [];

    for (const fid of fids) {
      const dbUser = await getUser(fid);
      if (dbUser) {
        users.push({
          fid,
          username: dbUser.username || undefined,
          displayName: dbUser.displayName || undefined,
          pfpUrl: dbUser.pfpUrl || undefined,
        });
      } else {
        fidsToFetch.push(fid);
      }
    }

    // Fetch remaining users from Neynar
    if (fidsToFetch.length > 0) {
      try {
        const neynarResponse = await neynarClient.fetchBulkUsers({ fids: fidsToFetch });
        const neynarUsers = (neynarResponse.users || []).map((u: any) => ({
          fid: u.fid,
          username: u.username,
          displayName: u.display_name || undefined,
          pfpUrl: u.pfp_url || undefined,
        }));
        users.push(...neynarUsers);
      } catch (error) {
        console.error("Failed to fetch bulk users from Neynar:", error);
      }
    }

    return NextResponse.json({ users });
  } catch (error: any) {
    console.error("Error fetching bulk users:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch bulk users" },
      { status: 500 }
    );
  }
}









