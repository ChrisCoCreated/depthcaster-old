import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { collections, collectionCasts, curatedCasts, users } from "@/lib/schema";
import { eq, and, inArray } from "drizzle-orm";
import { neynarClient } from "@/lib/neynar";
import { FetchFeedFeedTypeEnum, FetchFeedFilterTypeEnum } from "@neynar/nodejs-sdk/build/api";
import { resolveFeedFilters } from "@/lib/customFeeds.server";
import { deduplicateRequest } from "@/lib/neynar-batch";
import { extractCastTimestamp } from "@/lib/cast-timestamp";
import { extractCastMetadata } from "@/lib/cast-metadata";
import { upsertUser } from "@/lib/users";
import type { CustomFeed } from "@/lib/customFeeds";
import { isParagraphLink } from "@/lib/paragraph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verifyCronRequest(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (authHeader && cronSecret) {
    const token = authHeader.replace("Bearer ", "");
    return token === cronSecret;
  }
  if (!cronSecret) {
    console.warn("[Auto-Curate Collections Cron] CRON_SECRET not set - allowing request (development mode)");
    return true;
  }
  return false;
}

/**
 * Check if a cast has a Paragraph post link in embeds or text
 */
function castHasParagraphPost(cast: any): boolean {
  // Check embeds for Paragraph URLs
  if (cast.embeds && Array.isArray(cast.embeds)) {
    for (const embed of cast.embeds) {
      if (embed.url && isParagraphLink(embed.url)) {
        return true;
      }
    }
  }

  // Check cast text for Paragraph URLs
  if (cast.text) {
    const urlRegex = /(https?:\/\/[^\s<>"']+)|(www\.[^\s<>"']+)/g;
    let match;
    while ((match = urlRegex.exec(cast.text)) !== null) {
      let url = match[1] || match[2];
      if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      if (url && isParagraphLink(url)) {
        return true;
      }
    }
  }

  return false;
}

function applyFilters(casts: any[], filters: any[]): any[] {
  if (!filters || filters.length === 0) {
    return casts;
  }
  return casts.filter((cast) => {
    for (const filter of filters) {
      if (filter.type === "authorFid") {
        // Handle both number and string (numeric string) FIDs
        let filterFid: number | null = null;
        if (typeof filter.value === "number") {
          filterFid = filter.value;
        } else if (typeof filter.value === "string") {
          // Try to parse numeric string
          const parsed = parseInt(filter.value, 10);
          if (!isNaN(parsed)) {
            filterFid = parsed;
          }
        }
        
        if (filterFid !== null && cast.author?.fid !== filterFid) {
          return false;
        } else if (filterFid === null) {
          // If we couldn't parse the FID, skip this filter (shouldn't happen after resolveFeedFilters)
          console.warn(`[Auto-Curate] Could not parse authorFid filter value: ${filter.value}`);
          continue;
        }
      } else if (filter.type === "excludeRecasts" && filter.value === true) {
        if (cast.parent_hash) {
          return false;
        }
      } else if (filter.type === "minLength") {
        let minLength: number | null = null;
        if (typeof filter.value === "number") {
          minLength = filter.value;
        } else if (typeof filter.value === "string") {
          const parsed = parseInt(filter.value, 10);
          if (!isNaN(parsed)) {
            minLength = parsed;
          }
        }
        if (minLength !== null && (!cast.text || cast.text.length < minLength)) {
          return false;
        }
      } else if (filter.type === "hasParagraphPost") {
        const hasParagraph = castHasParagraphPost(cast);
        // If filter value is true, only include casts with Paragraph posts
        // If filter value is false or not set, exclude casts with Paragraph posts
        if (filter.value === true && !hasParagraph) {
          return false;
        } else if (filter.value === false && hasParagraph) {
          return false;
        }
      }
    }
    return true;
  });
}

async function processCollection(collection: any): Promise<{ added: number; errors: number }> {
  const collectionId = collection.id;
  const collectionName = collection.name;
  const autoCurationRules = collection.autoCurationRules as CustomFeed | null;
  if (!autoCurationRules) {
    console.log(`[Auto-Curate] Collection ${collectionName} has no autoCurationRules, skipping`);
    return { added: 0, errors: 0 };
  }
    console.log(`[Auto-Curate] Processing collection: ${collectionName}`);
  try {
    const resolvedFeed = await resolveFeedFilters(autoCurationRules as CustomFeed);
    console.log(`[Auto-Curate] Resolved feed filters:`, JSON.stringify(resolvedFeed.filters, null, 2));
    let casts: any[] = [];
    const limit = 50;
    if (resolvedFeed.feedType === "channel") {
      const channelConfig = resolvedFeed.feedConfig as { channelId: string };
      const feed = await deduplicateRequest(
        `auto-curate-${collectionName}-${channelConfig.channelId}-${Date.now()}`,
        async () => {
          return await neynarClient.fetchFeed({
            feedType: FetchFeedFeedTypeEnum.Filter,
            filterType: FetchFeedFilterTypeEnum.ChannelId,
            channelId: channelConfig.channelId,
            limit,
            withRecasts: true,
          });
        }
      );
      casts = feed.casts || [];
    } else if (resolvedFeed.feedType === "fids") {
      const fidsConfig = resolvedFeed.feedConfig as { fids: number[] };
      const feed = await deduplicateRequest(
        `auto-curate-${collectionName}-fids-${fidsConfig.fids.join(",")}-${Date.now()}`,
        async () => {
          return await neynarClient.fetchFeed({
            feedType: FetchFeedFeedTypeEnum.Filter,
            filterType: FetchFeedFilterTypeEnum.Fids,
            fids: fidsConfig.fids,
            limit,
            withRecasts: true,
          });
        }
      );
      casts = feed.casts || [];
    } else {
      console.log(`[Auto-Curate] Unsupported feed type: ${resolvedFeed.feedType} for collection ${collectionName}`);
      return { added: 0, errors: 0 };
    }
    const castsBeforeFilter = casts.length;
    casts = applyFilters(casts, resolvedFeed.filters || []);
    console.log(`[Auto-Curate] Filtered casts: ${castsBeforeFilter} -> ${casts.length} (filters: ${resolvedFeed.filters?.length || 0})`);
    if (casts.length === 0) {
      console.log(`[Auto-Curate] No casts found matching rules for collection ${collectionName}`);
      return { added: 0, errors: 0 };
    }
    const castHashes = casts.map((cast) => cast.hash).filter(Boolean);
    const existingCollectionCasts = await db
      .select({ castHash: collectionCasts.castHash })
      .from(collectionCasts)
      .where(and(eq(collectionCasts.collectionId, collectionId), inArray(collectionCasts.castHash, castHashes)));
    const existingHashes = new Set(existingCollectionCasts.map((cc) => cc.castHash));
    const newCasts = casts.filter((cast) => !existingHashes.has(cast.hash));
    if (newCasts.length === 0) {
      console.log(`[Auto-Curate] All matching casts already in collection ${collectionName}`);
      return { added: 0, errors: 0 };
    }
    console.log(`[Auto-Curate] Found ${newCasts.length} new casts to add to collection ${collectionName}`);
    let added = 0;
    let errors = 0;
    for (const cast of newCasts) {
      try {
        const castHash = cast.hash;
        if (!castHash) continue;
        const existingCast = await db
          .select()
          .from(curatedCasts)
          .where(eq(curatedCasts.castHash, castHash))
          .limit(1);
        if (existingCast.length === 0) {
          const metadata = extractCastMetadata(cast);
          if (metadata.authorFid) {
            const authorData = cast?.author;
            await upsertUser(metadata.authorFid, {
              username: authorData?.username,
              displayName: authorData?.display_name,
              pfpUrl: authorData?.pfp_url,
            }).catch((error) => {
              console.error(`[Auto-Curate] Failed to upsert author ${metadata.authorFid}:`, error);
            });
          }
          try {
            await db.insert(curatedCasts).values({
              castHash,
              castData: cast,
              castCreatedAt: extractCastTimestamp(cast),
              curatorFid: null,
              topReplies: null,
              repliesUpdatedAt: null,
              conversationFetchedAt: null,
              castText: metadata.castText,
              castTextLength: metadata.castTextLength,
              authorFid: metadata.authorFid,
              likesCount: metadata.likesCount,
              recastsCount: metadata.recastsCount,
              repliesCount: metadata.repliesCount,
              engagementScore: metadata.engagementScore,
              parentHash: metadata.parentHash,
            });
          } catch (insertError: any) {
            if (insertError.code === "23505" || insertError.message?.includes("unique")) {
              // Cast now exists, continue
            } else {
              throw insertError;
            }
          }
        }
        try {
          await db.insert(collectionCasts).values({
            collectionId,
            castHash,
            curatorFid: collection.creatorFid,
          });
          added++;
        } catch (insertError: any) {
          if (insertError.code === "23505" || insertError.message?.includes("unique")) {
            continue;
          }
          throw insertError;
        }
      } catch (error: any) {
        console.error(`[Auto-Curate] Error adding cast ${cast.hash} to collection ${collectionName}:`, error.message || error);
        errors++;
      }
    }
    console.log(`[Auto-Curate] Collection ${collectionName}: Added ${added} casts, ${errors} errors`);
    return { added, errors };
  } catch (error: any) {
    console.error(`[Auto-Curate] Error processing collection ${collectionName}:`, error.message || error);
    return { added: 0, errors: 1 };
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!verifyCronRequest(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.log("[Auto-Curate Collections Cron] Starting auto-curation job");
    const autoCurateCollections = await db
      .select()
      .from(collections)
      .where(eq(collections.autoCurationEnabled, true));
    console.log(`[Auto-Curate Collections Cron] Found ${autoCurateCollections.length} collections with auto-curation enabled`);
    if (autoCurateCollections.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No collections with auto-curation enabled",
        collectionsProcessed: 0,
        totalAdded: 0,
        totalErrors: 0,
      });
    }
    let totalAdded = 0;
    let totalErrors = 0;
    const results: Array<{ collectionName: string; added: number; errors: number }> = [];
    for (const collection of autoCurateCollections) {
      const result = await processCollection(collection);
      totalAdded += result.added;
      totalErrors += result.errors;
      results.push({
        collectionName: collection.name,
        added: result.added,
        errors: result.errors,
      });
    }
    console.log(`[Auto-Curate Collections Cron] Completed: ${totalAdded} casts added across ${autoCurateCollections.length} collections`);
    return NextResponse.json({
      success: true,
      collectionsProcessed: autoCurateCollections.length,
      totalAdded,
      totalErrors,
      results,
    });
  } catch (error: any) {
    console.error("[Auto-Curate Collections Cron] Error:", error);
    return NextResponse.json({ error: error.message || "Failed to run auto-curation" }, { status: 500 });
  }
}
