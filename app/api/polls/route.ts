import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { polls, pollOptions, pollResponses } from "@/lib/schema";
import { eq, asc, desc, sql } from "drizzle-orm";
import { isAdmin, getUserRoles } from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userFid = searchParams.get("userFid");
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") || "desc";

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

    // Get all polls
    const orderBy = sortBy === "createdAt" 
      ? (sortOrder === "desc" ? desc(polls.createdAt) : asc(polls.createdAt))
      : (sortOrder === "desc" ? desc(polls.updatedAt) : asc(polls.updatedAt));

    const allPolls = await db
      .select()
      .from(polls)
      .orderBy(orderBy);

    // Get options and response counts for each poll
    const pollsWithDetails = await Promise.all(
      allPolls.map(async (poll) => {
        const options = await db
          .select()
          .from(pollOptions)
          .where(eq(pollOptions.pollId, poll.id))
          .orderBy(asc(pollOptions.order));

        const responseCountResult = await db
          .select({ count: sql<number>`count(*)::int`.as("count") })
          .from(pollResponses)
          .where(eq(pollResponses.pollId, poll.id));

        return {
          id: poll.id,
          castHash: poll.castHash,
          question: poll.question,
          createdBy: poll.createdBy,
          createdAt: poll.createdAt,
          updatedAt: poll.updatedAt,
          optionCount: options.length,
          responseCount: responseCountResult[0]?.count || 0,
        };
      })
    );

    return NextResponse.json({ polls: pollsWithDetails });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Polls GET API error:", err.message || error);
    return NextResponse.json(
      { error: err.message || "Failed to fetch polls" },
      { status: 500 }
    );
  }
}

