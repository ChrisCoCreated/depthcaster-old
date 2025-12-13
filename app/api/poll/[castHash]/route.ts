import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { polls, pollOptions, pollResponses } from "@/lib/schema";
import { eq, asc, and } from "drizzle-orm";
import { isAdmin, getUserRoles } from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ castHash: string }> }
) {
  try {
    const { castHash } = await params;
    const searchParams = request.nextUrl.searchParams;
    const userFid = searchParams.get("userFid") ? parseInt(searchParams.get("userFid")!) : undefined;

    if (!castHash) {
      return NextResponse.json(
        { error: "Cast hash is required" },
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
      return NextResponse.json({ poll: null });
    }

    const pollData = poll[0];

    // Get poll options ordered by order field
    const options = await db
      .select()
      .from(pollOptions)
      .where(eq(pollOptions.pollId, pollData.id))
      .orderBy(asc(pollOptions.order));

    // Get user's existing response if userFid is provided
    let userResponse = null;
    if (userFid && !isNaN(userFid)) {
      const response = await db
        .select()
        .from(pollResponses)
        .where(
          and(
            eq(pollResponses.pollId, pollData.id),
            eq(pollResponses.userFid, userFid)
          )
        )
        .limit(1);

      if (response.length > 0) {
        userResponse = response[0].rankings as string[];
      }
    }

    return NextResponse.json({
      poll: {
        id: pollData.id,
        castHash: pollData.castHash,
        question: pollData.question,
        createdBy: pollData.createdBy,
        createdAt: pollData.createdAt,
        updatedAt: pollData.updatedAt,
        options: options.map((opt) => ({
          id: opt.id,
          optionText: opt.optionText,
          order: opt.order,
        })),
      },
      userResponse,
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Poll GET API error:", err.message || error);
    return NextResponse.json(
      { error: err.message || "Failed to fetch poll" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ castHash: string }> }
) {
  try {
    const { castHash } = await params;
    const body = await request.json();
    const { question, options, userFid } = body;

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

    if (!question || typeof question !== "string" || question.trim().length === 0) {
      return NextResponse.json(
        { error: "Question is required" },
        { status: 400 }
      );
    }

    if (!Array.isArray(options) || options.length < 2) {
      return NextResponse.json(
        { error: "At least 2 options are required" },
        { status: 400 }
      );
    }

    // Check if user is admin
    const fid = parseInt(userFid);
    if (isNaN(fid)) {
      return NextResponse.json(
        { error: "Invalid FID" },
        { status: 400 }
      );
    }

    const roles = await getUserRoles(fid);
    if (!isAdmin(roles)) {
      return NextResponse.json(
        { error: "Unauthorized: Admin role required" },
        { status: 403 }
      );
    }

    // Check if poll already exists
    const existingPoll = await db
      .select()
      .from(polls)
      .where(eq(polls.castHash, castHash))
      .limit(1);

    let pollId: string;

    if (existingPoll.length > 0) {
      // Update existing poll
      pollId = existingPoll[0].id;
      await db
        .update(polls)
        .set({
          question: question.trim(),
          updatedAt: new Date(),
        })
        .where(eq(polls.id, pollId));

      // Delete existing options
      await db.delete(pollOptions).where(eq(pollOptions.pollId, pollId));
    } else {
      // Create new poll
      const newPoll = await db
        .insert(polls)
        .values({
          castHash,
          question: question.trim(),
          createdBy: fid,
        })
        .returning();
      pollId = newPoll[0].id;
    }

    // Insert new options
    const optionValues = options.map((opt: string, index: number) => ({
      pollId,
      optionText: opt.trim(),
      order: index + 1,
    }));

    await db.insert(pollOptions).values(optionValues);

    return NextResponse.json({
      success: true,
      pollId,
      message: existingPoll.length > 0 ? "Poll updated successfully" : "Poll created successfully",
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Poll POST API error:", err.message || error);
    return NextResponse.json(
      { error: err.message || "Failed to create/update poll" },
      { status: 500 }
    );
  }
}

