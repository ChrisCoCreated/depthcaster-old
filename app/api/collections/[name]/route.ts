import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { collections, collectionCasts, curatedCasts } from "@/lib/schema";
import { eq, and, desc, asc, lt, inArray, sql } from "drizzle-orm";
import { enrichCastsWithViewerContext } from "@/lib/interactions";
import { Cast } from "@neynar/nodejs-sdk/build/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hasImageEmbeds(castData: any): boolean {
  if (!castData?.embeds || !Array.isArray(castData.embeds)) {
    return false;
  }

  for (const embed of castData.embeds) {
    if (embed.metadata?.image || (embed.metadata?.content_type && embed.metadata.content_type.startsWith('image/'))) {
      return true;
    }
    
    if (embed.url && embed.metadata?.html?.ogImage) {
      const ogImages = Array.isArray(embed.metadata.html.ogImage) 
        ? embed.metadata.html.ogImage 
        : [embed.metadata.html.ogImage];
      const hasNonEmojiImage = ogImages.some((img: any) => {
        if (!img.url) return false;
        if (img.type === 'svg') return false;
        if (img.url.includes('twimg.com/emoji') || img.url.includes('/svg/')) return false;
        return true;
      });
      if (hasNonEmojiImage) return true;
    }
  }

  return false;
}

/**
 * Normalize a cast hash for comparison (handle 0x prefix, case-insensitive)
 */
function normalizeCastHash(hash: string): string {
  if (!hash) return '';
  const trimmed = hash.trim();
  // Remove 0x prefix if present, then add it back for consistent comparison
  const withoutPrefix = trimmed.startsWith('0x') || trimmed.startsWith('0X') 
    ? trimmed.slice(2) 
    : trimmed;
  return '0x' + withoutPrefix.toLowerCase();
}

/**
 * Check if a string is a cast hash (hex string, optionally with 0x prefix)
 */
function isCastHash(str: string): boolean {
  if (!str || typeof str !== 'string') return false;
  const trimmed = str.trim();
  const withoutPrefix = trimmed.startsWith('0x') || trimmed.startsWith('0X') 
    ? trimmed.slice(2) 
    : trimmed;
  // Check if it's a valid hex string (at least 1 character, only hex digits)
  return /^[a-fA-F0-9]+$/.test(withoutPrefix) && withoutPrefix.length > 0;
}

/**
 * Check if an embed should be hidden based on hidden URLs or cast hashes
 */
function shouldHideEmbed(embed: any, hiddenItems: string[]): boolean {
  if (!embed || !hiddenItems || hiddenItems.length === 0) {
    return false;
  }
  
  // Check if this is a cast embed
  const castHash = embed.cast_id?.hash || embed.cast?.hash;
  
  // Check if this is a URL embed
  const embedUrl = embed.url;
  
  for (const hiddenItem of hiddenItems) {
    if (typeof hiddenItem !== 'string') continue;
    
    const trimmed = hiddenItem.trim();
    if (!trimmed) continue;
    
    // Check if hidden item is a cast hash
    if (isCastHash(trimmed)) {
      if (castHash) {
        const normalizedEmbedHash = normalizeCastHash(castHash);
        const normalizedHiddenHash = normalizeCastHash(trimmed);
        if (normalizedEmbedHash === normalizedHiddenHash) {
          return true;
        }
      }
      continue; // Skip URL matching for cast hashes
    }
    
    // Otherwise, treat as URL and check URL matching
    if (embedUrl) {
      const normalizedEmbedUrl = embedUrl.toLowerCase().trim();
      const normalizedHidden = trimmed.toLowerCase().trim();
      
      const cleanEmbed = normalizedEmbedUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
      const cleanHidden = normalizedHidden.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
      
      if (cleanEmbed === cleanHidden) {
        return true;
      }
      
      if (normalizedEmbedUrl.includes(cleanHidden)) {
        return true;
      }
    }
  }
  
  return false;
}

