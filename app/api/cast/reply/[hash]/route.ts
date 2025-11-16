import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { castReplies } from "@/lib/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { isAdmin, getUserRoles } from "@/lib/roles";
import { removeReplyFromUnifiedReplyWebhook } from "@/lib/webhooks-unified";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ hash: string }> }
) {
  try {
    const { hash } = await params;
    const replyHash = hash;
    
    if (!replyHash) {
      return NextResponse.json(
        { error: "Reply hash is required" },
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

    // Normalize the hash (trim) to handle any whitespace differences
    const trimmedHash = replyHash.trim();
    
    // Check if reply exists using case-insensitive comparison
    // This handles cases where the hash might be stored with different casing
    const existingReply = await db
      .select()
      .from(castReplies)
      .where(
        sql`LOWER(${castReplies.replyCastHash}) = LOWER(${trimmedHash})`
      )
      .limit(1);

    if (existingReply.length === 0) {
      console.error(`[Delete Reply] Reply not found for hash: ${replyHash} (trimmed: ${trimmedHash})`);
      return NextResponse.json(
        { error: "Reply not found" },
        { status: 404 }
      );
    }
    
    // Use the actual hash from the database for consistency
    const actualReplyHash = existingReply[0].replyCastHash;

    // Recursively find all descendant replies (children, grandchildren, etc.)
    // Use the actual hash from the database
    const allDescendantHashes = new Set<string>([actualReplyHash]);
    let currentLevelHashes = [actualReplyHash];
    
    // Traverse the reply tree level by level until no more children are found
    while (currentLevelHashes.length > 0) {
      const childReplies = await db
        .select({ replyCastHash: castReplies.replyCastHash })
        .from(castReplies)
        .where(inArray(castReplies.parentCastHash, currentLevelHashes));

      const childHashes = childReplies
        .map((row) => row.replyCastHash)
        .filter((hash): hash is string => Boolean(hash) && !allDescendantHashes.has(hash));

      // Add new children to the set and continue to next level
      childHashes.forEach((hash) => allDescendantHashes.add(hash));
      currentLevelHashes = childHashes;
    }

    // Delete the reply and all its descendants from the database
    const hashesToDelete = Array.from(allDescendantHashes);
    await db.delete(castReplies).where(inArray(castReplies.replyCastHash, hashesToDelete));

    // Remove the reply and all its descendants from the unified webhook
    try {
      await removeReplyFromUnifiedReplyWebhook(actualReplyHash);
    } catch (webhookError) {
      console.error(`Error removing reply ${actualReplyHash} from unified webhook:`, webhookError);
      // Continue even if webhook update fails
    }

    return NextResponse.json({ 
      success: true, 
      message: "Reply deleted successfully" 
    });
  } catch (error: any) {
    console.error("Delete reply API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete reply" },
      { status: 500 }
    );
  }
}

