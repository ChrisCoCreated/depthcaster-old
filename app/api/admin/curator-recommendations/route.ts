import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { curatorRecommendations, users } from "@/lib/schema";
import { inArray } from "drizzle-orm";
import { isAdmin, getUserRoles } from "@/lib/roles";

// GET - Get all curator recommendations grouped by recommended user (admin only)
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const adminFid = searchParams.get("adminFid");

    if (!adminFid) {
      return NextResponse.json(
        { error: "adminFid is required" },
        { status: 400 }
      );
    }

    const adminFidNum = parseInt(adminFid);
    if (isNaN(adminFidNum)) {
      return NextResponse.json(
        { error: "Invalid adminFid" },
        { status: 400 }
      );
    }

    // Check if user has admin/superadmin role
    const adminRoles = await getUserRoles(adminFidNum);
    if (!isAdmin(adminRoles)) {
      return NextResponse.json(
        { error: "User does not have admin or superadmin role" },
        { status: 403 }
      );
    }

    // Get all recommendations
    const allRecommendations = await db
      .select({
        id: curatorRecommendations.id,
        recommended_user_fid: curatorRecommendations.recommendedUserFid,
        recommender_fid: curatorRecommendations.recommenderFid,
        created_at: curatorRecommendations.createdAt,
      })
      .from(curatorRecommendations)
      .orderBy(curatorRecommendations.createdAt);

    // Group by recommended user
    const recommendationsByUser = new Map<
      number,
      {
        userFid: number;
        username: string | null;
        displayName: string | null;
        pfpUrl: string | null;
        recommenders: Array<{
          recommender_fid: number;
          recommender_username: string | null;
          recommender_display_name: string | null;
          recommender_pfp_url: string | null;
          created_at: string;
        }>;
      }
    >();

    // Get all unique user FIDs
    const recommendedUserFids = Array.from(
      new Set(allRecommendations.map((r) => r.recommended_user_fid))
    );
    const recommenderFids = Array.from(
      new Set(allRecommendations.map((r) => r.recommender_fid))
    );
    const allUserFids = Array.from(
      new Set([...recommendedUserFids, ...recommenderFids])
    );

    // Fetch user data for all FIDs
    let allUsersMap = new Map();
    if (allUserFids.length > 0) {
      const allUsers = await db
        .select({
          fid: users.fid,
          username: users.username,
          displayName: users.displayName,
          pfpUrl: users.pfpUrl,
        })
        .from(users)
        .where(inArray(users.fid, allUserFids));
      
      allUsersMap = new Map(
        allUsers.map((u) => [
          u.fid,
          { username: u.username, displayName: u.displayName, pfpUrl: u.pfpUrl },
        ])
      );
    }

    // Group recommendations
    for (const rec of allRecommendations) {
      if (!recommendationsByUser.has(rec.recommended_user_fid)) {
        const user = allUsersMap.get(rec.recommended_user_fid);
        recommendationsByUser.set(rec.recommended_user_fid, {
          userFid: rec.recommended_user_fid,
          username: user?.username || null,
          displayName: user?.displayName || null,
          pfpUrl: user?.pfpUrl || null,
          recommenders: [],
        });
      }

      const recommender = allUsersMap.get(rec.recommender_fid);
      recommendationsByUser.get(rec.recommended_user_fid)!.recommenders.push({
        recommender_fid: rec.recommender_fid,
        recommender_username: recommender?.username || null,
        recommender_display_name: recommender?.displayName || null,
        recommender_pfp_url: recommender?.pfpUrl || null,
        created_at: rec.created_at.toISOString(),
      });
    }

    // Convert to array and sort by number of recommenders (descending)
    const recommendationsList = Array.from(recommendationsByUser.values()).sort(
      (a, b) => b.recommenders.length - a.recommenders.length
    );

    return NextResponse.json({ recommendations: recommendationsList });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Admin curator recommendations API error:", err.message || err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch recommendations" },
      { status: 500 }
    );
  }
}
