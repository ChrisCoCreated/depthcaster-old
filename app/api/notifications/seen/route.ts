import { NextRequest, NextResponse } from "next/server";
import { neynarClient } from "@/lib/neynar";
import { NotificationType } from "@neynar/nodejs-sdk/build/api";
import { cacheNotifications, cacheNotificationCount } from "@/lib/cache";
import { db } from "@/lib/db";
import { userNotifications } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { signerUuid, notificationType, fid, castHash } = body;

    if (!signerUuid) {
      return NextResponse.json(
        { error: "signerUuid is required" },
        { status: 400 }
      );
    }

    // Get user FID if provided (needed for cache invalidation)
    // If not provided, we'll still invalidate count cache but can't target specific user
    let userFid: number | null = null;
    if (fid) {
      userFid = parseInt(fid);
    }

    // Map notification type to enum if provided
    let mappedType: NotificationType | undefined;
    if (notificationType) {
      const normalized = notificationType.toLowerCase();
      switch (normalized) {
        case "follows":
          mappedType = NotificationType.Follows;
          break;
        case "recasts":
          mappedType = NotificationType.Recasts;
          break;
        case "likes":
          mappedType = NotificationType.Likes;
          break;
        case "mentions":
        case "mention":
          mappedType = NotificationType.Mentions;
          break;
        case "replies":
        case "reply":
          mappedType = NotificationType.Replies;
          break;
        case "quotes":
        case "quote":
          mappedType = NotificationType.Quotes;
          break;
        default:
          mappedType = notificationType as NotificationType;
      }
    }

    // Handle database-stored curated notifications
    if (castHash && userFid && notificationType && String(notificationType).startsWith("curated.")) {
      // Mark the specific curated notification as read in the database
      await db
        .update(userNotifications)
        .set({ isRead: true })
        .where(
          and(
            eq(userNotifications.userFid, userFid),
            eq(userNotifications.castHash, castHash),
            eq(userNotifications.type, String(notificationType))
          )
        );
      
      // Invalidate count cache for this user
      if (userFid) {
        cacheNotificationCount.invalidateUser(userFid);
      }
    }

    // Mark Neynar notifications as seen (for non-curated types)
    const result = await neynarClient.markNotificationsAsSeen({
      signerUuid,
      type: mappedType,
    });

    // Invalidate only this user's cache entries instead of clearing all
    if (userFid) {
      cacheNotificationCount.invalidateUser(userFid);
      // Note: cacheNotifications.invalidateUser is a placeholder for now
      // In a production system, you'd maintain a map of fid -> cache keys
      // For now, we rely on TTL expiration for notification cache
      // The count cache is properly invalidated above
    } else {
      // Fallback: if we can't determine user, clear count cache but not full notifications
      // This is safer than clearing everything
      cacheNotificationCount.clear();
    }

    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    console.error("Mark notifications as seen API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to mark notifications as seen" },
      { status: 500 }
    );
  }
}

