import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { castReplies, users } from "@/lib/schema";
import { isNull, eq } from "drizzle-orm";
import { isAdmin, getUserRoles } from "@/lib/roles";
import { analyzeBatch } from "@/lib/deepseek-quality";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { adminFid, limit, batchSize, delayBetweenBatches } = body;

    // Check admin access
    if (!adminFid) {
      return NextResponse.json(
        { error: "adminFid is required" },
        { status: 400 }
      );
    }

    const adminFidNum = parseInt(String(adminFid));
    if (isNaN(adminFidNum)) {
      return NextResponse.json(
        { error: "Invalid adminFid" },
        { status: 400 }
      );
    }

    // Verify admin status
    const adminUser = await db.select().from(users).where(eq(users.fid, adminFidNum)).limit(1);
    if (adminUser.length === 0) {
      return NextResponse.json(
        { error: "Admin user not found" },
        { status: 404 }
      );
    }
    const roles = await getUserRoles(adminFidNum);
    if (!isAdmin(roles)) {
      return NextResponse.json(
        { error: "User does not have admin or superadmin role" },
        { status: 403 }
      );
    }

    // Get all replies without quality scores
    let repliesQuery = db
      .select({
        replyCastHash: castReplies.replyCastHash,
        castData: castReplies.castData,
      })
      .from(castReplies)
      .where(isNull(castReplies.qualityScore));

    // Apply limit if provided
    if (limit && limit > 0) {
      repliesQuery = repliesQuery.limit(limit) as any;
    }

    const repliesToAnalyze = await repliesQuery;

    console.log(`[Admin] Found ${repliesToAnalyze.length} replies without quality scores`);

    if (repliesToAnalyze.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No replies to analyze",
        processed: 0,
        failed: 0,
        total: 0,
      });
    }

    // Process in batches
    const result = await analyzeBatch(
      repliesToAnalyze.map((reply) => ({
        castHash: reply.replyCastHash,
        castData: reply.castData,
      })),
      async (replyCastHash, analysisResult) => {
        await db
          .update(castReplies)
          .set({
            qualityScore: analysisResult.qualityScore,
            category: analysisResult.category,
            qualityAnalyzedAt: new Date(),
          })
          .where(eq(castReplies.replyCastHash, replyCastHash));
      },
      {
        batchSize: batchSize || 5,
        delayBetweenBatches: delayBetweenBatches || 1000, // 1 second delay between batches
      }
    );

    console.log(`[Admin] Quality analysis completed: ${result.processed} processed, ${result.failed} failed`);

    return NextResponse.json({
      success: true,
      message: `Quality analysis completed for ${result.processed} replies`,
      processed: result.processed,
      failed: result.failed,
      total: repliesToAnalyze.length,
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Admin analyze replies quality API error:", err.message || err);
    return NextResponse.json(
      { error: err.message || "Failed to analyze replies quality" },
      { status: 500 }
    );
  }
}
