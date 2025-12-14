import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { polls, pollOptions, pollResponses, users } from "@/lib/schema";
import { eq, asc, or } from "drizzle-orm";
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
        choices: pollResponses.choices,
        createdAt: pollResponses.createdAt,
        username: users.username,
        displayName: users.displayName,
        pfpUrl: users.pfpUrl,
      })
      .from(pollResponses)
      .innerJoin(users, eq(pollResponses.userFid, users.fid))
      .where(eq(pollResponses.pollId, pollData.id));

    const pollType = pollData.pollType || "ranking";
    const pollChoices = pollData.choices as string[] | null;

    let collatedResults: any[] = [];
    let individualResponses: any[] = [];

    if (pollType === "ranking") {
      // Calculate collated results for ranking type
      // For each option, calculate average rank and total votes
      collatedResults = options.map((option) => {
        let totalRank = 0;
        let voteCount = 0;
        const rankings: number[] = [];

        responses.forEach((response) => {
          // Handle JSONB - it might be a string that needs parsing
          let rankingsArray: string[] | null = null;
          if (response.rankings) {
            if (typeof response.rankings === 'string') {
              try {
                rankingsArray = JSON.parse(response.rankings);
              } catch (e) {
                console.error("Failed to parse rankings JSON:", e);
              }
            } else if (Array.isArray(response.rankings)) {
              rankingsArray = response.rankings;
            }
          }
          
          if (rankingsArray && Array.isArray(rankingsArray)) {
            const rank = rankingsArray.indexOf(option.id);
            if (rank !== -1) {
              // Rank is 0-indexed, so add 1 for display
              const displayRank = rank + 1;
              totalRank += displayRank;
              voteCount++;
              rankings.push(displayRank);
            }
          }
        });

        const averageRank = voteCount > 0 ? totalRank / voteCount : 0;

        return {
          optionId: option.id,
          optionText: option.optionText,
          markdown: option.markdown,
          averageRank,
          voteCount,
          totalRank,
          rankings, // Individual ranks for this option
        };
      });

      // Sort by average rank (lower is better)
      collatedResults.sort((a, b) => {
        if (a.voteCount === 0 && b.voteCount === 0) return 0;
        if (a.voteCount === 0) return 1;
        if (b.voteCount === 0) return -1;
        return a.averageRank - b.averageRank;
      });

      // Format individual responses for ranking type
      individualResponses = responses.map((response) => {
        // Handle JSONB - it might be a string that needs parsing
        let rankingsArray: string[] | null = null;
        if (response.rankings) {
          if (typeof response.rankings === 'string') {
            try {
              rankingsArray = JSON.parse(response.rankings);
            } catch (e) {
              console.error("Failed to parse rankings JSON:", e);
            }
          } else if (Array.isArray(response.rankings)) {
            rankingsArray = response.rankings;
          }
        }
        
        const rankedOptions = rankingsArray?.map((optionId, index) => {
          const option = options.find((opt) => opt.id === optionId);
          return {
            rank: index + 1,
            optionId,
            optionText: option?.optionText || "Unknown",
          };
        }) || [];

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
    } else if (pollType === "choice") {
      // Calculate collated results for choice type
      // For each option, count choices
      collatedResults = options.map((option) => {
        const choiceCounts: Record<string, number> = {};
        let totalVotes = 0;

        responses.forEach((response) => {
          // Drizzle should automatically parse JSONB, but handle both cases
          let choicesObj: Record<string, string> | null = null;
          if (response.choices) {
            if (typeof response.choices === 'string') {
              try {
                choicesObj = JSON.parse(response.choices);
              } catch (e) {
                console.error("Failed to parse choices JSON:", e, response.choices);
                return; // Skip this response if parsing fails
              }
            } else if (typeof response.choices === 'object' && response.choices !== null && !Array.isArray(response.choices)) {
              choicesObj = response.choices as Record<string, string>;
            }
          }
          
          if (choicesObj && typeof choicesObj === 'object' && !Array.isArray(choicesObj) && choicesObj !== null) {
            const choice = choicesObj[option.id];
            if (choice && typeof choice === 'string' && choice.trim() !== '') {
              choiceCounts[choice] = (choiceCounts[choice] || 0) + 1;
              totalVotes++;
            }
          }
        });

        return {
          optionId: option.id,
          optionText: option.optionText,
          markdown: option.markdown,
          choiceCounts,
          totalVotes,
        };
      });

      // Format individual responses for choice type
      individualResponses = responses.map((response) => {
        // Handle JSONB - Drizzle should parse it automatically, but handle both cases
        let choicesObj: Record<string, string> | null = null;
        if (response.choices) {
          if (typeof response.choices === 'string') {
            try {
              choicesObj = JSON.parse(response.choices);
            } catch (e) {
              console.error("Failed to parse choices JSON:", e, response.choices);
              choicesObj = null;
            }
          } else if (typeof response.choices === 'object' && response.choices !== null && !Array.isArray(response.choices)) {
            choicesObj = response.choices as Record<string, string>;
          }
        }
        
        const optionChoices = options.map((option) => {
          let choice = "";
          if (choicesObj && typeof choicesObj === 'object' && !Array.isArray(choicesObj) && choicesObj !== null) {
            const choiceValue = choicesObj[option.id];
            if (choiceValue && typeof choiceValue === 'string' && choiceValue.trim() !== '') {
              choice = choiceValue;
            }
          }
          return {
            optionId: option.id,
            optionText: option.optionText,
            choice,
          };
        });

        return {
          id: response.id,
          userFid: response.userFid,
          username: response.username,
          displayName: response.displayName,
          pfpUrl: response.pfpUrl,
          choices: optionChoices,
          createdAt: response.createdAt,
        };
      });
    }
    
    // Debug logging
    if (responses.length > 0 && pollType === "choice") {
      const sampleResponse = responses[0];
      let sampleChoicesObj: any = null;
      if (sampleResponse.choices) {
        if (typeof sampleResponse.choices === 'string') {
          try {
            sampleChoicesObj = JSON.parse(sampleResponse.choices);
          } catch (e) {
            sampleChoicesObj = sampleResponse.choices;
          }
        } else {
          sampleChoicesObj = sampleResponse.choices;
        }
      }
      
      const optionIds = options.map(opt => opt.id);
      const choicesKeys = sampleChoicesObj && typeof sampleChoicesObj === 'object' && !Array.isArray(sampleChoicesObj) ? Object.keys(sampleChoicesObj) : [];
      
      console.log("Poll results calculation (choice type):", {
        pollType,
        optionsCount: options.length,
        optionIds,
        choicesKeys,
        optionIdsMatch: optionIds.every(id => choicesKeys.includes(id)),
        responsesCount: responses.length,
        collatedResultsCount: collatedResults.length,
        sampleCollatedResult: collatedResults[0] ? {
          optionId: collatedResults[0].optionId,
          optionText: collatedResults[0].optionText,
          choiceCounts: collatedResults[0].choiceCounts,
          totalVotes: collatedResults[0].totalVotes,
        } : null,
      });
    }

    return NextResponse.json({
      poll: {
        id: pollData.id,
        castHash: pollData.castHash,
        question: pollData.question,
        pollType: pollData.pollType || "ranking",
        choices: pollData.choices,
      },
      options: options.map((opt) => ({
        id: opt.id,
        optionText: opt.optionText,
        order: opt.order,
      })),
      collatedResults,
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

