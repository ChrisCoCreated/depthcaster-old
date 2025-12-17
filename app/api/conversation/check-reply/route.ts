import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { castReplies, curatedCasts } from "@/lib/schema";
import { eq, sql } from "drizzle-orm";

/**
 * API endpoint to check if a hash is a reply in a curated thread
 * Returns the root curated cast hash if the hash is a reply
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const hash = searchParams.get("hash");

    if (!hash) {
      return NextResponse.json(
        { error: "hash is required" },
        { status: 400 }
      );
    }

    const trimmedHash = hash.trim();

    // First check if it's a curated cast itself
    const curatedCheck = await db
      .select()
      .from(curatedCasts)
      .where(
        sql`LOWER(${curatedCasts.castHash}) = LOWER(${trimmedHash})`
      )
      .limit(1);

    if (curatedCheck.length > 0) {
      // It's a curated cast, not a reply
      return NextResponse.json({ isReply: false });
    }

    // Check if it's a reply in castReplies
    const replyCheck = await db
      .select({
        rootCastHash: castReplies.rootCastHash,
        curatedCastHash: castReplies.curatedCastHash,
      })
      .from(castReplies)
      .where(
        sql`LOWER(${castReplies.replyCastHash}) = LOWER(${trimmedHash})`
      )
      .limit(1);

    if (replyCheck.length === 0) {
      // Not a reply in our database
      return NextResponse.json({ isReply: false });
    }

    const { rootCastHash, curatedCastHash } = replyCheck[0];

    // Verify the root cast is curated
    const rootCuratedCheck = await db
      .select()
      .from(curatedCasts)
      .where(
        sql`LOWER(${curatedCasts.castHash}) = LOWER(${rootCastHash})`
      )
      .limit(1);

    if (rootCuratedCheck.length === 0) {
      // Root cast is not curated, so this isn't a reply in a curated thread
      return NextResponse.json({ isReply: false });
    }

    // It's a reply in a curated thread
    return NextResponse.json({
      isReply: true,
      rootCastHash: rootCastHash,
      originalHash: trimmedHash,
    });
  } catch (error: any) {
    console.error("Check reply API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to check reply" },
      { status: 500 }
    );
  }
}






























