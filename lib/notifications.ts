import { db } from "./db";
import { curatorCastCurations, userNotifications, users, userRoles } from "./schema";
import { eq, and, inArray } from "drizzle-orm";
import { sendPushNotificationToUser } from "./pushNotifications";
import { getUser } from "./users";
import { cacheNotificationCount } from "./cache";

export interface NotificationPreferences {
  notifyOnQualityReply?: boolean;
  qualityReplyThreshold?: number;
  notifyOnCurated?: boolean;
  notifyOnLiked?: boolean;
  notifyOnRecast?: boolean;
}

/**
 * Get all curator FIDs for a cast
 */
export async function getCuratorsForCast(castHash: string): Promise<number[]> {
  const curations = await db
    .select({ curatorFid: curatorCastCurations.curatorFid })
    .from(curatorCastCurations)
    .where(eq(curatorCastCurations.castHash, castHash));

  return curations.map((c) => c.curatorFid);
}

/**
 * Get user notification preferences
 */
export async function getUserNotificationPreferences(fid: number): Promise<NotificationPreferences> {
  const user = await getUser(fid);
  const preferences = (user?.preferences || {}) as NotificationPreferences;

  return {
    notifyOnQualityReply: preferences.notifyOnQualityReply !== undefined ? preferences.notifyOnQualityReply : true,
    qualityReplyThreshold: preferences.qualityReplyThreshold !== undefined ? preferences.qualityReplyThreshold : 60,
    notifyOnCurated: preferences.notifyOnCurated !== undefined ? preferences.notifyOnCurated : false,
    notifyOnLiked: preferences.notifyOnLiked !== undefined ? preferences.notifyOnLiked : true,
    notifyOnRecast: preferences.notifyOnRecast !== undefined ? preferences.notifyOnRecast : false,
  };
}

/**
 * Check if curator should be notified for a specific event
 */
export async function shouldNotifyCurator(
  curatorFid: number,
  eventType: "quality_reply" | "curated" | "liked" | "recast",
  qualityScore?: number
): Promise<boolean> {
  const preferences = await getUserNotificationPreferences(curatorFid);

  switch (eventType) {
    case "quality_reply":
      if (!preferences.notifyOnQualityReply) return false;
      if (qualityScore === undefined) return false;
      return qualityScore >= (preferences.qualityReplyThreshold || 60);
    case "curated":
      return preferences.notifyOnCurated || false;
    case "liked":
      return preferences.notifyOnLiked || false;
    case "recast":
      return preferences.notifyOnRecast || false;
    default:
      return false;
  }
}

/**
 * Create a notification for a curator
 */
