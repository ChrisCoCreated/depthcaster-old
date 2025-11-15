import { NextRequest, NextResponse } from "next/server";
import { neynarClient } from "@/lib/neynar";
import { trackCuratedCastInteraction } from "@/lib/interactions";
import { LookupCastConversationTypeEnum } from "@neynar/nodejs-sdk/build/api";
import { db } from "@/lib/db";
import { curatedCasts, castReplies } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { isQuoteCast, extractQuotedCastHashes, getRootCastHash } from "@/lib/conversation";
import { meetsCastQualityThreshold } from "@/lib/cast-quality";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { signerUuid, text, parent, embeds, channelId, parentAuthorFid } = body;

    if (!signerUuid) {
      return NextResponse.json(
        { error: "signerUuid is required" },
        { status: 400 }
      );
    }

    const cast = await neynarClient.publishCast({
      signerUuid,
      text: text || "",
      parent,
      embeds,
      channelId,
      parentAuthorFid,
    });

    // Get user FID from signer
    let userFid: number | undefined;
    try {
      const signer = await neynarClient.lookupSigner({ signerUuid });
      userFid = signer.fid;
    } catch (error) {
      console.error("Error fetching signer:", error);
    }

    // Track interaction if this is a reply or quote to a curated cast thread
    if (userFid) {
      // Check if this is a quote (has embeds with cast_id)
      const isQuote = embeds?.some((embed: any) => embed.cast_id);
      
      if (isQuote && embeds) {
        // Track quote interactions for each quoted cast
        for (const embed of embeds) {
          if (embed.cast_id?.hash) {
            trackCuratedCastInteraction(embed.cast_id.hash, "quote", userFid).catch((error) => {
              console.error("Error tracking quote interaction:", error);
            });
          }
        }
      } else if (parent) {
        // Track as reply interaction
        trackCuratedCastInteraction(parent, "reply", userFid).catch((error) => {
          console.error("Error tracking reply interaction:", error);
        });
      }
    }

    // Update database if this is a reply or quote to a curated cast
    const castHash = (cast as any).hash;
    if (castHash) {
      try {
        // Fetch the full cast data from Neynar (includes reactions, etc.)
        const castResponse = await neynarClient.lookupCastConversation({
          identifier: castHash,
          type: LookupCastConversationTypeEnum.Hash,
          replyDepth: 0,
          includeChronologicalParentCasts: false,
        });
        
        const fullCastData = castResponse.conversation?.cast;
        if (!fullCastData) {
          throw new Error("Failed to fetch cast data");
        }

        const castIsQuote = isQuoteCast(fullCastData);
        
        if (castIsQuote) {
          // Handle quote cast
          const quotedCastHashes = extractQuotedCastHashes(fullCastData);
          
          for (const quotedCastHash of quotedCastHashes) {
            // Check if quoted cast is curated
            const curatedCast = await db
              .select()
              .from(curatedCasts)
              .where(eq(curatedCasts.castHash, quotedCastHash))
              .limit(1);

            if (curatedCast.length > 0) {
              // Check quality threshold
              if (meetsCastQualityThreshold(fullCastData)) {
                // Store quote cast as reply
                await db.insert(castReplies).values({
                  curatedCastHash: quotedCastHash,
                  replyCastHash: fullCastData.hash,
                  castData: fullCastData,
                  parentCastHash: fullCastData.parent_hash || null,
                  rootCastHash: quotedCastHash,
                  replyDepth: 0, // Quote casts are top-level
                  isQuoteCast: true,
                  quotedCastHash: quotedCastHash,
                }).onConflictDoNothing({ target: castReplies.replyCastHash });

                console.log(`[Cast API] Stored quote cast ${fullCastData.hash} for curated cast ${quotedCastHash}`);
              }

              // Update quoted cast data (reaction counts, etc.)
              const updatedQuotedCast = await neynarClient.lookupCastConversation({
                identifier: quotedCastHash,
                type: LookupCastConversationTypeEnum.Hash,
                replyDepth: 0,
                includeChronologicalParentCasts: false,
              });
              
              const quotedCastData = updatedQuotedCast.conversation?.cast;
              if (quotedCastData) {
                await db
                  .update(curatedCasts)
                  .set({
                    castData: quotedCastData,
                  })
                  .where(eq(curatedCasts.castHash, quotedCastHash));
              }
            }
          }
        } else if (parent) {
          // Handle regular reply
          // Find the root curated cast
          const rootHash = await getRootCastHash(parent);
          
          if (rootHash) {
            // Check if root cast is curated
            const curatedCast = await db
              .select()
              .from(curatedCasts)
              .where(eq(curatedCasts.castHash, rootHash))
              .limit(1);

            if (curatedCast.length > 0) {
              // Check quality threshold
              if (meetsCastQualityThreshold(fullCastData)) {
                // Calculate reply depth
                let replyDepth = 1;
                let currentParentHash = parent;
                
                // Traverse up to find depth
                while (currentParentHash && replyDepth < 10) {
                  const parentReply = await db
                    .select()
                    .from(castReplies)
                    .where(eq(castReplies.replyCastHash, currentParentHash))
                    .limit(1);
                  
                  if (parentReply.length > 0) {
                    replyDepth = parentReply[0].replyDepth + 1;
                    break;
                  }
                  
                  // Try to get parent from Neynar
                  try {
                    const parentRootHash = await getRootCastHash(currentParentHash);
                    if (parentRootHash === rootHash) {
                      replyDepth++;
                      break;
                    }
                  } catch (error) {
                    break;
                  }
                  
                  replyDepth++;
                  if (replyDepth >= 10) break;
                }

                // Store reply
                await db.insert(castReplies).values({
                  curatedCastHash: rootHash,
                  replyCastHash: fullCastData.hash,
                  castData: fullCastData,
                  parentCastHash: parent,
                  rootCastHash: rootHash,
                  replyDepth,
                  isQuoteCast: false,
                  quotedCastHash: null,
                }).onConflictDoNothing({ target: castReplies.replyCastHash });

                console.log(`[Cast API] Stored reply ${fullCastData.hash} for curated cast ${rootHash} at depth ${replyDepth}`);
              }

              // Update parent cast data (reaction counts, reply counts, etc.)
              const updatedRootCast = await neynarClient.lookupCastConversation({
                identifier: rootHash,
                type: LookupCastConversationTypeEnum.Hash,
                replyDepth: 0,
                includeChronologicalParentCasts: false,
              });
              
              const rootCastData = updatedRootCast.conversation?.cast;
              if (rootCastData) {
                await db
                  .update(curatedCasts)
                  .set({
                    castData: rootCastData,
                  })
                  .where(eq(curatedCasts.castHash, rootHash));
              }
            }
          }
        }
      } catch (error: any) {
        // Don't fail the cast publish if database update fails
        console.error(`[Cast API] Error updating database for cast ${castHash}:`, error);
      }
    }

    return NextResponse.json({ success: true, cast });
  } catch (error: any) {
    console.error("Cast API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to publish cast" },
      { status: 500 }
    );
  }
}

