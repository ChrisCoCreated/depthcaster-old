import { NextRequest, NextResponse } from "next/server";
import { neynarClient } from "@/lib/neynar";
import { NotificationType } from "@neynar/nodejs-sdk/build/api";
import { cacheNotifications, cacheNotificationCount } from "@/lib/cache";
import { db } from "@/lib/db";
import { userNotifications } from "@/lib/schema";
import { eq, and, like, sql } from "drizzle-orm";
import { getUserRoles, hasCuratorOrAdminRole, hasPlusRole } from "@/lib/roles";

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

    // Fetch user roles to check for curator and plus roles
    let userRoles: string[] = [];
    let isCurator = false;
    let hasPlus = false;
    if (userFid) {
      userRoles = await getUserRoles(userFid);
      isCurator = hasCuratorOrAdminRole(userRoles);
      hasPlus = hasPlusRole(userRoles);
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

    // Handle database-stored curated notifications (only if user has curator role)
    if (userFid && isCurator) {
      if (castHash && notificationType && String(notificationType).startsWith("curated.")) {
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
      } else if (!castHash && !notificationType) {
        // When panel opens (no specific notification), mark all unread curated notifications as read
        await db
          .update(userNotifications)
          .set({ isRead: true })
          .where(
            and(
              eq(userNotifications.userFid, userFid),
              eq(userNotifications.isRead, false),
              like(userNotifications.type, "curated.%")
            )
          );
      }
    }
    
    // Invalidate count cache for this user (regardless of roles)
    if (userFid) {
      cacheNotificationCount.invalidateUser(userFid);
    }

    // Check if there are any unread curated notifications before calling Neynar API
    // This avoids unnecessary CU usage when there are no unread notifications
    let hasUnreadCurated = false;
    if (userFid && isCurator && !castHash && !notificationType) {
      // Only check if we're opening the panel (not marking a specific notification)
      const unreadCuratedResult = await db
        .select({ count: sql<number>`count(*)::int`.as("count") })
        .from(userNotifications)
        .where(
          and(
            eq(userNotifications.userFid, userFid),
            eq(userNotifications.isRead, false),
            like(userNotifications.type, "curated.%")
          )
        );
      hasUnreadCurated = (unreadCuratedResult[0]?.count || 0) > 0;
    }

    // Only call Neynar API if user has plus role
    // If user has plus role AND curator role: call Neynar API if specific notificationType requested OR there are unread curated notifications
    // If user has plus role BUT NOT curator role: call Neynar API if specific notificationType requested (for regular Neynar notifications)
    // If user does NOT have plus role: skip Neynar API call entirely
    let result = null;
    if (hasPlus) {
      const shouldCallNeynar = 
        notificationType !== undefined || // Specific notification type requested
        (isCurator && hasUnreadCurated); // Curator with unread curated notifications
      
      if (shouldCallNeynar) {
        // Mark Neynar notifications as seen (for non-curated types)
        result = await neynarClient.markNotificationsAsSeen({
          signerUuid,
          type: mappedType,
        });
      }
    }

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