export async function createCuratorNotification(
  curatorFid: number,
  type: "curated.quality_reply" | "curated.curated" | "curated.liked" | "curated.recast",
  castHash: string,
  castData: any,
  authorFid: number
): Promise<void> {
  try {
    // Check for existing notification to prevent duplicates
    const existing = await db
      .select()
      .from(userNotifications)
      .where(
        and(
          eq(userNotifications.userFid, curatorFid),
          eq(userNotifications.castHash, castHash),
          eq(userNotifications.type, type)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      console.log(`[Notifications] Notification already exists for curator ${curatorFid}, cast ${castHash}, type ${type}`);
      return;
    }

    // Create notification
    await db.insert(userNotifications).values({
      userFid: curatorFid,
      type,
      castHash,
      castData,
      authorFid,
      isRead: false,
    });

    // Invalidate count cache
    cacheNotificationCount.invalidateUser(curatorFid);

    console.log(`[Notifications] Created ${type} notification for curator ${curatorFid}, cast ${castHash}`);
  } catch (error: any) {
    // Handle unique constraint violation (duplicate notification)
    if (error.code === "23505") {
      console.log(`[Notifications] Duplicate notification prevented for curator ${curatorFid}, cast ${castHash}, type ${type}`);
      return;
    }
    console.error(`[Notifications] Error creating notification for curator ${curatorFid}:`, error);
    throw error;
  }
}

/**
 * Notify curators about a quality reply
 */
export async function notifyCuratorsAboutQualityReply(
  curatedCastHash: string,
  replyCastHash: string,
  replyCastData: any,
  qualityScore: number
): Promise<void> {
  const curators = await getCuratorsForCast(curatedCastHash);
  const authorFid = replyCastData?.author?.fid;

  if (!authorFid) {
    console.log(`[Notifications] No author FID in reply data for ${replyCastHash}`);
    return;
  }

  for (const curatorFid of curators) {
    try {
      const shouldNotify = await shouldNotifyCurator(curatorFid, "quality_reply", qualityScore);
      if (!shouldNotify) {
        continue;
      }

      await createCuratorNotification(
        curatorFid,
        "curated.quality_reply",
        replyCastHash,
        replyCastData,
        authorFid
      );

      // Send push notification
      const authorName = replyCastData?.author?.display_name || replyCastData?.author?.username || "Someone";
      const replyText = replyCastData?.text || "";
      const previewText = replyText.length > 100 ? replyText.substring(0, 100) + "..." : replyText;

      await sendPushNotificationToUser(curatorFid, {
        title: "Quality reply to your curated cast",
        body: `${authorName}: ${previewText || "New quality reply"}`,
        icon: replyCastData?.author?.pfp_url || "/icon-192x192.webp",
        badge: "/icon-96x96.webp",
        data: {
          type: "curated.quality_reply",
          castHash: replyCastHash,
          curatedCastHash,
          url: `/cast/${curatedCastHash}`,
        },
      }).catch((error) => {
        console.error(`[Notifications] Error sending push notification to curator ${curatorFid}:`, error);
      });
    } catch (error) {
      console.error(`[Notifications] Error notifying curator ${curatorFid} about quality reply:`, error);
      // Continue with other curators even if one fails
    }
  }
}

/**
 * Notify existing curators when a new curator curates a cast
 */
export async function notifyCuratorsAboutNewCuration(
  castHash: string,
  castData: any,
  newCuratorFid: number
): Promise<void> {
  const curators = await getCuratorsForCast(castHash);
  // Exclude the new curator from notifications
  const existingCurators = curators.filter((fid) => fid !== newCuratorFid);

  if (existingCurators.length === 0) {
    return;
  }

  // Get new curator's name
  const newCuratorUser = await getUser(newCuratorFid);
  const newCuratorName =
    newCuratorUser?.displayName ||
    newCuratorUser?.username ||
    castData?.author?.display_name ||
    castData?.author?.username ||
    `User ${newCuratorFid}`;

  const authorFid = castData?.author?.fid || newCuratorFid;

  for (const curatorFid of existingCurators) {
    try {
      const shouldNotify = await shouldNotifyCurator(curatorFid, "curated");
      if (!shouldNotify) {
        continue;
      }

      await createCuratorNotification(
        curatorFid,
        "curated.curated",
        castHash,
        castData,
        authorFid
      );

      // Send push notification
      await sendPushNotificationToUser(curatorFid, {
        title: "Cast curated by another user",
        body: `${newCuratorName} also curated this cast`,
        icon: newCuratorUser?.pfpUrl || "/icon-192x192.webp",
        badge: "/icon-96x96.webp",
        data: {
          type: "curated.curated",
          castHash,
          newCuratorFid,
          url: `/cast/${castHash}`,
        },
      }).catch((error) => {
        console.error(`[Notifications] Error sending push notification to curator ${curatorFid}:`, error);
      });
    } catch (error) {
      console.error(`[Notifications] Error notifying curator ${curatorFid} about new curation:`, error);
      // Continue with other curators even if one fails
    }
  }
}

/**
 * Notify curators when their curated cast receives a like or recast
 */
export async function notifyCuratorsAboutInteraction(
  castHash: string,
  castData: any,
  interactionType: "liked" | "recast",
  userFid: number
): Promise<void> {
  const curators = await getCuratorsForCast(castHash);
  // Don't notify if the curator themselves is the one interacting
  const curatorsToNotify = curators.filter((fid) => fid !== userFid);

  if (curatorsToNotify.length === 0) {
    return;
  }

  // Get user's name who interacted
  const user = await getUser(userFid);
  const userName = user?.displayName || user?.username || `User ${userFid}`;

  const authorFid = castData?.author?.fid || userFid;
  const notificationType = interactionType === "liked" ? "curated.liked" : "curated.recast";

  for (const curatorFid of curatorsToNotify) {
    try {
      const shouldNotify = await shouldNotifyCurator(curatorFid, interactionType);
      if (!shouldNotify) {
        continue;
      }

      await createCuratorNotification(
        curatorFid,
        notificationType as "curated.liked" | "curated.recast",
        castHash,
        castData,
        authorFid
      );

      // Send push notification
      const title = interactionType === "liked" ? "Your curated cast was liked" : "Your curated cast was recast";
      const body =
        interactionType === "liked"
          ? `${userName} liked this cast`
          : `${userName} recast this cast`;

      await sendPushNotificationToUser(curatorFid, {
        title,
        body,
        icon: user?.pfpUrl || "/icon-192x192.webp",
        badge: "/icon-96x96.webp",
        data: {
          type: notificationType,
          castHash,
          userFid,
          url: `/cast/${castHash}`,
        },
      }).catch((error) => {
        console.error(`[Notifications] Error sending push notification to curator ${curatorFid}:`, error);
      });
    } catch (error) {
      console.error(`[Notifications] Error notifying curator ${curatorFid} about ${interactionType}:`, error);
      // Continue with other curators even if one fails
    }
  }
}

/**
 * Create an app update notification for a user
 */
export async function createAppUpdateNotification(
  userFid: number,
  title: string,
  body: string,
  url?: string,
  adminFid: number = 0
): Promise<void> {
  try {
    // Generate a unique castHash for this notification
    const timestamp = Date.now();
    const castHash = `app-update-${timestamp}-${userFid}`;

    // Check for existing notification to prevent duplicates (within same second)
    const existing = await db
      .select()
      .from(userNotifications)
      .where(
        and(
          eq(userNotifications.userFid, userFid),
          eq(userNotifications.castHash, castHash),
          eq(userNotifications.type, "app.update")
        )
      )
      .limit(1);

    if (existing.length > 0) {
      console.log(`[Notifications] App update notification already exists for user ${userFid}`);
      return;
    }

    // Create castData with notification content
    const castData = {
      title,
      body,
      url: url || "/updates",
      type: "app.update",
    };

    // Create notification
    await db.insert(userNotifications).values({
      userFid,
      type: "app.update",
      castHash,
      castData,
      authorFid: adminFid,
      isRead: false,
    });

    // Invalidate count cache
    cacheNotificationCount.invalidateUser(userFid);

    console.log(`[Notifications] Created app.update notification for user ${userFid}`);
  } catch (error: any) {
    // Handle unique constraint violation (duplicate notification)
    if (error.code === "23505") {
      console.log(`[Notifications] Duplicate app update notification prevented for user ${userFid}`);
      return;
    }
    console.error(`[Notifications] Error creating app update notification for user ${userFid}:`, error);
    throw error;
  }
}

/**
 * Send app update notifications to multiple users
 */
export async function sendAppUpdateNotificationToUsers(
  userFids: number[],
  title: string,
  body: string,
  url?: string,
  adminFid: number = 0
): Promise<{ notificationsCreated: number; pushNotificationsSent: number; errors: number }> {
  let notificationsCreated = 0;
  let pushNotificationsSent = 0;
  let errors = 0;

  // Process in batches of 50 to avoid overwhelming the system
  const batchSize = 50;
  for (let i = 0; i < userFids.length; i += batchSize) {
    const batch = userFids.slice(i, i + batchSize);

    // Create notifications in parallel
    const notificationResults = await Promise.allSettled(
      batch.map((fid) => createAppUpdateNotification(fid, title, body, url, adminFid))
    );

    // Count successes
    notificationResults.forEach((result) => {
      if (result.status === "fulfilled") {
        notificationsCreated++;
      } else {
        errors++;
        console.error(`[Notifications] Failed to create notification:`, result.reason);
      }
    });

    // Send push notifications in parallel (after notifications are created)
    const pushResults = await Promise.allSettled(
      batch.map((fid) =>
        sendPushNotificationToUser(fid, {
          title,
          body: body.length > 200 ? body.substring(0, 200) + "..." : body,
          icon: "/icon-192x192.webp",
          badge: "/icon-96x96.webp",
          data: {
            type: "app.update",
            url: url || "/",
          },
        })
      )
    );

    // Count push notification successes
    pushResults.forEach((result) => {
      if (result.status === "fulfilled") {
        pushNotificationsSent += result.value.sent;
      } else {
        // Push notification failures are less critical, just log
        console.error(`[Notifications] Failed to send push notification:`, result.reason);
      }
    });
  }

  return { notificationsCreated, pushNotificationsSent, errors };
}
