import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { castReplies, curatedCasts } from "@/lib/schema";
import { eq, or, asc, desc, inArray } from "drizzle-orm";
import { calculateEngagementScore } from "@/lib/engagement";
import { isQuoteCast } from "@/lib/conversation";

/**
 * API endpoint to fetch the full conversation from the database for a curated cast
 * Returns only stored replies/quotes, not merged with Neynar API
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const castHash = searchParams.get("castHash");
    const sortBy = searchParams.get("sortBy") || "newest"; // newest, engagement, quality

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
    // Exclude parent casts saved for display only (they use placeholder hash 0x0000...)
    const PARENT_CAST_PLACEHOLDER_HASH = "0x0000000000000000000000000000000000000000";
    const storedReplies = await db
      .select()
      .from(castReplies)
      .where(
        or(
          eq(castReplies.curatedCastHash, castHash),
          eq(castReplies.quotedCastHash, castHash)
        )
      )
      .orderBy(
        asc(castReplies.replyDepth),
        sortBy === "newest" ? desc(castReplies.castCreatedAt) : asc(castReplies.createdAt)
      );
    
    // Filter out parent casts that use the placeholder hash (metadata-only entries)
    const filteredReplies = storedReplies.filter(
      reply => reply.curatedCastHash !== PARENT_CAST_PLACEHOLDER_HASH
    );

    // Build threaded structure
    const replyMap = new Map<string, any>();
    const rootReplies: any[] = [];

    // First pass: create map of all replies
    filteredReplies.forEach((storedReply) => {
      const castData = storedReply.castData as any;
      if (!castData) return;

      // Add metadata for threading
      castData._replyDepth = storedReply.replyDepth;
      castData._parentCastHash = storedReply.parentCastHash;
      castData._isQuoteCast = storedReply.isQuoteCast;
      castData._rootCastHash = storedReply.rootCastHash;
      castData.castCreatedAt = storedReply.castCreatedAt; // Include for sorting

      replyMap.set(storedReply.replyCastHash, {
        ...castData,
        children: [],
      });
    });

    // Second pass: build tree structure
    filteredReplies.forEach((storedReply) => {
      const reply = replyMap.get(storedReply.replyCastHash);
      if (!reply) return;

      const parentHash = storedReply.parentCastHash;
      
      // Check if this is a quote cast (top-level quote of the curated cast)
      const isQuoteCast = storedReply.isQuoteCast && storedReply.quotedCastHash === castHash;
      
      // Filter out parent casts that are not actually replies to the curated cast
      // These are parent casts saved for display purposes only (parents of quote casts)
      // They should not appear in the conversation tree
      const castData = storedReply.castData as any;
      const castParentHash = castData?.parent_hash;
      
      // If this cast's parent (from castData) is NOT the root cast, and it's not a quote cast,
      // then it's likely a parent cast saved for display only - skip it
      if (!isQuoteCast && 
          castParentHash && 
          castParentHash !== castHash &&
          parentHash && 
          parentHash !== castHash) {
        // Check if the parent is actually in the stored replies (meaning it's part of the thread)
        const parentInReplies = filteredReplies.some(sr => sr.replyCastHash === parentHash);
        
        // If parent is not in replies, this is a parent cast saved for display only
        if (!parentInReplies) {
          return; // Skip this cast - it's not an actual reply to the curated cast
        }
      }
      
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

    // Sort root replies based on sortBy parameter
    if (sortBy === "newest") {
      // Sort by castCreatedAt (most recent first) - database already sorted, but preserve order
      rootReplies.sort((a, b) => {
        const aTime = a.castCreatedAt 
          ? new Date(a.castCreatedAt).getTime() 
          : (a.timestamp ? new Date(a.timestamp).getTime() : (a.created_at ? new Date(a.created_at).getTime() : 0));
        const bTime = b.castCreatedAt 
          ? new Date(b.castCreatedAt).getTime() 
          : (b.timestamp ? new Date(b.timestamp).getTime() : (b.created_at ? new Date(b.created_at).getTime() : 0));
        return bTime - aTime; // Descending (newest first)
      });
    } else if (sortBy === "engagement") {
      // Sort by engagement score (highest first)
      rootReplies.sort((a, b) => {
        const aScore = calculateEngagementScore(a);
        const bScore = calculateEngagementScore(b);
        return bScore - aScore; // Descending (highest engagement first)
      });
    } else if (sortBy === "quality") {
      // Sort by quality score (user score + cast length, highest first)
      rootReplies.sort((a, b) => {
        const calculateQualityScore = (cast: any): number => {
          const userScore = cast.author?.score || 0;
          const castLength = cast.text?.length || 0;
          // Combine user score (0-1) and cast length (normalized to 0-1, assuming max ~500 chars)
          return userScore * 100 + Math.min(castLength / 5, 100);
        };
        const aScore = calculateQualityScore(a);
        const bScore = calculateQualityScore(b);
        return bScore - aScore; // Descending (highest quality first)
      });
    } else {
      // Default: sort by timestamp (oldest first, chronological)
      rootReplies.sort((a, b) => {
        const aTime = a.castCreatedAt 
          ? new Date(a.castCreatedAt).getTime() 
          : (a.timestamp ? new Date(a.timestamp).getTime() : (a.created_at ? new Date(a.created_at).getTime() : 0));
        const bTime = b.castCreatedAt 
          ? new Date(b.castCreatedAt).getTime() 
          : (b.timestamp ? new Date(b.timestamp).getTime() : (b.created_at ? new Date(b.created_at).getTime() : 0));
        return aTime - bTime; // Ascending (oldest first)
      });
    }

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

    // Fetch parent casts for quote casts from cast_replies table
    // Find all quote casts with parent hashes that need parent cast data
    const quoteCastsWithParents: Array<{ cast: any; parentHash: string }> = [];
    
    function collectQuoteCastsWithParents(replies: any[]) {
      for (const reply of replies) {
        if (isQuoteCast(reply) && reply._parentCastHash && reply._parentCastHash !== castHash) {
          // Get quoted cast hash from embeds to ensure we're not confusing it with parent_hash
          const quotedCastHashes: string[] = [];
          if (reply.embeds && Array.isArray(reply.embeds)) {
            reply.embeds.forEach((embed: any) => {
              if (embed.cast_id?.hash) {
                quotedCastHashes.push(embed.cast_id.hash);
              } else if (embed.cast?.hash) {
                quotedCastHashes.push(embed.cast.hash);
              }
            });
          }
          
          // Only use parent_hash if it's different from the quoted cast hash
          const parentHash = reply._parentCastHash;
          const isParentDifferentFromQuoted = !quotedCastHashes.includes(parentHash);
          
          if (isParentDifferentFromQuoted) {
            // Check if parent is already in the replies tree
            const parentInTree = findCastByHashInReplies(rootReplies, parentHash);
            if (!parentInTree) {
              quoteCastsWithParents.push({ cast: reply, parentHash });
            }
          }
        }
        
        if (reply.children && reply.children.length > 0) {
          collectQuoteCastsWithParents(reply.children);
        }
      }
    }
    
    function findCastByHashInReplies(replies: any[], hash: string): any | null {
      for (const reply of replies) {
        if (reply.hash === hash) {
          return reply;
        }
        if (reply.children && reply.children.length > 0) {
          const found = findCastByHashInReplies(reply.children, hash);
          if (found) return found;
        }
      }
      return null;
    }
    
    collectQuoteCastsWithParents(rootReplies);
    
    // Fetch parent casts from database where parent_cast_hash = reply_cast_hash
    const parentHashes = Array.from(new Set(quoteCastsWithParents.map(q => q.parentHash)));
    const parentCastsMap = new Map<string, any>();
    
    if (parentHashes.length > 0) {
      console.log(`[ConversationDB] Fetching parent casts from DB for hashes:`, parentHashes);
      const storedParentCasts = await db
        .select({
          replyCastHash: castReplies.replyCastHash,
          castData: castReplies.castData,
          parentCastHash: castReplies.parentCastHash,
          curatedCastHash: castReplies.curatedCastHash,
        })
        .from(castReplies)
        .where(
          inArray(castReplies.replyCastHash, parentHashes)
        );
      
      console.log(`[ConversationDB] Found ${storedParentCasts.length} parent casts in DB:`, 
        storedParentCasts.map(s => ({
          replyCastHash: s.replyCastHash,
          parentCastHash: s.parentCastHash,
          curatedCastHash: s.curatedCastHash,
          author: (s.castData as any)?.author?.username,
          text: (s.castData as any)?.text?.substring(0, 50),
          hash: (s.castData as any)?.hash,
        }))
      );
      
      storedParentCasts.forEach((stored) => {
        const parentCast = stored.castData as any;
        if (parentCast) {
          console.log(`[ConversationDB] Mapping parent cast ${stored.replyCastHash} -> author: ${parentCast.author?.username}, hash: ${parentCast.hash}`);
          parentCastsMap.set(stored.replyCastHash, parentCast);
        }
      });
    }
    
    // Attach parent casts to quote casts
    function attachParentCasts(replies: any[]) {
      for (const reply of replies) {
        if (isQuoteCast(reply) && reply._parentCastHash && parentCastsMap.has(reply._parentCastHash)) {
          reply._parentCast = parentCastsMap.get(reply._parentCastHash);
        }
        if (reply.children && reply.children.length > 0) {
          attachParentCasts(reply.children);
        }
      }
    }
    attachParentCasts(rootReplies);

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

