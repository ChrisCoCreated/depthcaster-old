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
        allocations: pollResponses.allocations,
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
        const voters: Array<{ userFid: number; username: string | null; displayName: string | null; pfpUrl: string | null }> = [];

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
              // Add voter info
              voters.push({
                userFid: response.userFid,
                username: response.username,
                displayName: response.displayName,
                pfpUrl: response.pfpUrl,
              });
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
          voters, // Users who voted for this option
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
      // Collect all option IDs from responses (including deleted options)
      const allOptionIds = new Set<string>();
      responses.forEach((response) => {
        let choicesObj: Record<string, string> | null = null;
        if (response.choices) {
          if (typeof response.choices === 'string') {
            try {
              choicesObj = JSON.parse(response.choices);
            } catch (e) {
              // Skip if parsing fails
            }
          } else if (typeof response.choices === 'object' && response.choices !== null && !Array.isArray(response.choices)) {
            choicesObj = response.choices as Record<string, string>;
          }
        }
        if (choicesObj && typeof choicesObj === 'object' && !Array.isArray(choicesObj) && choicesObj !== null) {
          Object.keys(choicesObj).forEach(optionId => allOptionIds.add(optionId));
        }
      });

      // Create a map of existing options
      const existingOptionsMap = new Map(options.map(opt => [opt.id, opt]));

      // Calculate collated results for all options (existing + deleted)
      collatedResults = Array.from(allOptionIds).map((optionId) => {
        const option = existingOptionsMap.get(optionId);
        const choiceCounts: Record<string, number> = {};
        const choiceVoters: Record<string, Array<{ userFid: number; username: string | null; displayName: string | null; pfpUrl: string | null }>> = {};
        let totalVotes = 0;
        const voters: Array<{ userFid: number; username: string | null; displayName: string | null; pfpUrl: string | null }> = [];
        const positiveVoters: Array<{ userFid: number; username: string | null; displayName: string | null; pfpUrl: string | null }> = [];
        const negativeVoters: Array<{ userFid: number; username: string | null; displayName: string | null; pfpUrl: string | null }> = [];

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
            const choice = choicesObj[optionId];
            if (choice && typeof choice === 'string' && choice.trim() !== '') {
              const normalizedChoice = choice.toLowerCase();
              choiceCounts[choice] = (choiceCounts[choice] || 0) + 1;
              totalVotes++;
              
              // Track voters per choice
              if (!choiceVoters[choice]) {
                choiceVoters[choice] = [];
              }
              if (!choiceVoters[choice].find(v => v.userFid === response.userFid)) {
                choiceVoters[choice].push({
                  userFid: response.userFid,
                  username: response.username,
                  displayName: response.displayName,
                  pfpUrl: response.pfpUrl,
                });
              }
              
              // Add voter info (only once per voter for option-level)
              if (!voters.find(v => v.userFid === response.userFid)) {
                voters.push({
                  userFid: response.userFid,
                  username: response.username,
                  displayName: response.displayName,
                  pfpUrl: response.pfpUrl,
                });
              }
              
              // Track sentiment voters
              const positiveChoices = ['love', 'like'];
              const negativeChoices = ['meh', 'hate'];
              if (positiveChoices.includes(normalizedChoice)) {
                if (!positiveVoters.find(v => v.userFid === response.userFid)) {
                  positiveVoters.push({
                    userFid: response.userFid,
                    username: response.username,
                    displayName: response.displayName,
                    pfpUrl: response.pfpUrl,
                  });
                }
              } else if (negativeChoices.includes(normalizedChoice)) {
                if (!negativeVoters.find(v => v.userFid === response.userFid)) {
                  negativeVoters.push({
                    userFid: response.userFid,
                    username: response.username,
                    displayName: response.displayName,
                    pfpUrl: response.pfpUrl,
                  });
                }
              }
            }
          }
        });

        // Calculate positive vs negative proportions
        const positiveChoices = ['love', 'like'];
        const negativeChoices = ['meh', 'hate'];
        let positiveVotes = 0;
        let negativeVotes = 0;
        
        Object.entries(choiceCounts).forEach(([choice, count]) => {
          const normalizedChoice = choice.toLowerCase();
          if (positiveChoices.includes(normalizedChoice)) {
            positiveVotes += count;
          } else if (negativeChoices.includes(normalizedChoice)) {
            negativeVotes += count;
          }
        });
        
        const totalSentimentVotes = positiveVotes + negativeVotes;
        const positivePercentage = totalSentimentVotes > 0 ? (positiveVotes / totalSentimentVotes) * 100 : 0;
        const negativePercentage = totalSentimentVotes > 0 ? (negativeVotes / totalSentimentVotes) * 100 : 0;

        return {
          optionId: optionId,
          optionText: option?.optionText || "[Deleted Option]",
          markdown: option?.markdown || null,
          choiceCounts,
          choiceVoters, // Voters per choice (love, like, meh, hate)
          totalVotes,
          isDeleted: !option,
          positiveVotes,
          negativeVotes,
          positivePercentage,
          negativePercentage,
          positiveVoters, // Voters who chose positive sentiment
          negativeVoters, // Voters who chose negative sentiment
          voters, // Users who voted for this option (all choices)
        };
      });

      // Format individual responses for choice type
      // Use the existingOptionsMap already created above
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
        
        // Include all choices from the response, even for deleted options
        const optionChoices: Array<{ optionId: string; optionText: string; choice: string; isDeleted?: boolean }> = [];
        
        if (choicesObj && typeof choicesObj === 'object' && !Array.isArray(choicesObj) && choicesObj !== null) {
          // Process all choices in the response (including deleted options)
          Object.entries(choicesObj).forEach(([optionId, choice]) => {
            if (choice && typeof choice === 'string' && choice.trim() !== '') {
              const option = existingOptionsMap.get(optionId);
              optionChoices.push({
                optionId,
                optionText: option?.optionText || "[Deleted Option]",
                choice,
                isDeleted: !option,
              });
            }
          });
        }

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
    } else if (pollType === "distribution") {
      // Calculate collated results for distribution type
      // Sum allocations per option across all responses
      collatedResults = options.map((option) => {
        let totalVotes = 0;
        const voters: Array<{ userFid: number; username: string | null; displayName: string | null; pfpUrl: string | null }> = [];

        responses.forEach((response) => {
          // Handle JSONB - it might be a string that needs parsing
          let allocationsObj: Record<string, number> | null = null;
          if (response.allocations) {
            if (typeof response.allocations === 'string') {
              try {
                allocationsObj = JSON.parse(response.allocations);
              } catch (e) {
                console.error("Failed to parse allocations JSON:", e);
              }
            } else if (typeof response.allocations === 'object' && response.allocations !== null && !Array.isArray(response.allocations)) {
              allocationsObj = response.allocations as Record<string, number>;
            }
          }
          
          if (allocationsObj && typeof allocationsObj === 'object' && !Array.isArray(allocationsObj) && allocationsObj !== null) {
            const allocation = allocationsObj[option.id];
            if (typeof allocation === 'number' && allocation > 0) {
              totalVotes += allocation;
              // Add voter info (only once per voter)
              if (!voters.find(v => v.userFid === response.userFid)) {
                voters.push({
                  userFid: response.userFid,
                  username: response.username,
                  displayName: response.displayName,
                  pfpUrl: response.pfpUrl,
                });
              }
            }
          }
        });

        return {
          optionId: option.id,
          optionText: option.optionText,
          markdown: option.markdown,
          totalVotes,
          voters, // Users who voted for this option
        };
      });

      // Sort by total votes (descending)
      collatedResults.sort((a, b) => b.totalVotes - a.totalVotes);

      // Format individual responses for distribution type
      individualResponses = responses.map((response) => {
        // Handle JSONB - it might be a string that needs parsing
        let allocationsObj: Record<string, number> | null = null;
        if (response.allocations) {
          if (typeof response.allocations === 'string') {
            try {
              allocationsObj = JSON.parse(response.allocations);
            } catch (e) {
              console.error("Failed to parse allocations JSON:", e);
            }
          } else if (typeof response.allocations === 'object' && response.allocations !== null && !Array.isArray(response.allocations)) {
            allocationsObj = response.allocations as Record<string, number>;
          }
        }
        
        const optionAllocations: Array<{ optionId: string; optionText: string; votes: number }> = [];
        
        if (allocationsObj && typeof allocationsObj === 'object' && !Array.isArray(allocationsObj) && allocationsObj !== null) {
          Object.entries(allocationsObj).forEach(([optionId, votes]) => {
            if (typeof votes === 'number' && votes > 0) {
              const option = options.find((opt) => opt.id === optionId);
              optionAllocations.push({
                optionId,
                optionText: option?.optionText || "[Deleted Option]",
                votes,
              });
            }
          });
        }

        return {
          id: response.id,
          userFid: response.userFid,
          username: response.username,
          displayName: response.displayName,
          pfpUrl: response.pfpUrl,
          allocations: optionAllocations,
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

