import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { collections, users } from "@/lib/schema";
import { eq, desc } from "drizzle-orm";
import { hasCollectionsOrAdminRole, getUserRoles, isAdmin } from "@/lib/roles";
import { canUserAddToCollection } from "@/lib/collection-gating";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userFid = searchParams.get("userFid") ? parseInt(searchParams.get("userFid")!) : undefined;

    const allCollections = await db.select().from(collections).orderBy(desc(collections.createdAt));

    if (!userFid) {
      const openCollections = allCollections.filter((c) => c.accessType === "open");
      return NextResponse.json({ collections: openCollections });
    }

    const user = await db.select().from(users).where(eq(users.fid, userFid)).limit(1);
    if (user.length === 0) {
      return NextResponse.json({ collections: [] });
    }

    const roles = await getUserRoles(userFid);
    const isUserAdmin = isAdmin(roles);

    const accessibleCollections = [];
    for (const collection of allCollections) {
      if (collection.accessType === "open") {
        accessibleCollections.push(collection);
      } else if (isUserAdmin) {
        accessibleCollections.push(collection);
      } else {
        const canAccess = await canUserAddToCollection(
          collection.accessType,
          collection.gatedUserId,
          collection.gatingRule as any,
          user[0]
        );
        if (canAccess) {
          accessibleCollections.push(collection);
        }
      }
    }

    return NextResponse.json({ collections: accessibleCollections });
  } catch (error: unknown) {
    const err = error as { 
      message?: string; 
      code?: string; 
      detail?: string; 
      hint?: string; 
      cause?: any;
      stack?: string;
    };
    
    // Log comprehensive error details
    console.error("Collections GET API error:", {
      message: err.message,
      code: err.code,
      detail: err.detail,
      hint: err.hint,
      cause: err.cause,
      stack: err.stack,
      fullError: error
    });
    
    // Return detailed error message
    const errorMessage = err.detail || err.message || "Failed to fetch collections";
    return NextResponse.json({ 
      error: errorMessage,
      code: err.code,
      hint: err.hint 
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { adminFid, name, displayName, description, accessType, gatedUserId, gatingRule, displayType, autoCurationEnabled, autoCurationRules, displayMode, headerConfig, hiddenEmbedUrls, orderMode, orderDirection } = body;

    if (!adminFid) {
      return NextResponse.json({ error: "adminFid is required" }, { status: 400 });
    }

    const adminFidNum = parseInt(adminFid);
    if (isNaN(adminFidNum)) {
      return NextResponse.json({ error: "Invalid adminFid" }, { status: 400 });
    }

    const adminUser = await db.select().from(users).where(eq(users.fid, adminFidNum)).limit(1);
    if (adminUser.length === 0) {
      return NextResponse.json({ error: "Admin user not found" }, { status: 404 });
    }
    const roles = await getUserRoles(adminFidNum);
    if (!hasCollectionsOrAdminRole(roles)) {
      return NextResponse.json({ error: "User does not have admin, superadmin, or collections role" }, { status: 403 });
    }

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    if (!["open", "gated_user", "gated_rule"].includes(accessType)) {
      return NextResponse.json({ error: "Invalid accessType" }, { status: 400 });
    }

    if (displayType && !["text", "image", "image-text"].includes(displayType)) {
      return NextResponse.json({ error: "Invalid displayType" }, { status: 400 });
    }

    if (orderMode && !["manual", "auto"].includes(orderMode)) {
      return NextResponse.json({ error: "Invalid orderMode" }, { status: 400 });
    }

    if (orderDirection && !["asc", "desc"].includes(orderDirection)) {
      return NextResponse.json({ error: "Invalid orderDirection" }, { status: 400 });
    }

    // Validate hiddenEmbedUrls if provided
    if (hiddenEmbedUrls !== undefined && hiddenEmbedUrls !== null) {
      if (!Array.isArray(hiddenEmbedUrls)) {
        return NextResponse.json({ error: "hiddenEmbedUrls must be an array" }, { status: 400 });
      }
      if (!hiddenEmbedUrls.every(url => typeof url === 'string')) {
        return NextResponse.json({ error: "All items in hiddenEmbedUrls must be strings" }, { status: 400 });
      }
    }

    const existing = await db.select().from(collections).where(eq(collections.name, name)).limit(1);
    if (existing.length > 0) {
      return NextResponse.json({ error: "Collection with this name already exists" }, { status: 409 });
    }

    const newCollection = await db.insert(collections).values({
      name,
      displayName: displayName || null,
      description: description || null,
      creatorFid: adminFidNum,
      accessType,
      gatedUserId: gatedUserId || null,
      gatingRule: gatingRule || null,
      displayType: displayType || "text",
      autoCurationEnabled: autoCurationEnabled || false,
      autoCurationRules: autoCurationRules || null,
      displayMode: displayMode || null,
      headerConfig: headerConfig || null,
      hiddenEmbedUrls: hiddenEmbedUrls || null,
    }).returning();

    return NextResponse.json({ collection: newCollection[0] });
  } catch (error: unknown) {
    const err = error as { 
      code?: string; 
      message?: string;
      detail?: string;
      hint?: string;
      cause?: any;
      stack?: string;
    };
    
    // Log comprehensive error details
    console.error("Collections POST API error:", {
      message: err.message,
      code: err.code,
      detail: err.detail,
      hint: err.hint,
      cause: err.cause,
      stack: err.stack,
      fullError: error
    });
    
    if (err.code === "23505" || err.message?.includes("unique")) {
      return NextResponse.json({ error: "Collection with this name already exists" }, { status: 409 });
    }
    
    const errorMessage = err.detail || err.message || "Failed to create collection";
    return NextResponse.json({ 
      error: errorMessage,
      code: err.code,
      hint: err.hint 
    }, { status: 500 });
  }
}
