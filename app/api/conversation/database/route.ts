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
    
    console.log(`[ConversationDB] Fetched ${storedReplies.length} stored replies, ${filteredReplies.length} after filtering placeholder hashes for castHash ${castHash}`);
    
    // Debug: Check for replies to the specific hash mentioned
    const targetHash = "0xfa3ecdb33e07f50cd28ed9ecbd1d789230d02f76";
    const repliesToTarget = await db
      .select()
      .from(castReplies)
      .where(eq(castReplies.parentCastHash, targetHash));
    
    if (repliesToTarget.length > 0) {
      console.log(`[ConversationDB] Found ${repliesToTarget.length} reply/replies to ${targetHash}:`, 
        repliesToTarget.map(r => ({
          replyCastHash: r.replyCastHash,
          curatedCastHash: r.curatedCastHash,
          parentCastHash: r.parentCastHash,
          rootCastHash: r.rootCastHash,
          isInFiltered: filteredReplies.some(fr => fr.replyCastHash === r.replyCastHash)
        }))
      );
      
      // Check if the parent itself is in stored replies
      const parentInStored = filteredReplies.some(fr => fr.replyCastHash?.trim().toLowerCase() === targetHash.trim().toLowerCase());
      console.log(`[ConversationDB] Parent ${targetHash} is in stored replies: ${parentInStored}`);
      if (!parentInStored) {
        const parentInDB = await db
          .select()
          .from(castReplies)
          .where(eq(castReplies.replyCastHash, targetHash))
          .limit(1);
        console.log(`[ConversationDB] Parent ${targetHash} in database: ${parentInDB.length > 0}, curatedCastHash: ${parentInDB[0]?.curatedCastHash}`);
      }
    }

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
    let skippedCount = 0;
    filteredReplies.forEach((storedReply) => {
      const reply = replyMap.get(storedReply.replyCastHash);
      if (!reply) {
        skippedCount++;
        return;
      }

      const parentHash = storedReply.parentCastHash;
      
      // Check if this is a quote cast (top-level quote of the curated cast)
      const isQuoteCast = storedReply.isQuoteCast && storedReply.quotedCastHash === castHash;
      
      // Filter out parent casts that are not actually replies to the curated cast
      // These are parent casts saved for display purposes only (parents of quote casts)
      // They should not appear in the conversation tree
      // Only filter if:
      // 1. It's not a quote cast
      // 2. It has a parent that's not the root cast
      // 3. The parent is not in our stored replies (meaning it's outside the conversation)
      if (!isQuoteCast && 
          parentHash && 
          parentHash !== castHash) {
        // Check if the parent is actually in the stored replies (meaning it's part of the thread)
        // Use case-insensitive comparison to match the tree-building logic below
        const normalizedParentHash = parentHash?.trim().toLowerCase();
        const parentInReplies = filteredReplies.some(
          sr => sr.replyCastHash?.trim().toLowerCase() === normalizedParentHash
        );
        
        // If parent is not in replies, this might be a parent cast saved for display only
        // BUT: also check if this reply has the correct curatedCastHash - if it does, include it
        // (it might be a legitimate reply whose parent wasn't stored yet, or was filtered)
        const hasCorrectCuratedCastHash = storedReply.curatedCastHash === castHash || 
                                          storedReply.quotedCastHash === castHash;
        
        if (!parentInReplies && !hasCorrectCuratedCastHash) {
          // Log for debugging - this might be filtering out legitimate replies
          skippedCount++;
          console.warn(`[ConversationDB] Filtering out reply ${storedReply.replyCastHash} - parent ${parentHash} not found in filteredReplies and curatedCastHash mismatch (curatedCastHash: ${storedReply.curatedCastHash}, expected: ${castHash})`);
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
        // Use case-insensitive lookup to handle formatting differences
        const normalizedParentHash = parentHash?.trim().toLowerCase();
        let parent = replyMap.get(parentHash);
        
        // Debug logging for the specific case
        const isTargetReply = storedReply.replyCastHash === "0x10907aac1d118c8929592d6924440f1dac28815e";
        if (isTargetReply) {
          console.log(`[ConversationDB] Processing target reply ${storedReply.replyCastHash}, parentHash: ${parentHash}`);
          console.log(`[ConversationDB] Direct lookup result: ${!!parent}`);
          console.log(`[ConversationDB] replyMap keys (first 5):`, Array.from(replyMap.keys()).slice(0, 5));
        }
        
        // If direct lookup failed, try case-insensitive search
        if (!parent) {
          const parentStoredReply = filteredReplies.find(
            (sr) => sr.replyCastHash?.trim().toLowerCase() === normalizedParentHash
          );
          if (parentStoredReply) {
            if (isTargetReply) {
              console.log(`[ConversationDB] Found parent via case-insensitive search: ${parentStoredReply.replyCastHash}`);
            }
            parent = replyMap.get(parentStoredReply.replyCastHash);
            if (isTargetReply) {
              console.log(`[ConversationDB] Parent from map after case-insensitive lookup: ${!!parent}`);
            }
          }
        }
        
        if (parent && parent.children) {
          if (isTargetReply) {
            console.log(`[ConversationDB] Successfully attaching target reply to parent ${parentHash}`);
          }
          parent.children.push(reply);
        } else {
          // Parent not found in filtered replies, treat as root-level
          // This can happen if parent is outside our stored conversation
          // or if parent was filtered out (shouldn't happen for legitimate nested replies)
          const parentInStored = filteredReplies.some(sr => sr.replyCastHash?.trim().toLowerCase() === normalizedParentHash);
          if (isTargetReply || !parentInStored) {
            console.warn(`[ConversationDB] Parent ${parentHash} not found in replyMap for reply ${storedReply.replyCastHash}, treating as root-level. Parent in stored replies: ${parentInStored}`);
          }
          if (parentInStored) {
            // Parent exists but wasn't in replyMap - this shouldn't happen, but let's try to find it
            const parentStoredReply = filteredReplies.find(sr => sr.replyCastHash?.trim().toLowerCase() === normalizedParentHash);
            if (parentStoredReply) {
              const parentFromMap = replyMap.get(parentStoredReply.replyCastHash);
              if (parentFromMap && parentFromMap.children) {
                if (isTargetReply) {
                  console.log(`[ConversationDB] Found parent ${parentHash} using stored reply lookup, attaching child`);
                }
                parentFromMap.children.push(reply);
              } else {
                if (isTargetReply) {
                  console.warn(`[ConversationDB] Parent ${parentHash} in stored replies but not in replyMap - this is a bug!`);
                }
                rootReplies.push(reply);
              }
            } else {
              rootReplies.push(reply);
            }
          } else {
            rootReplies.push(reply);
          }
        }
      }
    });

    // Helper function to get the newest timestamp at any depth in a reply tree
    function getNewestTimestampInTree(reply: any): number {
      let newest = 0;
      
      function traverse(r: any) {
        const time = r.castCreatedAt 
          ? new Date(r.castCreatedAt).getTime() 
          : (r.timestamp ? new Date(r.timestamp).getTime() : (r.created_at ? new Date(r.created_at).getTime() : 0));
        if (time > newest) {
          newest = time;
        }
        if (r.children && r.children.length > 0) {
          r.children.forEach(traverse);
        }
      }
      
      traverse(reply);
      return newest;
    }

    // Sort root replies based on sortBy parameter
    if (sortBy === "newest") {
      // Sort by the newest reply at any depth within each thread (most recent first)
      rootReplies.sort((a, b) => {
        const aTime = getNewestTimestampInTree(a);
        const bTime = getNewestTimestampInTree(b);
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

    // Count total replies in tree (including nested)
    function countRepliesInTree(replies: any[]): number {
      let count = 0;
      for (const reply of replies) {
        count++;
        if (reply.children && reply.children.length > 0) {
          count += countRepliesInTree(reply.children);
        }
      }
      return count;
    }
    const repliesInTree = countRepliesInTree(rootReplies);
    
    console.log(`[ConversationDB] Built conversation tree: ${rootReplies.length} root replies, ${repliesInTree} total replies in tree (from ${filteredReplies.length} stored replies, ${skippedCount} skipped during tree building)`);
    
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

