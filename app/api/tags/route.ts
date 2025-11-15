import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { castTags, users, curatedCasts } from "@/lib/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { isAdmin, getUserRoles } from "@/lib/roles";
import { neynarClient } from "@/lib/neynar";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const castHash = searchParams.get("castHash");
    const tag = searchParams.get("tag");

    // Get tags for a specific cast
    if (castHash) {
      const tags = await db
        .select({
          id: castTags.id,
          tag: castTags.tag,
          adminFid: castTags.adminFid,
          createdAt: castTags.createdAt,
        })
        .from(castTags)
        .where(eq(castTags.castHash, castHash))
        .orderBy(castTags.createdAt);

      return NextResponse.json({ tags });
    }

    // Get all casts with a specific tag
    if (tag) {
      const viewerFid = searchParams.get("viewerFid") ? parseInt(searchParams.get("viewerFid")!) : undefined;
      
      const tagResults = await db
        .select({
          castHash: castTags.castHash,
          tag: castTags.tag,
          adminFid: castTags.adminFid,
          createdAt: castTags.createdAt,
        })
        .from(castTags)
        .where(eq(castTags.tag, tag))
        .orderBy(castTags.createdAt);

      const castHashes = tagResults.map(r => r.castHash);
      
      // Fetch cast data from curated_casts table first
      const curatedCastsData = await db
        .select({
          castHash: curatedCasts.castHash,
          castData: curatedCasts.castData,
        })
        .from(curatedCasts)
        .where(inArray(curatedCasts.castHash, castHashes));

      const castDataMap = new Map(curatedCastsData.map(c => [c.castHash, c.castData]));
      
      // Fetch missing casts from Neynar
      const missingHashes = castHashes.filter(hash => !castDataMap.has(hash));
      let neynarCasts: any[] = [];
      
      if (missingHashes.length > 0) {
        try {
          const neynarResponse = await neynarClient.fetchBulkCasts({
            casts: missingHashes,
            viewerFid,
          });
          neynarCasts = neynarResponse.result?.casts || [];
        } catch (error) {
          console.error("Failed to fetch casts from Neynar:", error);
        }
      }

      // Combine casts from database and Neynar
      const allCasts = [
        ...curatedCastsData.map(c => c.castData),
        ...neynarCasts,
      ];

      return NextResponse.json({ 
        casts: allCasts,
        tagInfo: tagResults,
      });
    }

    // Get all tags with counts
    const tagCounts = await db
      .select({
        tag: castTags.tag,
        count: sql<number>`count(*)::int`,
      })
      .from(castTags)
      .groupBy(castTags.tag)
      .orderBy(castTags.tag);

    return NextResponse.json({ tags: tagCounts });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Tags API error:", err.message || err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch tags" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { castHash, tag, adminFid } = body;

    if (!castHash || !tag || !adminFid) {
      return NextResponse.json(
        { error: "castHash, tag, and adminFid are required" },
        { status: 400 }
      );
    }

    // Check if user has admin/superadmin role
    const user = await db.select().from(users).where(eq(users.fid, adminFid)).limit(1);
    if (user.length === 0) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }
    const roles = await getUserRoles(adminFid);
    if (!isAdmin(roles)) {
      return NextResponse.json(
        { error: "User does not have admin or superadmin role" },
        { status: 403 }
      );
    }

    // Check if tag already exists for this cast
    const existingTag = await db
      .select()
      .from(castTags)
      .where(and(eq(castTags.castHash, castHash), eq(castTags.tag, tag)))
      .limit(1);

    if (existingTag.length > 0) {
      return NextResponse.json(
        { error: "Tag already exists for this cast" },
        { status: 409 }
      );
    }

    // Add tag
    const [newTag] = await db
      .insert(castTags)
      .values({
        castHash,
        tag,
        adminFid,
      })
      .returning();

    return NextResponse.json({ tag: newTag });
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string };
    console.error("Add tag API error:", err.message || err);
    
    // Handle unique constraint violation
    if (err.code === "23505") {
      return NextResponse.json(
        { error: "Tag already exists for this cast" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: err.message || "Failed to add tag" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const castHash = searchParams.get("castHash");
    const tag = searchParams.get("tag");
    const adminFid = searchParams.get("adminFid") ? parseInt(searchParams.get("adminFid")!) : undefined;

    if (!castHash || !tag || !adminFid) {
      return NextResponse.json(
        { error: "castHash, tag, and adminFid are required" },
        { status: 400 }
      );
    }

    // Check if user has admin/superadmin role
    const user = await db.select().from(users).where(eq(users.fid, adminFid)).limit(1);
    if (user.length === 0) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }
    const roles = await getUserRoles(adminFid);
    if (!isAdmin(roles)) {
      return NextResponse.json(
        { error: "User does not have admin or superadmin role" },
        { status: 403 }
      );
    }

    // Remove tag
    await db
      .delete(castTags)
      .where(and(eq(castTags.castHash, castHash), eq(castTags.tag, tag)));

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Remove tag API error:", err.message || err);
    return NextResponse.json(
      { error: err.message || "Failed to remove tag" },
      { status: 500 }
    );
  }
}

