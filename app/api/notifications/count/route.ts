import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { userNotifications } from "@/lib/schema";
import { eq, and, sql } from "drizzle-orm";
import { cacheNotificationCount } from "@/lib/cache";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const fid = searchParams.get("fid");

    if (!fid) {
      return NextResponse.json(
        { error: "fid is required" },
        { status: 400 }
      );
    }

    const fidNum = parseInt(fid);
    if (isNaN(fidNum)) {
      return NextResponse.json(
        { error: "Invalid fid" },
        { status: 400 }
      );
    }

    // TEMPORARY: Block notifications for user 5406
    const BLOCKED_USER_FID = 5406;
    if (fidNum === BLOCKED_USER_FID) {
      return NextResponse.json({
        unreadCount: 0,
      });
    }

    // Check for cache-busting parameter - if present, skip cache to ensure fresh data
    const cacheBust = searchParams.get("_t");
    const shouldSkipCache = cacheBust !== null;

    // Check cache first (only if not cache-busting)
    if (!shouldSkipCache) {
      const cacheKey = cacheNotificationCount.generateKey({ fid: fidNum });
      const cachedResult = cacheNotificationCount.get(cacheKey);
      if (cachedResult !== undefined) {
        return NextResponse.json(cachedResult);
      }
    }

    // Count unread webhook notifications from database (much cheaper than API call)
    // Use SQL count for efficiency
    const unreadWebhookResult = await db
      .select({ count: sql<number>`count(*)::int`.as("count") })
      .from(userNotifications)
      .where(
        and(
          eq(userNotifications.userFid, fidNum),
          eq(userNotifications.isRead, false)
        )
      );
    
    const unreadWebhookCount = unreadWebhookResult[0]?.count || 0;

    // For Neynar notifications (follows, likes, recasts, mentions, replies, quotes),
    // we need to make a minimal API call, but we can optimize by:
    // 1. Only fetching a small limit (just to check if there are unread)
    // 2. Using aggressive caching
    // 3. For now, we'll estimate based on webhook notifications and return that
    // The full notifications endpoint will handle the actual Neynar API calls when needed

    // For now, return webhook count only to avoid API calls
    // The full notifications panel will fetch Neynar notifications when opened
    const result = {
      unreadCount: unreadWebhookCount,
      // Note: This doesn't include Neynar notifications (follows, likes, etc.)
      // Those will be fetched when the panel is opened
    };

    // Cache for 120 seconds (2 minutes) (only if not cache-busting)
    if (!shouldSkipCache) {
      const cacheKey = cacheNotificationCount.generateKey({ fid: fidNum });
      cacheNotificationCount.set(cacheKey, result);
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Notification count API error:", error);
    return NextResponse.json(
      {
        error: error.message || "Failed to fetch notification count",
      },
      { status: 500 }
    );
  }
}

