import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { polls, pollOptions, pollResponses } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ castHash: string }> }
) {
  try {
    const { castHash } = await params;
    const body = await request.json();
    const { rankings, userFid } = body;

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

    if (!Array.isArray(rankings) || rankings.length === 0) {
      return NextResponse.json(
        { error: "Rankings array is required" },
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

    // Get all poll options
    const options = await db
      .select()
      .from(pollOptions)
      .where(eq(pollOptions.pollId, pollData.id));

    // Validate rankings - must include all option IDs exactly once
    const optionIds = options.map((opt) => opt.id);
    if (rankings.length !== optionIds.length) {
      return NextResponse.json(
        { error: "Rankings must include all options" },
        { status: 400 }
      );
    }

    const rankingsSet = new Set(rankings);
    if (rankingsSet.size !== rankings.length) {
      return NextResponse.json(
        { error: "Rankings must not contain duplicates" },
        { status: 400 }
      );
    }

    for (const rankingId of rankings) {
      if (!optionIds.includes(rankingId)) {
        return NextResponse.json(
          { error: "Invalid option ID in rankings" },
          { status: 400 }
        );
      }
    }

    // Check if response already exists
    const existingResponse = await db
      .select()
      .from(pollResponses)
      .where(
        and(
          eq(pollResponses.pollId, pollData.id),
          eq(pollResponses.userFid, fid)
        )
      )
      .limit(1);

    if (existingResponse.length > 0) {
      // Update existing response
      await db
        .update(pollResponses)
        .set({
          rankings: rankings,
          updatedAt: new Date(),
        })
        .where(eq(pollResponses.id, existingResponse[0].id));
    } else {
      // Create new response
      await db.insert(pollResponses).values({
        pollId: pollData.id,
        userFid: fid,
        rankings: rankings,
      });
    }

    return NextResponse.json({
      success: true,
      message: "Poll response submitted successfully",
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Poll submit API error:", err.message || error);
    return NextResponse.json(
      { error: err.message || "Failed to submit poll response" },
      { status: 500 }
    );
  }
}

