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

    // Handle database-stored notifications (curated, webhook, app.update) - for ALL users regardless of role
    if (userFid) {
      // Handle curated notifications - for ALL users regardless of role
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

      // Handle webhook notifications (cast.created) - for ALL users regardless of role
      if (castHash && notificationType && notificationType === "cast.created") {
        // Mark the specific webhook notification as read in the database
        await db
          .update(userNotifications)
          .set({ isRead: true })
          .where(
            and(
              eq(userNotifications.userFid, userFid),
              eq(userNotifications.castHash, castHash),
              eq(userNotifications.type, "cast.created")
            )
          );
      } else if (!castHash && !notificationType) {
        // When panel opens (no specific notification), mark all unread webhook notifications as read
        await db
          .update(userNotifications)
          .set({ isRead: true })
          .where(
            and(
              eq(userNotifications.userFid, userFid),
              eq(userNotifications.isRead, false),
              eq(userNotifications.type, "cast.created")
            )
          );
      }

      // Handle app.update notifications - for ALL users regardless of role
      if (castHash && notificationType && notificationType === "app.update") {
        // Mark the specific app.update notification as read in the database
        await db
          .update(userNotifications)
          .set({ isRead: true })
          .where(
            and(
              eq(userNotifications.userFid, userFid),
              eq(userNotifications.castHash, castHash),
              eq(userNotifications.type, "app.update")
            )
          );
      } else if (!castHash && !notificationType) {
        // When panel opens (no specific notification), mark all unread app.update notifications as read
        await db
          .update(userNotifications)
          .set({ isRead: true })
          .where(
            and(
              eq(userNotifications.userFid, userFid),
              eq(userNotifications.isRead, false),
              eq(userNotifications.type, "app.update")
            )
          );
      }

      // Handle feedback.new notifications - for ALL users regardless of role
      if (castHash && notificationType && notificationType === "feedback.new") {
        // Mark the specific feedback.new notification as read in the database
        await db
          .update(userNotifications)
          .set({ isRead: true })
          .where(
            and(
              eq(userNotifications.userFid, userFid),
              eq(userNotifications.castHash, castHash),
              eq(userNotifications.type, "feedback.new")
            )
          );
      } else if (!castHash && !notificationType) {
        // When panel opens (no specific notification), mark all unread feedback.new notifications as read
        await db
          .update(userNotifications)
          .set({ isRead: true })
          .where(
            and(
              eq(userNotifications.userFid, userFid),
              eq(userNotifications.isRead, false),
              eq(userNotifications.type, "feedback.new")
            )
          );
      }
    }
    
    // Invalidate count cache for this user (regardless of roles)
    if (userFid) {
      cacheNotificationCount.invalidateUser(userFid);
    }

    // Only call Neynar API if user has plus role and Neynar notifications are enabled
    // When panel opens (no notificationType), always mark all Neynar notifications as seen
    // When specific notificationType is provided, mark that specific type as seen
    let result = null;
    const neynarNotificationsEnabled = process.env.ENABLE_NEYNAR_NOTIFICATIONS === "true" || process.env.ENABLE_NEYNAR_NOTIFICATIONS === "1";
    if (hasPlus && neynarNotificationsEnabled) {
      const shouldCallNeynar = 
        notificationType !== undefined || // Specific notification type requested
        (!notificationType && !castHash); // Panel opened - mark all Neynar notifications as seen
      
      if (shouldCallNeynar) {
        // Mark Neynar notifications as seen (for non-curated types)
        result = await neynarClient.markNotificationsAsSeen({
          signerUuid,
          type: mappedType, // undefined when panel opens, which marks all types
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