function filterHiddenEmbeds(cast: Cast, hiddenEmbedUrls: string[] | null): Cast {
  if (!hiddenEmbedUrls || hiddenEmbedUrls.length === 0 || !cast.embeds) {
    return cast;
  }
  
  const filteredEmbeds = cast.embeds.filter(embed => {
    const embedAny = embed as any;
    // Check both URL embeds and cast embeds
    return !shouldHideEmbed(embedAny, hiddenEmbedUrls);
  });
  
  return {
    ...cast,
    embeds: filteredEmbeds
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const searchParams = request.nextUrl.searchParams;
    const cursor = searchParams.get("cursor") || undefined;
    const limit = parseInt(searchParams.get("limit") || "25");
    const viewerFid = searchParams.get("viewerFid")
      ? parseInt(searchParams.get("viewerFid")!)
      : undefined;

    const collection = await db
      .select()
      .from(collections)
      .where(eq(collections.name, name))
      .limit(1);

    if (collection.length === 0) {
      return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    }

    const collectionData = collection[0];
    const orderMode = "manual" as "manual" | "auto";
    const orderDirection = "desc" as "asc" | "desc";
    
    let collectionCastsList;
    
    if (orderMode === "auto") {
      // Auto ordering: order by cast timestamp from curatedCasts
      const cursorCondition = cursor
        ? lt(curatedCasts.castCreatedAt, new Date(cursor))
        : undefined;

      collectionCastsList = await db
        .select({
          castHash: collectionCasts.castHash,
          curatorFid: collectionCasts.curatorFid,
          createdAt: collectionCasts.createdAt,
          order: collectionCasts.order,
        })
        .from(collectionCasts)
        .innerJoin(curatedCasts, eq(collectionCasts.castHash, curatedCasts.castHash))
        .where(and(eq(collectionCasts.collectionId, collectionData.id), cursorCondition))
        .orderBy(
          orderDirection === "asc" 
            ? asc(curatedCasts.castCreatedAt)
            : desc(curatedCasts.castCreatedAt)
        )
        .limit(Math.min(limit, 100));
    } else {
      // Manual ordering: use order field, fallback to createdAt
      const cursorCondition = cursor
        ? lt(collectionCasts.createdAt, new Date(cursor))
        : undefined;

      collectionCastsList = await db
        .select({
          castHash: collectionCasts.castHash,
          curatorFid: collectionCasts.curatorFid,
          createdAt: collectionCasts.createdAt,
          order: collectionCasts.order,
        })
        .from(collectionCasts)
        .where(and(eq(collectionCasts.collectionId, collectionData.id), cursorCondition))
        .orderBy(
          sql`CASE WHEN ${collectionCasts.order} IS NULL THEN 1 ELSE 0 END`,
          asc(collectionCasts.order),
          desc(collectionCasts.createdAt)
        )
        .limit(Math.min(limit, 100));
    }

    if (collectionCastsList.length === 0) {
      return NextResponse.json({
        casts: [],
        next: null,
        collection: {
          name: collectionData.name,
          displayName: collectionData.displayName,
          description: collectionData.description,
          displayType: collectionData.displayType,
          displayMode: collectionData.displayMode,
          headerConfig: collectionData.headerConfig,
        },
      });
    }

    const castHashes = collectionCastsList.map((cc) => cc.castHash);
    const curatedCastsList = await db
      .select({
        castHash: curatedCasts.castHash,
        castData: curatedCasts.castData,
      })
      .from(curatedCasts)
      .where(inArray(curatedCasts.castHash, castHashes));

    const castDataMap = new Map<string, any>();
    curatedCastsList.forEach((cc) => {
      castDataMap.set(cc.castHash, cc.castData);
    });

    let filteredCasts: Array<{ castHash: string; curatorFid: number; createdAt: Date }> = collectionCastsList;
    
    if (collectionData.displayType === "image" || collectionData.displayType === "image-text") {
      filteredCasts = collectionCastsList.filter((cc) => {
        const castData = castDataMap.get(cc.castHash);
        return castData && hasImageEmbeds(castData);
      });
    }

    const casts: Cast[] = filteredCasts
      .map((cc) => {
        const castData = castDataMap.get(cc.castHash);
        if (!castData) return null;
        return castData as Cast;
      })
      .filter((cast): cast is Cast => cast !== null);

    const hiddenEmbedUrls = (collectionData.hiddenEmbedUrls as string[] | null) || [];
    const castsWithFilteredEmbeds = casts.map(cast => filterHiddenEmbeds(cast, hiddenEmbedUrls));

    let enrichedCasts = castsWithFilteredEmbeds;
    if (viewerFid) {
      enrichedCasts = await enrichCastsWithViewerContext(castsWithFilteredEmbeds, viewerFid);
    }

    let nextCursor: string | null = null;
    if (filteredCasts.length === limit && filteredCasts.length > 0) {
      const lastItem = filteredCasts[filteredCasts.length - 1];
      if (orderMode === "auto") {
        // For auto mode, use cast timestamp from the cast data
        const lastCastData = castDataMap.get(lastItem.castHash);
        const castTimestamp = lastCastData?.timestamp 
          ? new Date(lastCastData.timestamp)
          : lastItem.createdAt;
        nextCursor = castTimestamp.toISOString();
      } else {
        nextCursor = lastItem.createdAt.toISOString();
      }
    }

    return NextResponse.json({
      casts: enrichedCasts,
      next: nextCursor ? { cursor: nextCursor } : null,
      collection: {
        name: collectionData.name,
        displayName: collectionData.displayName,
        description: collectionData.description,
        displayType: collectionData.displayType,
        displayMode: collectionData.displayMode,
        headerConfig: collectionData.headerConfig,
      },
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Collection feed API error:", err.message || error);
    return NextResponse.json({ error: err.message || "Failed to fetch collection feed" }, { status: 500 });
  }
}
