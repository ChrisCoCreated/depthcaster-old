import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { collections, users } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { hasCollectionsOrAdminRole, getUserRoles } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const body = await request.json();
    const { adminFid, displayName, description, accessType, gatedUserId, gatingRule, displayType, autoCurationEnabled, autoCurationRules, displayMode, headerConfig, hiddenEmbedUrls, orderMode, orderDirection } = body;

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

    const existing = await db.select().from(collections).where(eq(collections.name, name)).limit(1);
    if (existing.length === 0) {
      return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    }

    // Allow editing if user is the creator OR has collector/admin role
    const isCreator = existing[0].creatorFid === adminFidNum;
    const roles = await getUserRoles(adminFidNum);
    const hasRole = hasCollectionsOrAdminRole(roles);
    
    if (!isCreator && !hasRole) {
      return NextResponse.json({ error: "User does not have permission to edit this collection" }, { status: 403 });
    }

    if (accessType && !["open", "gated_user", "gated_rule"].includes(accessType)) {
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

    const updateData: any = { updatedAt: new Date() };
    if (displayName !== undefined) updateData.displayName = displayName;
    if (description !== undefined) updateData.description = description;
    if (accessType !== undefined) updateData.accessType = accessType;
    if (gatedUserId !== undefined) updateData.gatedUserId = gatedUserId;
    if (gatingRule !== undefined) updateData.gatingRule = gatingRule;
    if (displayType !== undefined) updateData.displayType = displayType;
    if (autoCurationEnabled !== undefined) updateData.autoCurationEnabled = autoCurationEnabled;
    if (autoCurationRules !== undefined) updateData.autoCurationRules = autoCurationRules;
    if (displayMode !== undefined) updateData.displayMode = displayMode;
    if (headerConfig !== undefined) updateData.headerConfig = headerConfig;
    if (hiddenEmbedUrls !== undefined) updateData.hiddenEmbedUrls = hiddenEmbedUrls;
    if (orderMode !== undefined) updateData.orderMode = orderMode;
    if (orderDirection !== undefined) updateData.orderDirection = orderDirection;

    const updated = await db.update(collections).set(updateData).where(eq(collections.name, name)).returning();
    return NextResponse.json({ collection: updated[0] });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Collections PUT API error:", err.message || err);
    return NextResponse.json({ error: err.message || "Failed to update collection" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const searchParams = request.nextUrl.searchParams;
    const adminFid = searchParams.get("adminFid");

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
      return NextResponse.json({ error: "User does not have admin, superadmin, or collector role" }, { status: 403 });
    }

    const existing = await db.select().from(collections).where(eq(collections.name, name)).limit(1);
    if (existing.length === 0) {
      return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    }

    await db.delete(collections).where(eq(collections.name, name));
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Collections DELETE API error:", err.message || err);
    return NextResponse.json({ error: err.message || "Failed to delete collection" }, { status: 500 });
  }
}
