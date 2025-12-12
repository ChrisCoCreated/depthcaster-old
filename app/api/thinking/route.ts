import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { thinkingCasts } from "@/lib/schema";
import { desc } from "drizzle-orm";
import { enrichCastsWithViewerContext } from "@/lib/interactions";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const cursor = searchParams.get("cursor") || undefined;
    const limit = parseInt(searchParams.get("limit") || "25");
    const viewerFid = searchParams.get("viewerFid")
      ? parseInt(searchParams.get("viewerFid")!)
      : undefined;

    // Query thinking casts from database, ordered by creation time (most recent first)
    const offset = cursor ? parseInt(cursor) : 0;
    
    const storedCasts = await db
      .select()
      .from(thinkingCasts)
      .orderBy(desc(thinkingCasts.castCreatedAt))
      .limit(limit + 1) // Fetch one extra to check if there's more
      .offset(offset);

    // Check if there are more casts
    const hasMore = storedCasts.length > limit;
    const castsToReturn = hasMore ? storedCasts.slice(0, limit) : storedCasts;
    
    // Extract cast data from stored casts
    let casts = castsToReturn.map((row) => row.castData as any);

    // Enrich casts with viewer context from database
    if (viewerFid && casts.length > 0) {
      casts = await enrichCastsWithViewerContext(casts, viewerFid);
    }

    const nextCursor = hasMore ? (offset + limit).toString() : null;

    return NextResponse.json({
      casts,
      next: nextCursor ? { cursor: nextCursor } : null,
    });
  } catch (error: any) {
    console.error("Thinking API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch thinking casts" },
      { status: 500 }
    );
  }
}
