import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { polls, pollOptions, pollResponses } from "@/lib/schema";
import { eq, asc, and, or, sql } from "drizzle-orm";
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

    // Get poll by slug or castHash
    const poll = await db
      .select()
      .from(polls)
      .where(
        or(
          eq(polls.slug, castHash),
          eq(polls.castHash, castHash)
        )
      )
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
        if (pollData.pollType === "ranking") {
          userResponse = response[0].rankings as string[];
        } else if (pollData.pollType === "choice") {
          userResponse = response[0].choices as Record<string, string>;
        } else if (pollData.pollType === "distribution") {
          userResponse = response[0].allocations as Record<string, number>;
        }
      }
    }

    return NextResponse.json({
      poll: {
        id: pollData.id,
        castHash: pollData.castHash,
        slug: pollData.slug,
        question: pollData.question,
        pollType: pollData.pollType || "ranking",
        choices: pollData.choices as string[] | null,
        createdBy: pollData.createdBy,
        createdAt: pollData.createdAt,
        updatedAt: pollData.updatedAt,
        options: options.map((opt) => ({
          id: opt.id,
          optionText: opt.optionText,
          markdown: opt.markdown,
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
    const { question, options, userFid, pollType, choices, slug, forceUpdate } = body;

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

    // Validate options structure - can be strings (backward compat) or objects with text and markdown
    const normalizedOptions = options.map((opt: any, index: number) => {
      if (typeof opt === 'string') {
        return { text: opt.trim(), markdown: null };
      } else if (typeof opt === 'object' && opt !== null) {
        return {
          text: (opt.text || '').trim(),
          markdown: (opt.markdown || '').trim() || null,
        };
      } else {
        throw new Error(`Invalid option format at index ${index}`);
      }
    });

    if (normalizedOptions.some(opt => !opt.text || opt.text.length === 0)) {
      return NextResponse.json(
        { error: "All options must have text" },
        { status: 400 }
      );
    }

    const validPollType = pollType === "choice" ? "choice" : pollType === "distribution" ? "distribution" : "ranking";
    
    // Validate choices for choice type
    if (validPollType === "choice") {
      if (!Array.isArray(choices) || choices.length < 2) {
        return NextResponse.json(
          { error: "At least 2 choices are required for choice-type polls" },
          { status: 400 }
        );
      }
    }
    
    // Distribution type doesn't need choices array

    // Validate and normalize slug
    let normalizedSlug: string | null = null;
    if (slug && typeof slug === "string" && slug.trim().length > 0) {
      normalizedSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
      if (normalizedSlug.length === 0) {
        return NextResponse.json(
          { error: "Invalid slug format" },
          { status: 400 }
        );
      }
      
      // Check if slug is already taken by another poll
      const existingSlugPoll = await db
        .select()
        .from(polls)
        .where(eq(polls.slug, normalizedSlug))
        .limit(1);
      
      if (existingSlugPoll.length > 0 && existingSlugPoll[0].castHash !== castHash) {
        return NextResponse.json(
          { error: "Slug is already taken" },
          { status: 400 }
        );
      }
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
      // Poll exists - check if we're allowed to update
      const pollData = existingPoll[0];
      
      // Check response count
      const responseCountResult = await db
        .select({ count: sql<number>`count(*)::int`.as("count") })
        .from(pollResponses)
        .where(eq(pollResponses.pollId, pollData.id));
      
      const responseCount = responseCountResult[0]?.count || 0;
      
      // If poll has responses, require forceUpdate flag
      if (responseCount > 0 && !forceUpdate) {
        return NextResponse.json(
          {
            error: "Poll already exists with responses",
            existingPoll: {
              id: pollData.id,
              question: pollData.question,
              responseCount,
              createdAt: pollData.createdAt,
              createdBy: pollData.createdBy,
            },
            requiresForceUpdate: true,
          },
          { status: 409 } // Conflict status
        );
      }
      
      // If poll exists but no forceUpdate flag, return error
      if (!forceUpdate) {
        return NextResponse.json(
          {
            error: "Poll already exists",
            existingPoll: {
              id: pollData.id,
              question: pollData.question,
              responseCount,
              createdAt: pollData.createdAt,
              createdBy: pollData.createdBy,
            },
            requiresForceUpdate: responseCount > 0,
          },
          { status: 409 } // Conflict status
        );
      }
      
      // Update existing poll (forceUpdate is true)
      pollId = pollData.id;
      await db
        .update(polls)
        .set({
          question: question.trim(),
          pollType: validPollType,
          choices: validPollType === "choice" ? choices : null,
          slug: normalizedSlug || undefined,
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
          slug: normalizedSlug || undefined,
          question: question.trim(),
          pollType: validPollType,
          choices: validPollType === "choice" ? choices : null,
          createdBy: fid,
        })
        .returning();
      pollId = newPoll[0].id;
    }

    // Insert new options
    const optionValues = normalizedOptions.map((opt: any, index: number) => ({
      pollId,
      optionText: opt.text,
      markdown: opt.markdown || null,
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ castHash: string }> }
) {
  try {
    const { castHash } = await params;
    const body = await request.json();
    const { userFid } = body;

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

    // Check if poll exists
    const existingPoll = await db
      .select()
      .from(polls)
      .where(eq(polls.castHash, castHash))
      .limit(1);

    if (existingPoll.length === 0) {
      return NextResponse.json(
        { error: "Poll not found" },
        { status: 404 }
      );
    }

    // Delete poll (cascading deletes will handle options and responses)
    await db.delete(polls).where(eq(polls.castHash, castHash));

    return NextResponse.json({
      success: true,
      message: "Poll deleted successfully",
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Poll DELETE API error:", err.message || error);
    return NextResponse.json(
      { error: err.message || "Failed to delete poll" },
      { status: 500 }
    );
  }
}

