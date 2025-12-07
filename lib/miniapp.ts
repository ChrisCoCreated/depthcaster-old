import { neynarClient } from "./neynar";
import { db } from "./db";
import { miniappInstallations } from "./schema";
import { eq } from "drizzle-orm";

/**
 * Check if a user has the miniapp installed
 */
export async function hasMiniappInstalled(userFid: number): Promise<boolean> {
  const installation = await db
    .select()
    .from(miniappInstallations)
    .where(eq(miniappInstallations.userFid, userFid))
    .limit(1);

  return installation.length > 0;
}

/**
 * Get all FIDs that have the miniapp installed
 */
export async function getMiniappInstalledFids(): Promise<number[]> {
  const installations = await db
    .select({ userFid: miniappInstallations.userFid })
    .from(miniappInstallations);

  return installations.map((inst) => inst.userFid);
}

/**
 * Build the notification payload (for testing/debugging)
 */
export function buildMiniappNotificationPayload(
  targetFids: number[],
  title: string,
  body: string,
  targetUrl?: string
): { target_fids: number[]; notification: { title: string; body: string; target_url: string } } {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://depthcaster.vercel.app";
  const notificationUrl = targetUrl || appUrl;
  const targetFidsArray = Array.isArray(targetFids) ? targetFids : [];
  
  // Validate inputs
  if (!title || title.trim().length === 0) {
    throw new Error("Notification title cannot be empty");
  }
  if (!body || body.trim().length === 0) {
    throw new Error("Notification body cannot be empty");
  }
  if (!notificationUrl || typeof notificationUrl !== "string") {
    throw new Error("Notification target_url must be a valid URL string");
  }
  
  // Validate URL format
  try {
    new URL(notificationUrl);
  } catch (e) {
    throw new Error(`Invalid target_url format: ${notificationUrl}`);
  }
  
  // Truncate title to 32 characters (Neynar limit)
  // Truncate to 29 chars before adding "..." to ensure total is exactly 32
  const trimmedTitle = title.trim();
  const truncatedTitle = trimmedTitle.length > 32 ? trimmedTitle.substring(0, 29) + "..." : trimmedTitle;
  
  // Truncate body to 128 characters (Neynar limit)
  // Truncate to 125 chars before adding "..." to ensure total is exactly 128
  const trimmedBody = body.trim();
  const truncatedBody = trimmedBody.length > 128 ? trimmedBody.substring(0, 125) + "..." : trimmedBody;
  
  return {
    target_fids: targetFidsArray,
    notification: {
      title: truncatedTitle,
      body: truncatedBody,
      target_url: notificationUrl,
    },
  };
}

/**
 * Send a Farcaster miniapp notification to specific users
 * Uses Neynar's publishFrameNotifications API which automatically handles:
 * - Token management
 * - Rate limiting
 * - Filtering disabled tokens
 */
export async function sendMiniappNotification(
  targetFids: number[],
  title: string,
  body: string,
  targetUrl?: string
): Promise<{ sent: number; errors: number }> {
  // Empty array means send to all users with notifications enabled
  // Non-empty array means send to specific users
  // Both cases should proceed to call the API

  try {
    // Use Neynar's publishFrameNotifications API
    // Neynar automatically filters out disabled tokens and handles rate limits
    // When targetFids is an empty array, Neynar sends to all users with notifications enabled
    // The API requires targetFids to be present as an array (even if empty)
    const requestPayload = buildMiniappNotificationPayload(targetFids, title, body, targetUrl);
    
    console.log("[Miniapp] Sending notification with payload:", JSON.stringify(requestPayload, null, 2));
    console.log("[Miniapp] targetFids type:", typeof requestPayload.target_fids, "isArray:", Array.isArray(requestPayload.target_fids), "length:", requestPayload.target_fids.length);
    
    const response = await neynarClient.publishFrameNotifications(requestPayload);

    const targetCount = requestPayload.target_fids.length === 0 ? "all users" : `${requestPayload.target_fids.length} users`;
    console.log(`[Miniapp] Sent notification to ${targetCount} via Neynar`);
    
    // Count successful deliveries
    const successfulDeliveries = response?.notification_deliveries?.filter(
      (delivery) => delivery.status === "success"
    ) || [];
    const failedDeliveries = response?.notification_deliveries?.filter(
      (delivery) => delivery.status !== "success"
    ) || [];
    
    return {
      sent: successfulDeliveries.length,
      errors: failedDeliveries.length,
    };
  } catch (error: any) {
    console.error("[Miniapp] Error sending notification:", error);
    // Log more details about the error for debugging
    if (error.response) {
      console.error("[Miniapp] Error response status:", error.response.status);
      console.error("[Miniapp] Error response data:", JSON.stringify(error.response.data, null, 2));
      if (error.response.data?.errors) {
        error.response.data.errors.forEach((err: any) => {
          console.error(`[Miniapp] Validation error - path: ${JSON.stringify(err.path)}, message: ${err.message}, expected: ${err.expected}, received: ${err.received}`);
        });
      }
      if (error.response.data?.message) {
        console.error("[Miniapp] Error message:", error.response.data.message);
      }
    } else if (error.message) {
      console.error("[Miniapp] Error message:", error.message);
    }
    // Re-throw the error so calling code can handle it properly
    throw error;
  }
}

/**
 * Send miniapp notification to a single user if they have the miniapp installed
 * Returns false if user doesn't have miniapp installed or if sending fails
 */
export async function sendMiniappNotificationToUser(
  userFid: number,
  title: string,
  body: string,
  targetUrl?: string
): Promise<boolean> {
  const installed = await hasMiniappInstalled(userFid);
  if (!installed) {
    return false;
  }

  try {
    const result = await sendMiniappNotification([userFid], title, body, targetUrl);
    return result.sent > 0;
  } catch (error) {
    console.error(`[Miniapp] Error sending notification to user ${userFid}:`, error);
    return false;
  }
}

/**
 * Notify all miniapp users about a new curated cast
 * Passes empty array for targetFids to send to all users with notifications enabled
 */
export async function notifyAllMiniappUsersAboutNewCuratedCast(
  castHash: string,
  castData: any
): Promise<{ sent: number; errors: number }> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://depthcaster.vercel.app";
  // Use miniapp URL with castHash query parameter to auto-open the cast
  const targetUrl = `${appUrl}/miniapp?castHash=${castHash}`;

  // Extract cast text (truncation will be handled by buildMiniappNotificationPayload)
  const castText = (castData?.text || "").trim();
  
  // Extract author name
  const authorName = castData?.author?.display_name || castData?.author?.username || "Someone";

  const title = "New curated cast";
  // Ensure body always has content - use cast text if available, otherwise fallback
  // buildMiniappNotificationPayload will handle truncation to 128 chars
  const body = castText || `${authorName} curated a cast`;

  // Pass empty array to send to all users with notifications enabled for the app
  // Neynar will automatically filter to only users who have the miniapp installed
  return await sendMiniappNotification([], title, body, targetUrl);
}
