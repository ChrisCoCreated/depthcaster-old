import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pfpNfts } from "@/lib/schema";
import { sql } from "drizzle-orm";

const MAX_SUPPLY = 1111;

export async function GET(request: NextRequest) {
  try {
    const mintedCount = await db
      .select({ count: sql<number>`count(*)::int`.as("count") })
      .from(pfpNfts);

    const minted = mintedCount[0]?.count || 0;
    const remaining = Math.max(0, MAX_SUPPLY - minted);

    return NextResponse.json({
      minted,
      remaining,
      total: MAX_SUPPLY,
    });
  } catch (error) {
    console.error("[pfp/stats] Error fetching stats:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch stats",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

