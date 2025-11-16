import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { castReplies, curatedCasts } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getRootCastHash } from "@/lib/conversation";
import { extractCastTimestamp } from "@/lib/cast-timestamp";
import { meetsCastQualityThreshold } from "@/lib/cast-quality";

// Special placeholder hash for parent casts saved for display purposes only
// These are not actual replies to curated casts, just metadata for showing parent context
const PARENT_CAST_PLACEHOLDER_HASH = "0x0000000000000000000000000000000000000000";

/**
 * Ensure the placeholder curated cast exists in the database
 * This is needed for the foreign key constraint on cast_replies.curatedCastHash
 */
async function ensurePlaceholderCuratedCast() {
  const existing = await db
    .select()
    .from(curatedCasts)
    .where(eq(curatedCasts.castHash, PARENT_CAST_PLACEHOLDER_HASH))
    .limit(1);

  if (existing.length === 0) {
    // Create placeholder curated cast entry
    const placeholderData = { hash: PARENT_CAST_PLACEHOLDER_HASH, text: "Placeholder for parent cast metadata" };
    const { extractCastMetadata } = await import("@/lib/cast-metadata");
    const metadata = extractCastMetadata(placeholderData);
    await db.insert(curatedCasts).values({
      castHash: PARENT_CAST_PLACEHOLDER_HASH,
      castData: placeholderData,
      curatorFid: null,
      castText: metadata.castText,
      castTextLength: metadata.castTextLength,
      authorFid: metadata.authorFid,
      likesCount: metadata.likesCount,
      recastsCount: metadata.recastsCount,
      repliesCount: metadata.repliesCount,
      engagementScore: metadata.engagementScore,
      parentHash: metadata.parentHash,
    }).onConflictDoNothing();
  }
}

/**
 * API endpoint to save a parent cast to the replies table
 * This is used when a quote cast has a parent that's not in the conversation tree
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { parentCastHash, parentCastData, rootCastHash } = body;

    if (!parentCastHash || !parentCastData || !rootCastHash) {
      return NextResponse.json(
        { error: "parentCastHash, parentCastData, and rootCastHash are required" },
        { status: 400 }
      );
    }

    // Verify that rootCastHash is a curated cast
    const curatedCast = await db
      .select()
      .from(curatedCasts)
      .where(eq(curatedCasts.castHash, rootCastHash))
      .limit(1);

    if (curatedCast.length === 0) {
      return NextResponse.json(
        { error: "Root cast is not curated" },
        { status: 404 }
      );
    }

    // Ensure placeholder curated cast exists
    await ensurePlaceholderCuratedCast();

    // Check if parent cast is already stored
    const existingReply = await db
      .select()
      .from(castReplies)
      .where(eq(castReplies.replyCastHash, parentCastHash))
      .limit(1);

    if (existingReply.length > 0) {
      // Already stored, return success
      return NextResponse.json({ success: true, alreadyExists: true });
    }

    // Calculate reply depth
    let replyDepth = 1;
    const parentParentHash = parentCastData.parent_hash;

    if (parentParentHash) {
      // Check if parent's parent is in the database
      const parentParentReply = await db
        .select()
        .from(castReplies)
        .where(eq(castReplies.replyCastHash, parentParentHash))
        .limit(1);

      if (parentParentReply.length > 0) {
        // Parent's parent is in database, use its depth + 1
        replyDepth = parentParentReply[0].replyDepth + 1;
      } else {
        // Check if parent's parent is the root cast
        if (parentParentHash === rootCastHash) {
          replyDepth = 1;
        } else {
          // Try to find the root cast hash for the parent's parent
          try {
            const parentParentRootHash = await getRootCastHash(parentParentHash);
            if (parentParentRootHash === rootCastHash) {
              // It's part of the thread, calculate depth by traversing
              let depth = 1;
              let currentHash = parentParentHash;
              
              while (currentHash && depth < 10) {
                if (currentHash === rootCastHash) {
                  replyDepth = depth;
                  break;
                }
                
                // Try to get parent from database
                const currentReply = await db
                  .select()
                  .from(castReplies)
                  .where(eq(castReplies.replyCastHash, currentHash))
                  .limit(1);
                
                if (currentReply.length > 0) {
                  replyDepth = currentReply[0].replyDepth + 1;
                  break;
                }
                
                // Get parent from cast data (would need to fetch, but for now use default)
                depth++;
                if (depth >= 10) break;
              }
            }
          } catch (error) {
            // Default to depth 1 if we can't determine
            console.error(`Error calculating depth for parent cast ${parentCastHash}:`, error);
            replyDepth = 1;
          }
        }
      }
    }

    // Check quality threshold before storing
    if (!meetsCastQualityThreshold(parentCastData)) {
      return NextResponse.json(
        { error: "Parent cast does not meet quality threshold" },
        { status: 400 }
      );
    }

    // Store the parent cast with placeholder curatedCastHash
    // This ensures it won't be included in queries for actual curated casts
    // We use a special placeholder hash (0x0000...) to mark these as metadata-only
    const { extractCastMetadata } = await import("@/lib/cast-metadata");
    const metadata = extractCastMetadata(parentCastData);
    await db.insert(castReplies).values({
      curatedCastHash: PARENT_CAST_PLACEHOLDER_HASH, // Use placeholder, not rootCastHash
      replyCastHash: parentCastHash,
      castData: parentCastData,
      castCreatedAt: extractCastTimestamp(parentCastData),
      parentCastHash: parentParentHash || null,
      rootCastHash: rootCastHash, // Keep rootCastHash for reference
      replyDepth,
      isQuoteCast: false,
      quotedCastHash: null,
      castText: metadata.castText,
      castTextLength: metadata.castTextLength,
      authorFid: metadata.authorFid,
      likesCount: metadata.likesCount,
      recastsCount: metadata.recastsCount,
      repliesCount: metadata.repliesCount,
      engagementScore: metadata.engagementScore,
    }).onConflictDoNothing({ target: castReplies.replyCastHash });

    return NextResponse.json({ success: true, replyDepth });
  } catch (error: any) {
    console.error("Error saving parent cast:", error);
    return NextResponse.json(
      { error: error.message || "Failed to save parent cast" },
      { status: 500 }
    );
  }
}

