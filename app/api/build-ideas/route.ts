import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildIdeas, users } from "@/lib/schema";
import { eq, desc, and } from "drizzle-orm";
import { isAdmin, getUserRoles } from "@/lib/roles";
import { getUser } from "@/lib/users";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get("type"); // Optional filter by type

    let allIdeas;
    if (type) {
      allIdeas = await db
        .select()
        .from(buildIdeas)
        .where(eq(buildIdeas.type, type))
        .orderBy(desc(buildIdeas.createdAt));
    } else {
      allIdeas = await db
        .select()
        .from(buildIdeas)
        .orderBy(desc(buildIdeas.createdAt));
    }

    // Fetch user information for each idea
    const ideasWithUsers = await Promise.all(
      allIdeas.map(async (idea) => {
        const user = await getUser(idea.userFid);
        return {
          ...idea,
          user: user ? {
            fid: user.fid,
            username: user.username,
            displayName: user.displayName,
            pfpUrl: user.pfpUrl,
          } : {
            fid: idea.userFid,
            username: null,
            displayName: null,
            pfpUrl: null,
          },
        };
      })
    );

    return NextResponse.json({ ideas: ideasWithUsers });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Build ideas API error:", err.message || err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch build ideas" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, description, url, castHash, type = "build-idea", userFid, adminFid } = body;

    // Support both userFid (new) and adminFid (backward compatibility)
    const fid = userFid || adminFid;

    if (!title || !fid) {
      return NextResponse.json(
        { error: "title and userFid (or adminFid) are required" },
        { status: 400 }
      );
    }

    // Verify user exists
    const user = await db.select().from(users).where(eq(users.fid, fid)).limit(1);
    if (user.length === 0) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // For build-ideas, require admin role; for feedback, any user can submit
    if (type === "build-idea") {
      const roles = await getUserRoles(fid);
      if (!isAdmin(roles)) {
        return NextResponse.json(
          { error: "User does not have admin or superadmin role" },
          { status: 403 }
        );
      }
    }

    // Extract cast hash from URL if a full URL is provided
    let extractedCastHash = castHash;
    if (castHash && type === "feedback") {
      const urlPatterns = [
        /\/cast\/(0x[a-fA-F0-9]{8,})/i,
        /warpcast\.com\/.*\/cast\/(0x[a-fA-F0-9]{8,})/i,
        /farcaster\.xyz\/[^\/]+\/(0x[a-fA-F0-9]{8,})/i,
        /base\.app\/post\/(0x[a-fA-F0-9]{8,})/i,
      ];

      for (const pattern of urlPatterns) {
        const match = castHash.match(pattern);
        if (match) {
          extractedCastHash = match[1];
          break;
        }
      }

      // If it's already a hash (starts with 0x), use it as is
      if (!extractedCastHash?.match(/^0x[a-fA-F0-9]{8,}$/i)) {
        extractedCastHash = castHash;
      }
    }

    // Create new entry
    const [newIdea] = await db
      .insert(buildIdeas)
      .values({
        title,
        description: description || null,
        url: url || null,
        castHash: extractedCastHash || null,
        type,
        userFid: fid,
      })
      .returning();

    return NextResponse.json({ idea: newIdea });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Add build idea API error:", err.message || err);
    return NextResponse.json(
      { error: err.message || "Failed to add build idea" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, title, description, url, castHash, userFid, adminFid } = body;

    // Support both userFid (new) and adminFid (backward compatibility)
    const fid = userFid || adminFid;

    if (!id || !title || !fid) {
      return NextResponse.json(
        { error: "id, title, and userFid (or adminFid) are required" },
        { status: 400 }
      );
    }

    // Check if user has admin/superadmin role (only admins can edit)
    const user = await db.select().from(users).where(eq(users.fid, fid)).limit(1);
    if (user.length === 0) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }
    const roles = await getUserRoles(fid);
    if (!isAdmin(roles)) {
      return NextResponse.json(
        { error: "User does not have admin or superadmin role" },
        { status: 403 }
      );
    }

    // Update entry
    const [updatedIdea] = await db
      .update(buildIdeas)
      .set({
        title,
        description: description || null,
        url: url || null,
        castHash: castHash || null,
        updatedAt: new Date(),
      })
      .where(eq(buildIdeas.id, id))
      .returning();

    if (!updatedIdea) {
      return NextResponse.json(
        { error: "Entry not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ idea: updatedIdea });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Update build idea API error:", err.message || err);
    return NextResponse.json(
      { error: err.message || "Failed to update build idea" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get("id");
    const userFid = searchParams.get("userFid") ? parseInt(searchParams.get("userFid")!) : undefined;
    const adminFid = searchParams.get("adminFid") ? parseInt(searchParams.get("adminFid")!) : undefined;

    // Support both userFid (new) and adminFid (backward compatibility)
    const fid = userFid || adminFid;

    if (!id || !fid) {
      return NextResponse.json(
        { error: "id and userFid (or adminFid) are required" },
        { status: 400 }
      );
    }

    // Check if user has admin/superadmin role (only admins can delete)
    const user = await db.select().from(users).where(eq(users.fid, fid)).limit(1);
    if (user.length === 0) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }
    const roles = await getUserRoles(fid);
    if (!isAdmin(roles)) {
      return NextResponse.json(
        { error: "User does not have admin or superadmin role" },
        { status: 403 }
      );
    }

    // Delete entry
    await db
      .delete(buildIdeas)
      .where(eq(buildIdeas.id, id));

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Delete build idea API error:", err.message || err);
    return NextResponse.json(
      { error: err.message || "Failed to delete build idea" },
      { status: 500 }
    );
  }
}

