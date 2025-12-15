import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { polls, pollOptions, pollResponses } from "@/lib/schema";
import { eq, and, or } from "drizzle-orm";
import { hasCuratorOrAdminRole, getUserRoles } from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ castHash: string }> }
) {
  try {
    const { castHash } = await params;
    const body = await request.json();
    const { rankings, choices, allocations, userFid } = body;

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

    // Check if user has curator role
    const roles = await getUserRoles(fid);
    if (!hasCuratorOrAdminRole(roles)) {
      return NextResponse.json(
        { error: "Unauthorized: Curator role required to participate in polls" },
        { status: 403 }
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
      return NextResponse.json(
        { error: "Poll not found" },
        { status: 404 }
      );
    }

    const pollData = poll[0];
    const pollType = pollData.pollType || "ranking";

    // Get all poll options
    const options = await db
      .select()
      .from(pollOptions)
      .where(eq(pollOptions.pollId, pollData.id));

    const optionIds = options.map((opt) => opt.id);
    const pollChoices = pollData.choices as string[] | null;

    if (pollType === "ranking") {
      // Validate rankings - must include all option IDs exactly once
      if (!Array.isArray(rankings) || rankings.length === 0) {
        return NextResponse.json(
          { error: "Rankings array is required for ranking-type polls" },
          { status: 400 }
        );
      }

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
    } else if (pollType === "choice") {
      // Validate choices - must have a choice for each option
      if (!choices || typeof choices !== "object") {
        return NextResponse.json(
          { error: "Choices object is required for choice-type polls" },
          { status: 400 }
        );
      }

      if (!pollChoices || !Array.isArray(pollChoices)) {
        return NextResponse.json(
          { error: "Poll choices configuration is invalid" },
          { status: 400 }
        );
      }

      // Check that all options have a choice
      for (const optionId of optionIds) {
        if (!(optionId in choices)) {
          return NextResponse.json(
            { error: `Missing choice for option ${optionId}` },
            { status: 400 }
          );
        }

        const choice = choices[optionId];
        if (!pollChoices.includes(choice)) {
          return NextResponse.json(
            { error: `Invalid choice "${choice}" for option ${optionId}. Must be one of: ${pollChoices.join(", ")}` },
            { status: 400 }
          );
        }
      }
    } else if (pollType === "distribution") {
      // Validate allocations - must have allocations for all options, sum must equal 7
      if (!allocations || typeof allocations !== "object") {
        return NextResponse.json(
          { error: "Allocations object is required for distribution-type polls" },
          { status: 400 }
        );
      }

      // Check that all options have allocations
      for (const optionId of optionIds) {
        if (!(optionId in allocations)) {
          return NextResponse.json(
            { error: `Missing allocation for option ${optionId}` },
            { status: 400 }
          );
        }

        const allocation = allocations[optionId];
        if (typeof allocation !== "number" || allocation < 0 || !Number.isInteger(allocation)) {
          return NextResponse.json(
            { error: `Invalid allocation for option ${optionId}. Must be a non-negative integer` },
            { status: 400 }
          );
        }
      }

      // Validate that sum equals exactly 7
      const total = Object.values(allocations as Record<string, number>).reduce((sum, val) => sum + val, 0);
      if (total !== 7) {
        return NextResponse.json(
          { error: `Total allocations must equal exactly 7, but got ${total}` },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { error: "Invalid poll type" },
        { status: 400 }
      );
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
          rankings: pollType === "ranking" ? rankings : null,
          choices: pollType === "choice" ? choices : null,
          allocations: pollType === "distribution" ? allocations : null,
          updatedAt: new Date(),
        })
        .where(eq(pollResponses.id, existingResponse[0].id));
    } else {
      // Create new response
      await db.insert(pollResponses).values({
        pollId: pollData.id,
        userFid: fid,
        rankings: pollType === "ranking" ? rankings : null,
        choices: pollType === "choice" ? choices : null,
        allocations: pollType === "distribution" ? allocations : null,
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

