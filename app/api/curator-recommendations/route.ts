import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { curatorRecommendations, users } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { hasCuratorOrAdminRole, getUserRoles } from "@/lib/roles";
import { upsertUser } from "@/lib/users";

// POST - Add a curator recommendation
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { recommendedUserFid, recommenderFid } = body;

    if (!recommendedUserFid || !recommenderFid) {
      return NextResponse.json(
        { error: "recommendedUserFid and recommenderFid are required" },
        { status: 400 }
      );
    }

    const recommendedUserFidNum = parseInt(String(recommendedUserFid));
    const recommenderFidNum = parseInt(String(recommenderFid));

    if (isNaN(recommendedUserFidNum) || isNaN(recommenderFidNum)) {
      return NextResponse.json(
        { error: "Invalid fid" },
        { status: 400 }
      );
    }

    // Prevent self-recommendation
    if (recommendedUserFidNum === recommenderFidNum) {
      return NextResponse.json(
        { error: "Cannot recommend yourself" },
        { status: 400 }
      );
    }

    // Check if recommender has curator role
    const recommenderRoles = await getUserRoles(recommenderFidNum);
    if (!hasCuratorOrAdminRole(recommenderRoles)) {
      return NextResponse.json(
        { error: "Only curators can recommend users" },
        { status: 403 }
      );
    }

    // Check if recommended user already has curator role
    const recommendedUserRoles = await getUserRoles(recommendedUserFidNum);
    if (hasCuratorOrAdminRole(recommendedUserRoles)) {
      return NextResponse.json(
        { error: "User already has curator role" },
        { status: 400 }
      );
    }

    // Ensure both users exist in database
    const recommendedUser = await db.select().from(users).where(eq(users.fid, recommendedUserFidNum)).limit(1);
    if (recommendedUser.length === 0) {
      // Try to fetch user from Neynar and create in DB
      try {
        const { neynarClient } = await import("@/lib/neynar");
        const neynarResponse = await neynarClient.fetchBulkUsers({ fids: [recommendedUserFidNum] });
        const neynarUser = neynarResponse.users?.[0];
        if (neynarUser) {
          await upsertUser(recommendedUserFidNum, {
            username: neynarUser.username,
            displayName: neynarUser.display_name,
            pfpUrl: neynarUser.pfp_url,
          });
        } else {
          return NextResponse.json(
            { error: "Recommended user not found" },
            { status: 404 }
          );
        }
      } catch (error) {
        return NextResponse.json(
          { error: "Recommended user not found and could not be fetched" },
          { status: 404 }
        );
      }
    }

    const recommenderUser = await db.select().from(users).where(eq(users.fid, recommenderFidNum)).limit(1);
    if (recommenderUser.length === 0) {
      return NextResponse.json(
        { error: "Recommender user not found" },
        { status: 404 }
      );
    }

    // Check if recommendation already exists
    const existingRecommendation = await db
      .select()
      .from(curatorRecommendations)
      .where(
        and(
          eq(curatorRecommendations.recommendedUserFid, recommendedUserFidNum),
          eq(curatorRecommendations.recommenderFid, recommenderFidNum)
        )
      )
      .limit(1);

    if (existingRecommendation.length > 0) {
      return NextResponse.json(
        { error: "Recommendation already exists" },
        { status: 400 }
      );
    }

    // Add the recommendation
    await db.insert(curatorRecommendations).values({
      recommendedUserFid: recommendedUserFidNum,
      recommenderFid: recommenderFidNum,
    });

    return NextResponse.json({
      success: true,
      message: `User ${recommendedUserFidNum} recommended by curator ${recommenderFidNum}`,
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Curator recommendations POST API error:", err.message || err);
    
    // Handle unique constraint violation
    if (err.message?.includes("curator_recommendations_recommended_recommender_unique")) {
      return NextResponse.json(
        { error: "Recommendation already exists" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: err.message || "Failed to add recommendation" },
      { status: 500 }
    );
  }
}

// GET - Get recommendations for a specific user
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userFid = searchParams.get("userFid");

    if (!userFid) {
      return NextResponse.json(
        { error: "userFid is required" },
        { status: 400 }
      );
    }

    const userFidNum = parseInt(userFid);
    if (isNaN(userFidNum)) {
      return NextResponse.json(
        { error: "Invalid userFid" },
        { status: 400 }
      );
    }

    // Get all recommendations for this user
    const recommendations = await db
      .select({
        id: curatorRecommendations.id,
        recommender_fid: curatorRecommendations.recommenderFid,
        created_at: curatorRecommendations.createdAt,
      })
      .from(curatorRecommendations)
      .where(eq(curatorRecommendations.recommendedUserFid, userFidNum))
      .orderBy(curatorRecommendations.createdAt);

    return NextResponse.json({
      recommendations: recommendations.map((rec) => ({
        id: rec.id,
        recommender_fid: rec.recommender_fid,
        created_at: rec.created_at.toISOString(),
      })),
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Curator recommendations GET API error:", err.message || err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch recommendations" },
      { status: 500 }
    );
  }
}
