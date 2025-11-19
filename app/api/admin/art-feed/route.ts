import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { isAdmin, getUserRoles } from "@/lib/roles";
import { neynarClient } from "@/lib/neynar";
import { FetchFeedFeedTypeEnum, FetchFeedFilterTypeEnum } from "@neynar/nodejs-sdk/build/api";
import { deduplicateRequest } from "@/lib/neynar-batch";

// Extract image URL from embed (reused from CastCard.tsx logic)
function extractImageUrl(embed: any): { imageUrl: string | null; linkUrl: string } {
  let imageUrl = embed.url;
  const linkUrl = embed.url;
  
  // Check if this is an X/Twitter link
  let isXEmbed = false;
  try {
    if (embed.url) {
      const urlObj = new URL(embed.url);
      isXEmbed = urlObj.hostname === 'x.com' || urlObj.hostname === 'twitter.com' || urlObj.hostname === 'www.twitter.com' || urlObj.hostname === 'www.x.com';
    }
  } catch {
    // Invalid URL, skip
  }
  
  if (embed.metadata) {
    const metadata = embed.metadata;
    if (metadata.image || (metadata.content_type && metadata.content_type.startsWith('image/'))) {
      imageUrl = embed.url;
      // Check if it's a Twitter emoji SVG (only for X/Twitter links)
      if (isXEmbed && imageUrl && (imageUrl.includes('twimg.com/emoji') || imageUrl.includes('/svg/'))) {
        imageUrl = null;
      }
    } else {
      if (metadata.html?.ogImage) {
        const ogImages = Array.isArray(metadata.html.ogImage) ? metadata.html.ogImage : [metadata.html.ogImage];
        const nonEmojiImage = ogImages.find((img: any) => {
          if (!img.url) return false;
          if (img.type === 'svg') return false;
          // Only filter emoji for X/Twitter links
          if (isXEmbed && (img.url.includes('twimg.com/emoji') || img.url.includes('/svg/'))) return false;
          return true;
        });
        if (nonEmojiImage) imageUrl = nonEmojiImage.url;
      }
      if (!imageUrl && metadata.image) {
        const img = typeof metadata.image === 'string' ? metadata.image : metadata.image?.url || null;
        // Filter out Twitter emoji SVGs (only for X/Twitter links)
        if (img && (!isXEmbed || (!img.includes('twimg.com/emoji') && !img.includes('/svg/')))) {
          imageUrl = img;
        }
      }
      if (!imageUrl && metadata.ogImage) {
        const ogImg = Array.isArray(metadata.ogImage) ? metadata.ogImage[0] : metadata.ogImage;
        const img = typeof ogImg === 'string' ? ogImg : ogImg?.url || null;
        // Filter out Twitter emoji SVGs (only for X/Twitter links)
        if (img && (!isXEmbed || (!img.includes('twimg.com/emoji') && !img.includes('/svg/')))) {
          imageUrl = img;
        }
      }
    }
  }
  
  // Final check: filter out Twitter emoji SVGs (only for X/Twitter links)
  if (isXEmbed && imageUrl && (imageUrl.includes('twimg.com/emoji') || imageUrl.includes('/svg/'))) {
    imageUrl = null;
  }
  
  return { imageUrl, linkUrl };
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const adminFid = searchParams.get("adminFid");
    const fidParam = searchParams.get("fid");
    const username = searchParams.get("username");
    const cursor = searchParams.get("cursor") || undefined;
    const limit = parseInt(searchParams.get("limit") || "25");
    const viewerFid = searchParams.get("viewerFid")
      ? parseInt(searchParams.get("viewerFid")!)
      : undefined;

    // Check admin access
    if (!adminFid) {
      return NextResponse.json(
        { error: "adminFid is required" },
        { status: 400 }
      );
    }

    const adminFidNum = parseInt(adminFid);
    if (isNaN(adminFidNum)) {
      return NextResponse.json(
        { error: "Invalid adminFid" },
        { status: 400 }
      );
    }

    // Verify admin status
    const adminUser = await db.select().from(users).where(eq(users.fid, adminFidNum)).limit(1);
    if (adminUser.length === 0) {
      return NextResponse.json(
        { error: "Admin user not found" },
        { status: 404 }
      );
    }
    const roles = await getUserRoles(adminFidNum);
    if (!isAdmin(roles)) {
      return NextResponse.json(
        { error: "User does not have admin or superadmin role" },
        { status: 403 }
      );
    }

    // Resolve FID from username if needed
    let fid: number;
    if (fidParam) {
      fid = parseInt(fidParam);
      if (isNaN(fid)) {
        return NextResponse.json(
          { error: "Invalid fid" },
          { status: 400 }
        );
      }
    } else if (username) {
      // Search for user by username
      const cleanUsername = username.replace(/^@/, ''); // Remove @ if present
      try {
        const searchResult = await neynarClient.searchUser({
          q: cleanUsername,
          limit: 1,
        });
        const foundUser = searchResult.result?.users?.[0];
        if (!foundUser) {
          return NextResponse.json(
            { error: "User not found" },
            { status: 404 }
          );
        }
        fid = foundUser.fid;
      } catch (error: any) {
        return NextResponse.json(
          { error: error.message || "Failed to search user" },
          { status: 500 }
        );
      }
    } else {
      return NextResponse.json(
        { error: "Either fid or username is required" },
        { status: 400 }
      );
    }

    // Fetch user casts using feed API filtered by FID
    const feed = await deduplicateRequest(
      `art-feed-${fid}-${viewerFid || "none"}-${cursor || "initial"}-${limit}`,
      async () => {
        return await neynarClient.fetchFeed({
          feedType: FetchFeedFeedTypeEnum.Filter,
          filterType: FetchFeedFilterTypeEnum.Fids,
          fids: [fid],
          limit: Math.min(limit, 100),
          ...(cursor ? { cursor } : {}),
          withRecasts: false, // Only parent casts, no recasts
          ...(viewerFid ? { viewerFid } : {}),
        });
      }
    );

    // Filter to only parent casts (no replies, no recasts) and extract images
    const images: Array<{
      imageUrl: string;
      linkUrl: string;
      castHash: string;
      castText?: string;
      castAuthor?: {
        fid: number;
        username?: string;
        displayName?: string;
      };
    }> = [];

    for (const cast of feed.casts || []) {
      // Only include casts without parent_hash (parent casts)
      if (cast.parent_hash) continue;

      // Extract images from embeds
      if (cast.embeds && Array.isArray(cast.embeds)) {
        for (const embed of cast.embeds) {
          const { imageUrl, linkUrl } = extractImageUrl(embed);
          if (imageUrl) {
            images.push({
              imageUrl,
              linkUrl,
              castHash: cast.hash,
              castText: cast.text,
              castAuthor: cast.author ? {
                fid: cast.author.fid,
                username: cast.author.username,
                displayName: cast.author.display_name,
              } : undefined,
            });
          }
        }
      }
    }

    return NextResponse.json({
      images,
      next: feed.next ? { cursor: feed.next.cursor } : null,
      hasMore: !!feed.next,
    });
  } catch (error: any) {
    console.error("Error fetching art feed:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch art feed" },
      { status: 500 }
    );
  }
}



