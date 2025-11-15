import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { castReplies, curatedCasts } from "@/lib/schema";
import { eq, or, asc } from "drizzle-orm";

/**
 * API endpoint to fetch the full conversation from the database for a curated cast
 * Returns only stored replies/quotes, not merged with Neynar API
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const castHash = searchParams.get("castHash");

    if (!castHash) {
      return NextResponse.json(
        { error: "castHash is required" },
        { status: 400 }
      );
    }

    // Check if cast is curated
    const curatedCast = await db
      .select()
      .from(curatedCasts)
      .where(eq(curatedCasts.castHash, castHash))
      .limit(1);

    if (curatedCast.length === 0) {
      return NextResponse.json(
        { error: "Cast is not curated" },
        { status: 404 }
      );
    }

    // Get the root cast data
    const rootCastData = curatedCast[0].castData as any;

    // Fetch all stored replies/quotes for this curated cast
    const storedReplies = await db
      .select()
      .from(castReplies)
      .where(
        or(
          eq(castReplies.curatedCastHash, castHash),
          eq(castReplies.quotedCastHash, castHash)
        )
      )
      .orderBy(asc(castReplies.replyDepth), asc(castReplies.createdAt));

    // Build threaded structure
    const replyMap = new Map<string, any>();
    const rootReplies: any[] = [];

    // First pass: create map of all replies
    storedReplies.forEach((storedReply) => {
      const castData = storedReply.castData as any;
      if (!castData) return;

      // Add metadata for threading
      castData._replyDepth = storedReply.replyDepth;
      castData._parentCastHash = storedReply.parentCastHash;
      castData._isQuoteCast = storedReply.isQuoteCast;
      castData._rootCastHash = storedReply.rootCastHash;

      replyMap.set(storedReply.replyCastHash, {
        ...castData,
        children: [],
      });
    });

    // Second pass: build tree structure
    storedReplies.forEach((storedReply) => {
      const reply = replyMap.get(storedReply.replyCastHash);
      if (!reply) return;

      const parentHash = storedReply.parentCastHash;
      
      // Check if this is a quote cast (top-level quote of the curated cast)
      const isQuoteCast = storedReply.isQuoteCast && storedReply.quotedCastHash === castHash;
      
      if (!parentHash || parentHash === castHash || isQuoteCast) {
        // Root-level reply (direct reply to curated cast, or quote cast)
        rootReplies.push(reply);
      } else {
        // Nested reply - try to find parent in replyMap
        // Parent could be:
        // 1. Another reply (nested thread)
        // 2. A quote cast (reply to quote cast)
        const parent = replyMap.get(parentHash);
        if (parent && parent.children) {
          parent.children.push(reply);
        } else {
          // Parent not found in direct lookup - try to find it in stored replies
          // This handles cases where parentHash matches a quote cast or other reply
          // Use trim() and case-insensitive comparison to handle any formatting differences
          const normalizedParentHash = parentHash?.trim().toLowerCase();
          const parentStoredReply = storedReplies.find(
            (sr) => sr.replyCastHash?.trim().toLowerCase() === normalizedParentHash
          );
          
          if (parentStoredReply) {
            // Found the parent in stored replies, get it from replyMap
            // Use the actual hash from stored reply (not normalized) to look up in map
            const parentReply = replyMap.get(parentStoredReply.replyCastHash);
            if (parentReply && parentReply.children) {
              parentReply.children.push(reply);
            } else {
              // Parent exists in stored replies but not in map - this shouldn't happen
              // but treat as root-level to be safe
              console.warn(`Parent ${parentHash} found in stored replies but not in replyMap`);
              rootReplies.push(reply);
            }
          } else {
            // Parent not found in stored replies, treat as root-level
            // This can happen if parent is outside our stored conversation
            rootReplies.push(reply);
          }
        }
      }
    });

    // Sort root replies by timestamp
    rootReplies.sort((a, b) => {
      const aTime = new Date(a.timestamp || a.created_at || 0).getTime();
      const bTime = new Date(b.timestamp || b.created_at || 0).getTime();
      return aTime - bTime;
    });

    // Recursively sort children
    function sortChildren(reply: any) {
      if (reply.children && reply.children.length > 0) {
        reply.children.sort((a: any, b: any) => {
          const aTime = new Date(a.timestamp || a.created_at || 0).getTime();
          const bTime = new Date(b.timestamp || b.created_at || 0).getTime();
          return aTime - bTime;
        });
        reply.children.forEach(sortChildren);
      }
    }
    rootReplies.forEach(sortChildren);

    return NextResponse.json({
      rootCast: rootCastData,
      replies: rootReplies,
      totalReplies: storedReplies.length,
      conversationFetchedAt: curatedCast[0].conversationFetchedAt,
    });
  } catch (error: any) {
    console.error("Database conversation API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch conversation from database" },
      { status: 500 }
    );
  }
}

