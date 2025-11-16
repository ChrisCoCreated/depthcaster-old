import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { userWatches } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { getWatchedFids } from "@/lib/webhooks";
import { refreshUnifiedUserWatchWebhook } from "@/lib/webhooks-unified-watches";
import { getUser } from "@/lib/users";
import { neynarClient } from "@/lib/neynar";

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

    // Refresh unified webhook to include new watched user
    await refreshUnifiedUserWatchWebhook();

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

    // Refresh unified webhook to remove watched user
    await refreshUnifiedUserWatchWebhook();

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
    const includeDetails = searchParams.get("includeDetails") === "true";

    if (!watcherFid) {
      return NextResponse.json(
        { error: "watcherFid is required" },
        { status: 400 }
      );
    }

    const watchedFids = await getWatchedFids(parseInt(watcherFid));

    // If details requested, fetch user info
    if (includeDetails && watchedFids.length > 0) {
      const watches = await db
        .select()
        .from(userWatches)
        .where(eq(userWatches.watcherFid, parseInt(watcherFid)));

      const watchesWithDetails = await Promise.all(
        watches.map(async (watch) => {
          // Try database first
          const dbUser = await getUser(watch.watchedFid);
          if (dbUser) {
            return {
              id: watch.id,
              watchedFid: watch.watchedFid,
              createdAt: watch.createdAt,
              username: dbUser.username || undefined,
              displayName: dbUser.displayName || undefined,
              pfpUrl: dbUser.pfpUrl || undefined,
            };
          }

          // Fetch from Neynar
          try {
            const neynarResponse = await neynarClient.fetchBulkUsers({
              fids: [watch.watchedFid],
            });
            const neynarUser = neynarResponse.users?.[0];
            if (neynarUser) {
              return {
                id: watch.id,
                watchedFid: watch.watchedFid,
                createdAt: watch.createdAt,
                username: neynarUser.username,
                displayName: neynarUser.display_name || undefined,
                pfpUrl: neynarUser.pfp_url || undefined,
              };
            }
          } catch (error) {
            console.error(
              `Failed to fetch user ${watch.watchedFid} from Neynar:`,
              error
            );
          }

          // Fallback
          return {
            id: watch.id,
            watchedFid: watch.watchedFid,
            createdAt: watch.createdAt,
            username: undefined,
            displayName: undefined,
            pfpUrl: undefined,
          };
        })
      );

      return NextResponse.json({
        success: true,
        watches: watchesWithDetails,
      });
    }

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








