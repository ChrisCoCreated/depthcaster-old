import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { collections, collectionCasts, curatedCasts, users } from "@/lib/schema";
import { eq, and, desc, lt, inArray } from "drizzle-orm";
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
    const cursorCondition = cursor
      ? lt(collectionCasts.createdAt, new Date(cursor))
      : undefined;

    const collectionCastsList = await db
      .select({
        castHash: collectionCasts.castHash,
        curatorFid: collectionCasts.curatorFid,
        createdAt: collectionCasts.createdAt,
      })
      .from(collectionCasts)
      .where(and(eq(collectionCasts.collectionId, collectionData.id), cursorCondition))
      .orderBy(desc(collectionCasts.createdAt))
      .limit(Math.min(limit, 100));

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

    let enrichedCasts = casts;
    if (viewerFid) {
      enrichedCasts = await enrichCastsWithViewerContext(casts, viewerFid);
    }

    let nextCursor: string | null = null;
    if (filteredCasts.length === limit && filteredCasts.length > 0) {
      const lastItem = filteredCasts[filteredCasts.length - 1];
      nextCursor = lastItem.createdAt.toISOString();
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
