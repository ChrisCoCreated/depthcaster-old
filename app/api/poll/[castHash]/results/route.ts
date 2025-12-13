import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { polls, pollOptions, pollResponses, users } from "@/lib/schema";
import { eq, asc } from "drizzle-orm";
import { isAdmin, getUserRoles } from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ castHash: string }> }
) {
  try {
    const { castHash } = await params;
    const searchParams = request.nextUrl.searchParams;
    const userFid = searchParams.get("userFid");

    if (!castHash) {
      return NextResponse.json(
        { error: "Cast hash is required" },
        { status: 400 }
      );
    }

    if (!userFid) {
      return NextResponse.json(
        { error: "User FID is required" },
        { status: 400 }
      );
    }

    const fid = parseInt(userFid);
    if (isNaN(fid)) {
      return NextResponse.json(
        { error: "Invalid FID" },
        { status: 400 }
      );
    }

    // Check if user is admin
    const roles = await getUserRoles(fid);
    if (!isAdmin(roles)) {
      return NextResponse.json(
        { error: "Unauthorized: Admin role required" },
        { status: 403 }
      );
    }

    // Get poll
    const poll = await db
      .select()
      .from(polls)
      .where(eq(polls.castHash, castHash))
      .limit(1);

    if (poll.length === 0) {
      return NextResponse.json(
        { error: "Poll not found" },
        { status: 404 }
      );
    }

    const pollData = poll[0];

    // Get poll options
    const options = await db
      .select()
      .from(pollOptions)
      .where(eq(pollOptions.pollId, pollData.id))
      .orderBy(asc(pollOptions.order));

    // Get all responses with user info
    const responses = await db
      .select({
        id: pollResponses.id,
        userFid: pollResponses.userFid,
        rankings: pollResponses.rankings,
        createdAt: pollResponses.createdAt,
        username: users.username,
        displayName: users.displayName,
        pfpUrl: users.pfpUrl,
      })
      .from(pollResponses)
      .innerJoin(users, eq(pollResponses.userFid, users.fid))
      .where(eq(pollResponses.pollId, pollData.id));

    // Calculate collated results
    // For each option, calculate average rank and total votes
    const optionStats = options.map((option) => {
      let totalRank = 0;
      let voteCount = 0;
      const rankings: number[] = [];

      responses.forEach((response) => {
        const rankingsArray = response.rankings as string[];
        const rank = rankingsArray.indexOf(option.id);
        if (rank !== -1) {
          // Rank is 0-indexed, so add 1 for display
          const displayRank = rank + 1;
          totalRank += displayRank;
          voteCount++;
          rankings.push(displayRank);
        }
      });

      const averageRank = voteCount > 0 ? totalRank / voteCount : 0;

      return {
        optionId: option.id,
        optionText: option.optionText,
        averageRank,
        voteCount,
        totalRank,
        rankings, // Individual ranks for this option
      };
    });

    // Sort by average rank (lower is better)
    optionStats.sort((a, b) => {
      if (a.voteCount === 0 && b.voteCount === 0) return 0;
      if (a.voteCount === 0) return 1;
      if (b.voteCount === 0) return -1;
      return a.averageRank - b.averageRank;
    });

    // Format individual responses
    const individualResponses = responses.map((response) => {
      const rankingsArray = response.rankings as string[];
      const rankedOptions = rankingsArray.map((optionId, index) => {
        const option = options.find((opt) => opt.id === optionId);
        return {
          rank: index + 1,
          optionId,
          optionText: option?.optionText || "Unknown",
        };
      });

      return {
        id: response.id,
        userFid: response.userFid,
        username: response.username,
        displayName: response.displayName,
        pfpUrl: response.pfpUrl,
        rankings: rankedOptions,
        createdAt: response.createdAt,
      };
    });

    return NextResponse.json({
      poll: {
        id: pollData.id,
        castHash: pollData.castHash,
        question: pollData.question,
      },
      options: options.map((opt) => ({
        id: opt.id,
        optionText: opt.optionText,
        order: opt.order,
      })),
      collatedResults: optionStats,
      individualResponses,
      totalResponses: responses.length,
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Poll results API error:", err.message || error);
    return NextResponse.json(
      { error: err.message || "Failed to fetch poll results" },
      { status: 500 }
    );
  }
}

