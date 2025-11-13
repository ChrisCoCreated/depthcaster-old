import { db } from "./db";
import { pushSubscriptions } from "./schema";
import { eq } from "drizzle-orm";

async function sendPushNotification(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: { title: string; body: string; icon?: string; badge?: string; data?: any }
) {
  try {
    // Dynamic import to avoid issues if web-push is not installed
    const webpush = await import("web-push");
    
    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidEmail = process.env.VAPID_EMAIL || "mailto:admin@depthcaster.app";

    if (!vapidPublicKey || !vapidPrivateKey) {
      throw new Error("VAPID keys not configured. Please set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY environment variables.");
    }

    // Set VAPID details
    webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);

    const notificationPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon || "/icon-192x192.webp",
      badge: payload.badge || "/icon-96x96.webp",
      data: payload.data || {},
    });

    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
      },
      notificationPayload
    );

    return { success: true };
  } catch (error: any) {
    console.error("Error sending push notification:", error);
    // If subscription is invalid, we might want to delete it
    if (error.statusCode === 410 || error.statusCode === 404) {
      return { success: false, shouldDelete: true };
    }
    throw error;
  }
}

export async function sendPushNotificationToUser(
  userFid: number,
  payload: { title: string; body: string; icon?: string; badge?: string; data?: any }
): Promise<{ sent: number; total: number }> {
  // Get all push subscriptions for this user
  const subscriptions = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userFid, userFid));

  if (subscriptions.length === 0) {
    return { sent: 0, total: 0 };
  }

  // Send notification to all subscriptions
  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      sendPushNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        },
        payload
      )
    )
  );

  // Check for failed subscriptions and delete invalid ones
  const invalidSubscriptions: string[] = [];
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(`Failed to send to subscription ${subscriptions[index].endpoint}:`, result.reason);
    } else if (result.value.shouldDelete) {
      invalidSubscriptions.push(subscriptions[index].endpoint);
    }
  });

  // Delete invalid subscriptions
  if (invalidSubscriptions.length > 0) {
    for (const endpoint of invalidSubscriptions) {
      await db
        .delete(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, endpoint));
    }
  }

  const successCount = results.filter((r) => r.status === "fulfilled" && r.value.success).length;

  return {
    sent: successCount,
    total: subscriptions.length,
  };
}

