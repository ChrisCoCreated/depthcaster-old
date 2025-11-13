import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { userWatches } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { refreshUserWatchWebhook, getWatchedFids } from "@/lib/webhooks";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { watcherFid, watchedFid } = body;

    if (!watcherFid || !watchedFid) {
      return NextResponse.json(
        { error: "watcherFid and watchedFid are required" },
        { status: 400 }
      );
    }

    // Check if watch already exists
    const existing = await db
      .select()
      .from(userWatches)
      .where(
        and(
          eq(userWatches.watcherFid, watcherFid),
          eq(userWatches.watchedFid, watchedFid)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json({
        success: true,
        message: "User already being watched",
        watch: existing[0],
      });
    }

    // Create watch relationship
    const [watch] = await db
      .insert(userWatches)
      .values({
        watcherFid,
        watchedFid,
      })
      .returning();

    // Refresh webhook to include new watched user
    await refreshUserWatchWebhook(watcherFid);

    return NextResponse.json({
      success: true,
      watch,
    });
  } catch (error: unknown) {
    console.error("Add user watch error:", error);
    const err = error as { code?: string; message?: string };
    
    // Handle unique constraint violation
    if (err.code === "23505" || err.message?.includes("unique")) {
      return NextResponse.json(
        { error: "User is already being watched" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: err.message || "Failed to add user watch" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const watcherFid = searchParams.get("watcherFid");
    const watchedFid = searchParams.get("watchedFid");

    if (!watcherFid || !watchedFid) {
      return NextResponse.json(
        { error: "watcherFid and watchedFid are required" },
        { status: 400 }
      );
    }

    // Delete watch relationship
    const deleted = await db
      .delete(userWatches)
      .where(
        and(
          eq(userWatches.watcherFid, parseInt(watcherFid)),
          eq(userWatches.watchedFid, parseInt(watchedFid))
        )
      )
      .returning();

    if (deleted.length === 0) {
      return NextResponse.json(
        { error: "Watch relationship not found" },
        { status: 404 }
      );
    }

    // Refresh webhook to remove watched user
    await refreshUserWatchWebhook(parseInt(watcherFid));

    return NextResponse.json({
      success: true,
      message: "User watch removed",
    });
  } catch (error: unknown) {
    console.error("Remove user watch error:", error);
    const err = error as { message?: string };
    return NextResponse.json(
      { error: err.message || "Failed to remove user watch" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const watcherFid = searchParams.get("watcherFid");

    if (!watcherFid) {
      return NextResponse.json(
        { error: "watcherFid is required" },
        { status: 400 }
      );
    }

    const watchedFids = await getWatchedFids(parseInt(watcherFid));

    return NextResponse.json({
      success: true,
      watchedFids,
    });
  } catch (error: unknown) {
    console.error("Get watched users error:", error);
    const err = error as { message?: string };
    return NextResponse.json(
      { error: err.message || "Failed to get watched users" },
      { status: 500 }
    );
  }
}




