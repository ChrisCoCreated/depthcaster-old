import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { curatedCasts, castReplies, curatorCastCurations, curatedCastInteractions, castTags } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { isAdmin, getUserRoles } from "@/lib/roles";
import { refreshUnifiedCuratedWebhooks } from "@/lib/webhooks-unified";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ hash: string }> }
) {
  try {
    const { hash } = await params;
    const castHash = hash;
    
    if (!castHash) {
      return NextResponse.json(
        { error: "Cast hash is required" },
        { status: 400 }
      );
    }

    // Get user FID from query params
    const searchParams = request.nextUrl.searchParams;
    const userFid = searchParams.get("fid");
    
    if (!userFid) {
      return NextResponse.json(
        { error: "User FID is required" },
        { status: 400 }
      );
    }

    const fid = parseInt(userFid);
    if (isNaN(fid)) {
      return NextResponse.json(
        { error: "Invalid FID" },
        { status: 400 }
      );
    }

    // Check if user is admin or superadmin
    const roles = await getUserRoles(fid);
    if (!isAdmin(roles)) {
      return NextResponse.json(
        { error: "Unauthorized: Admin or superadmin role required" },
        { status: 403 }
      );
    }

    // Check if cast exists
    const existingCast = await db
      .select()
      .from(curatedCasts)
      .where(eq(curatedCasts.castHash, castHash))
      .limit(1);

    if (existingCast.length === 0) {
      return NextResponse.json(
        { error: "Cast not found" },
        { status: 404 }
      );
    }

    // Delete the cast (cascading deletes will handle related records)
    // Delete in order: interactions, tags, curations, replies, then the cast
    await db.delete(curatedCastInteractions).where(eq(curatedCastInteractions.curatedCastHash, castHash));
    await db.delete(castTags).where(eq(castTags.castHash, castHash));
    await db.delete(curatorCastCurations).where(eq(curatorCastCurations.castHash, castHash));
    await db.delete(castReplies).where(eq(castReplies.curatedCastHash, castHash));
    await db.delete(curatedCasts).where(eq(curatedCasts.castHash, castHash));

    // Refresh unified webhooks to remove this cast and its children from the webhook
    try {
      await refreshUnifiedCuratedWebhooks();
      console.log(`Refreshed unified webhooks after deleting cast ${castHash}`);
    } catch (webhookError) {
      console.error(`Error refreshing unified webhooks after deleting cast ${castHash}:`, webhookError);
      // Continue even if webhook refresh fails
    }

    return NextResponse.json({ 
      success: true, 
      message: "Cast deleted successfully" 
    });
  } catch (error: any) {
    console.error("Delete cast API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete cast" },
      { status: 500 }
    );
  }
}

