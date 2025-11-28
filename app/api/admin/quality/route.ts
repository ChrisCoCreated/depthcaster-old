import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { curatedCasts, castReplies, users } from "@/lib/schema";
import { eq, and, gte, lte, isNull, or, isNotNull } from "drizzle-orm";
import { isAdmin, getUserRoles } from "@/lib/roles";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const adminFid = searchParams.get("adminFid");
    const minQualityParam = searchParams.get("minQuality");
    const maxQualityParam = searchParams.get("maxQuality");
    const includeNullParam = searchParams.get("includeNull") === "true";
    const includeCastsParam = searchParams.get("includeCasts") === "true";
    const includeRepliesParam = searchParams.get("includeReplies") === "true";

    // Check admin access
    if (!adminFid) {
      return NextResponse.json(
        { error: "adminFid is required" },
        { status: 400 }
      );
    }

    const adminFidNum = parseInt(adminFid);
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

    // Parse quality range
    const minQuality = minQualityParam ? parseInt(minQualityParam) : null;
    const maxQuality = maxQualityParam ? parseInt(maxQualityParam) : null;

    if (minQuality !== null && (isNaN(minQuality) || minQuality < 0 || minQuality > 100)) {
      return NextResponse.json(
        { error: "minQuality must be between 0 and 100" },
        { status: 400 }
      );
    }

    if (maxQuality !== null && (isNaN(maxQuality) || maxQuality < 0 || maxQuality > 100)) {
      return NextResponse.json(
        { error: "maxQuality must be between 0 and 100" },
        { status: 400 }
      );
    }

    if (minQuality !== null && maxQuality !== null && minQuality > maxQuality) {
      return NextResponse.json(
        { error: "minQuality must be less than or equal to maxQuality" },
        { status: 400 }
      );
    }

    // Helper function to build quality filter conditions for a table
    const buildQualityConditions = (qualityScoreColumn: any) => {
      const conditions: any[] = [];
      
      // If only null is requested (includeNull=true, no range specified)
      const onlyNull = includeNullParam && minQuality === null && maxQuality === null;
      
      if (onlyNull) {
        // Show only null quality scores
        conditions.push(isNull(qualityScoreColumn));
      } else if (includeNullParam) {
        // Include null values along with range
        if (minQuality !== null && maxQuality !== null) {
          // Range with null: (quality >= min AND quality <= max) OR quality IS NULL
          conditions.push(
            or(
              and(
                isNotNull(qualityScoreColumn),
                gte(qualityScoreColumn, minQuality),
                lte(qualityScoreColumn, maxQuality)
              ),
              isNull(qualityScoreColumn)
            )
          );
        } else if (minQuality !== null) {
          // Min only with null: (quality >= min) OR quality IS NULL
          conditions.push(
            or(
              and(
                isNotNull(qualityScoreColumn),
                gte(qualityScoreColumn, minQuality)
              ),
              isNull(qualityScoreColumn)
            )
          );
        } else if (maxQuality !== null) {
          // Max only with null: (quality <= max) OR quality IS NULL
          conditions.push(
            or(
              and(
                isNotNull(qualityScoreColumn),
                lte(qualityScoreColumn, maxQuality)
              ),
              isNull(qualityScoreColumn)
            )
          );
        } else {
          // No range specified, just include null: all items
          // No filter needed
        }
      } else {
        // Exclude null values
        if (minQuality !== null && maxQuality !== null) {
          // Range without null: quality >= min AND quality <= max AND quality IS NOT NULL
          conditions.push(
            and(
              isNotNull(qualityScoreColumn),
              gte(qualityScoreColumn, minQuality),
              lte(qualityScoreColumn, maxQuality)
            )
          );
        } else if (minQuality !== null) {
          // Min only without null: quality >= min AND quality IS NOT NULL
          conditions.push(
            and(
              isNotNull(qualityScoreColumn),
              gte(qualityScoreColumn, minQuality)
            )
          );
        } else if (maxQuality !== null) {
          // Max only without null: quality <= max AND quality IS NOT NULL
          conditions.push(
            and(
              isNotNull(qualityScoreColumn),
              lte(qualityScoreColumn, maxQuality)
            )
          );
        } else {
          // No range specified, exclude null: quality IS NOT NULL
          conditions.push(isNotNull(qualityScoreColumn));
        }
      }
      
      return conditions;
    };

    const items: Array<{
      hash: string;
      castData: any;
      qualityScore: number | null;
      category: string | null;
      type: "cast" | "reply";
    }> = [];

    // Fetch casts
    if (includeCastsParam) {
      const castQualityConditions = buildQualityConditions(curatedCasts.qualityScore);
      const castsQuery = db
        .select({
          hash: curatedCasts.castHash,
          castData: curatedCasts.castData,
          qualityScore: curatedCasts.qualityScore,
          category: curatedCasts.category,
        })
        .from(curatedCasts);

      if (castQualityConditions.length > 0) {
        castsQuery.where(and(...castQualityConditions));
      }

      const casts = await castsQuery;
      
      for (const cast of casts) {
        items.push({
          hash: cast.hash,
          castData: cast.castData,
          qualityScore: cast.qualityScore,
          category: cast.category,
          type: "cast",
        });
      }
    }

    // Fetch replies
    if (includeRepliesParam) {
      const replyQualityConditions = buildQualityConditions(castReplies.qualityScore);
      const repliesQuery = db
        .select({
          hash: castReplies.replyCastHash,
          castData: castReplies.castData,
          qualityScore: castReplies.qualityScore,
          category: castReplies.category,
        })
        .from(castReplies);

      if (replyQualityConditions.length > 0) {
        repliesQuery.where(and(...replyQualityConditions));
      }

      const replies = await repliesQuery;
      
      for (const reply of replies) {
        items.push({
          hash: reply.hash,
          castData: reply.castData,
          qualityScore: reply.qualityScore,
          category: reply.category,
          type: "reply",
        });
      }
    }

    // Sort by quality score (nulls last)
    items.sort((a, b) => {
      if (a.qualityScore === null && b.qualityScore === null) return 0;
      if (a.qualityScore === null) return 1;
      if (b.qualityScore === null) return -1;
      return b.qualityScore - a.qualityScore; // Descending
    });

    return NextResponse.json({ items });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Quality filter API error:", err.message || err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch items" },
      { status: 500 }
    );
  }
}
