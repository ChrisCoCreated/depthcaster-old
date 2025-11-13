import { NextRequest, NextResponse } from "next/server";
import { neynarClient } from "@/lib/neynar";
import { getUser } from "@/lib/users";

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
    
    // Extract FIDs to bulk fetch user details
    const fids = suggestedUsers.map((u: any) => u.fid).filter((fid: number) => !isNaN(fid));
    
    if (fids.length === 0) {
      return NextResponse.json({ users: [] });
    }

    // Try to get users from database first
    const users = [];
    const fidsToFetch: number[] = [];

    for (const fid of fids) {
      const dbUser = await getUser(fid);
      if (dbUser && dbUser.username && dbUser.pfpUrl) {
        // Find the bestfriend data for this fid
        const bestfriendData = suggestedUsers.find((u: any) => u.fid === fid);
        users.push({
          fid,
          username: dbUser.username,
          display_name: dbUser.displayName || undefined,
          pfp_url: dbUser.pfpUrl || undefined,
          mutual_affinity_score: bestfriendData?.mutual_affinity_score,
        });
      } else {
        fidsToFetch.push(fid);
      }
    }

    // Fetch remaining users from Neynar in bulk
    if (fidsToFetch.length > 0) {
      try {
        // Neynar API accepts up to 100 FIDs at a time
        const batchSize = 100;
        for (let i = 0; i < fidsToFetch.length; i += batchSize) {
          const batch = fidsToFetch.slice(i, i + batchSize);
          const neynarResponse = await neynarClient.fetchBulkUsers({ fids: batch });
          const neynarUsers = neynarResponse.users || [];
          
          for (const neynarUser of neynarUsers) {
            const fid = neynarUser.fid;
            const bestfriendData = suggestedUsers.find((u: any) => u.fid === fid);
            users.push({
              fid,
              username: neynarUser.username,
              display_name: neynarUser.display_name || undefined,
              pfp_url: neynarUser.pfp_url || undefined,
              mutual_affinity_score: bestfriendData?.mutual_affinity_score,
            });
          }
        }
      } catch (error) {
        console.error("Failed to fetch bulk users from Neynar:", error);
        // Fallback: return users with just fid and username from bestfriends
        for (const fid of fidsToFetch) {
          const bestfriendData = suggestedUsers.find((u: any) => u.fid === fid);
          if (bestfriendData) {
            users.push({
              fid: bestfriendData.fid,
              username: bestfriendData.username,
              display_name: undefined,
              pfp_url: undefined,
              mutual_affinity_score: bestfriendData.mutual_affinity_score,
            });
          }
        }
      }
    }

    // Sort users by mutual_affinity_score (descending) to maintain ranking
    users.sort((a, b) => {
      const scoreA = a.mutual_affinity_score || 0;
      const scoreB = b.mutual_affinity_score || 0;
      return scoreB - scoreA;
    });

    return NextResponse.json({ users });
  } catch (error: any) {
    console.error("Error fetching suggested users:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch suggested users" },
      { status: 500 }
    );
  }
}

