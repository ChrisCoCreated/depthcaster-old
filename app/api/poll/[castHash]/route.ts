import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { polls, pollOptions, pollResponses } from "@/lib/schema";
import { eq, asc, and, or, sql, inArray } from "drizzle-orm";
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
        closedAt: pollData.closedAt,
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

    // Validate options structure - can be strings (backward compat) or objects with text, markdown, and optional id
    const normalizedOptions = options.map((opt: any, index: number) => {
      if (typeof opt === 'string') {
        return { id: undefined, text: opt.trim(), markdown: null };
      } else if (typeof opt === 'object' && opt !== null) {
        return {
          id: opt.id && typeof opt.id === 'string' ? opt.id : undefined,
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

      // Load existing options for smart matching
      const existingOptions = await db
        .select()
        .from(pollOptions)
        .where(eq(pollOptions.pollId, pollId))
        .orderBy(asc(pollOptions.order));

      // Create maps for matching
      const existingOptionsById = new Map(existingOptions.map(opt => [opt.id, opt]));
      const existingOptionsByText = new Map(existingOptions.map(opt => [opt.optionText.toLowerCase(), opt]));
      const matchedOptionIds = new Set<string>();
      const optionsToInsert: Array<{ pollId: string; optionText: string; markdown: string | null; order: number }> = [];
      const optionsToUpdate: Array<{ id: string; optionText: string; markdown: string | null; order: number }> = [];

      // Match incoming options to existing ones
      normalizedOptions.forEach((incomingOpt, index) => {
        const order = index + 1;
        let matchedOption = null;

        // First try to match by ID if provided
        if (incomingOpt.id && existingOptionsById.has(incomingOpt.id)) {
          matchedOption = existingOptionsById.get(incomingOpt.id)!;
          matchedOptionIds.add(matchedOption.id);
        }
        // Otherwise try to match by text (case-insensitive)
        else if (!matchedOption && existingOptionsByText.has(incomingOpt.text.toLowerCase())) {
          const candidate = existingOptionsByText.get(incomingOpt.text.toLowerCase())!;
          // Only match if not already matched
          if (!matchedOptionIds.has(candidate.id)) {
            matchedOption = candidate;
            matchedOptionIds.add(candidate.id);
          }
        }

        if (matchedOption) {
          // Update existing option if text, markdown, or order changed
          if (
            matchedOption.optionText !== incomingOpt.text ||
            matchedOption.markdown !== incomingOpt.markdown ||
            matchedOption.order !== order
          ) {
            optionsToUpdate.push({
              id: matchedOption.id,
              optionText: incomingOpt.text,
              markdown: incomingOpt.markdown,
              order,
            });
          }
        } else {
          // New option - insert it
          optionsToInsert.push({
            pollId,
            optionText: incomingOpt.text,
            markdown: incomingOpt.markdown,
            order,
          });
        }
      });

      // Update matched options
      for (const opt of optionsToUpdate) {
        await db
          .update(pollOptions)
          .set({
            optionText: opt.optionText,
            markdown: opt.markdown,
            order: opt.order,
          })
          .where(eq(pollOptions.id, opt.id));
      }

      // Insert new options
      if (optionsToInsert.length > 0) {
        await db.insert(pollOptions).values(optionsToInsert);
      }

      // Handle deleted options - check if they're referenced in responses
      const deletedOptions = existingOptions.filter(opt => !matchedOptionIds.has(opt.id));
      if (deletedOptions.length > 0) {
        // Check which deleted options are referenced in responses
        const deletedOptionIds = deletedOptions.map(opt => opt.id);
        
        // Check for references in rankings (array of option IDs)
        const responsesWithRankings = await db
          .select({ rankings: pollResponses.rankings })
          .from(pollResponses)
          .where(eq(pollResponses.pollId, pollId));

        // Check for references in choices (object with option IDs as keys)
        const responsesWithChoices = await db
          .select({ choices: pollResponses.choices })
          .from(pollResponses)
          .where(eq(pollResponses.pollId, pollId));

        // Check for references in allocations (object with option IDs as keys)
        const responsesWithAllocations = await db
          .select({ allocations: pollResponses.allocations })
          .from(pollResponses)
          .where(eq(pollResponses.pollId, pollId));

        const referencedOptionIds = new Set<string>();

        // Check rankings
        responsesWithRankings.forEach(response => {
          let rankingsArray: string[] | null = null;
          if (response.rankings) {
            if (typeof response.rankings === 'string') {
              try {
                rankingsArray = JSON.parse(response.rankings);
              } catch (e) {
                // Skip if parsing fails
              }
            } else if (Array.isArray(response.rankings)) {
              rankingsArray = response.rankings;
            }
          }
          if (rankingsArray) {
            rankingsArray.forEach((optionId: string) => {
              if (deletedOptionIds.includes(optionId)) {
                referencedOptionIds.add(optionId);
              }
            });
          }
        });

        // Check choices
        responsesWithChoices.forEach(response => {
          let choicesObj: Record<string, string> | null = null;
          if (response.choices) {
            if (typeof response.choices === 'string') {
              try {
                choicesObj = JSON.parse(response.choices);
              } catch (e) {
                // Skip if parsing fails
              }
            } else if (typeof response.choices === 'object' && !Array.isArray(response.choices)) {
              choicesObj = response.choices as Record<string, string>;
            }
          }
          if (choicesObj) {
            Object.keys(choicesObj).forEach(optionId => {
              if (deletedOptionIds.includes(optionId)) {
                referencedOptionIds.add(optionId);
              }
            });
          }
        });

        // Check allocations
        responsesWithAllocations.forEach(response => {
          let allocationsObj: Record<string, number> | null = null;
          if (response.allocations) {
            if (typeof response.allocations === 'string') {
              try {
                allocationsObj = JSON.parse(response.allocations);
              } catch (e) {
                // Skip if parsing fails
              }
            } else if (typeof response.allocations === 'object' && !Array.isArray(response.allocations)) {
              allocationsObj = response.allocations as Record<string, number>;
            }
          }
          if (allocationsObj) {
            Object.keys(allocationsObj).forEach(optionId => {
              if (deletedOptionIds.includes(optionId)) {
                referencedOptionIds.add(optionId);
              }
            });
          }
        });

        // Only delete options that aren't referenced
        const safeToDelete = deletedOptions.filter(opt => !referencedOptionIds.has(opt.id));
        if (safeToDelete.length > 0) {
          const safeToDeleteIds = safeToDelete.map(opt => opt.id);
          await db.delete(pollOptions).where(
            inArray(pollOptions.id, safeToDeleteIds)
          );
        }
      }
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

      // Insert new options
      const optionValues = normalizedOptions.map((opt: any, index: number) => ({
        pollId,
        optionText: opt.text,
        markdown: opt.markdown || null,
        order: index + 1,
      }));

      await db.insert(pollOptions).values(optionValues);
    }

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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ castHash: string }> }
) {
  try {
    const { castHash } = await params;
    const body = await request.json();
    const { userFid, closed } = body;

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

    if (typeof closed !== "boolean") {
      return NextResponse.json(
        { error: "Closed status (boolean) is required" },
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
      .where(
        or(
          eq(polls.slug, castHash),
          eq(polls.castHash, castHash)
        )
      )
      .limit(1);

    if (existingPoll.length === 0) {
      return NextResponse.json(
        { error: "Poll not found" },
        { status: 404 }
      );
    }

    // Update poll closed status
    await db
      .update(polls)
      .set({
        closedAt: closed ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(polls.id, existingPoll[0].id));

    return NextResponse.json({
      success: true,
      message: closed ? "Poll closed successfully" : "Poll opened successfully",
      closedAt: closed ? new Date() : null,
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Poll PATCH API error:", err.message || error);
    return NextResponse.json(
      { error: err.message || "Failed to update poll status" },
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

