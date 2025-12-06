import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { curatedCasts, curatorCastCurations } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { extractEmbeddedCastTexts, extractLinkUrls } from "@/lib/conversation";
import { neynarClient } from "@/lib/neynar";
import { analyzeCastQualityWithFeedback } from "@/lib/deepseek-quality";
import { isAdmin, getUserRoles } from "@/lib/roles";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { castHash, curatorFid, feedback, rootCastHash } = body;

    if (!castHash) {
      return NextResponse.json(
        { error: "castHash is required" },
        { status: 400 }
      );
    }

    if (!curatorFid) {
      return NextResponse.json(
        { error: "curatorFid is required" },
        { status: 400 }
      );
    }

    if (!feedback || !feedback.trim()) {
      return NextResponse.json(
        { error: "feedback is required" },
        { status: 400 }
      );
    }

    // Check if user is admin
    const roles = await getUserRoles(curatorFid);
    const userIsAdmin = isAdmin(roles);

    // Verify that the user has curated this cast OR the root cast OR is admin
    const curation = await db
      .select()
      .from(curatorCastCurations)
      .where(
        and(
          eq(curatorCastCurations.castHash, castHash),
          eq(curatorCastCurations.curatorFid, curatorFid)
        )
      )
      .limit(1);

    let hasCuration = curation.length > 0;

    // If not curated current cast, check root cast (if provided and different)
    if (!hasCuration && rootCastHash && rootCastHash !== castHash) {
      const rootCuration = await db
        .select()
        .from(curatorCastCurations)
        .where(
          and(
            eq(curatorCastCurations.castHash, rootCastHash),
            eq(curatorCastCurations.curatorFid, curatorFid)
          )
        )
        .limit(1);
      
      hasCuration = rootCuration.length > 0;
    }

    // Allow if user has curated (current or root cast) OR is admin
    if (!hasCuration && !userIsAdmin) {
      return NextResponse.json(
        { error: "You must curate this cast or the root cast before providing quality feedback, or be an admin" },
        { status: 403 }
      );
    }

    // Fetch the cast data from curated_casts table
    const castRecord = await db
      .select()
      .from(curatedCasts)
      .where(eq(curatedCasts.castHash, castHash))
      .limit(1);

    if (castRecord.length === 0) {
      return NextResponse.json(
        { error: "Cast not found in curated casts" },
        { status: 404 }
      );
    }

    const castData = castRecord[0].castData as any;
    const currentQualityScore = castRecord[0].qualityScore;

    if (currentQualityScore === null || currentQualityScore === undefined) {
      return NextResponse.json(
        { error: "Cast does not have a quality score yet" },
        { status: 400 }
      );
    }

    // Extract cast text
    const castText = castData?.text || "";

    // Extract embedded cast texts (castData should be a Cast object)
    const embeddedCastTexts = await extractEmbeddedCastTexts(castData as any, neynarClient);

    // Extract links (castData should be a Cast object)
    const links = extractLinkUrls(castData as any);

    // Call DeepSeek with feedback
    const result = await analyzeCastQualityWithFeedback({
      castText,
      embeddedCastTexts,
      links,
      curatorFeedback: feedback.trim(),
      currentQualityScore,
    });

    if (!result) {
      return NextResponse.json(
        { error: "Failed to analyze quality with feedback" },
        { status: 500 }
      );
    }

    // Update the quality score in the database
    await db
      .update(curatedCasts)
      .set({
        qualityScore: result.qualityScore,
        qualityAnalyzedAt: new Date(),
      })
      .where(eq(curatedCasts.castHash, castHash));

    return NextResponse.json({
      success: true,
      qualityScore: result.qualityScore,
      reasoning: result.reasoning,
    });
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string };
    console.error("Quality feedback API error:", err.message || err);
    return NextResponse.json(
      { error: err.message || "Failed to process quality feedback" },
      { status: 500 }
    );
  }
}
