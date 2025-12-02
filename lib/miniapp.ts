import { neynarClient } from "./neynar";
import { db } from "./db";
import { miniappInstallations } from "./schema";
import { eq, inArray } from "drizzle-orm";

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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://depthcaster.vercel.app";
  const notificationUrl = targetUrl || appUrl;

  try {
    // Use Neynar's publishFrameNotifications API
    // Neynar automatically filters out disabled tokens and handles rate limits
    // When targetFids is an empty array, Neynar sends to all users with notifications enabled
    // The API requires targetFids to be present as an array (even if empty)
    // Ensure targetFids is explicitly an array (not undefined)
    const targetFidsArray = Array.isArray(targetFids) ? targetFids : [];
    
    const requestPayload = {
      target_fids: targetFidsArray, // SDK expects snake_case
      notification: {
        title,
        body: body.length > 200 ? body.substring(0, 200) + "..." : body,
        target_url: notificationUrl,
      },
    };
    
    console.log("[Miniapp] Sending notification with payload:", JSON.stringify(requestPayload, null, 2));
    console.log("[Miniapp] targetFids type:", typeof targetFidsArray, "isArray:", Array.isArray(targetFidsArray), "length:", targetFidsArray.length);
    
    const response = await neynarClient.publishFrameNotifications(requestPayload);

    const targetCount = targetFids.length === 0 ? "all users" : `${targetFids.length} users`;
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
      console.error("[Miniapp] Error response:", JSON.stringify(error.response.data, null, 2));
      console.error("[Miniapp] Error status:", error.response.status);
      if (error.response.data?.errors) {
        error.response.data.errors.forEach((err: any) => {
          console.error(`[Miniapp] Validation error - path: ${JSON.stringify(err.path)}, message: ${err.message}, expected: ${err.expected}, received: ${err.received}`);
        });
      }
    }
    return {
      sent: 0,
      errors: targetFids.length === 0 ? 0 : targetFids.length,
    };
  }
}

/**
 * Send miniapp notification to a single user if they have the miniapp installed
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

  const result = await sendMiniappNotification([userFid], title, body, targetUrl);
  return result.sent > 0;
}

/**
 * Notify all miniapp users about a new curated cast
 * Passes empty array for targetFids to send to all users with notifications enabled
 */
export async function notifyAllMiniappUsersAboutNewCuratedCast(
  castHash: string,
  castData: any
): Promise<{ sent: number; errors: number }> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://depthcaster.com";
  const targetUrl = `${appUrl}/miniapp`;

  // Extract cast preview text
  const castText = castData?.text || "";
  const previewText = castText.length > 150 ? castText.substring(0, 150) + "..." : castText;
  
  // Extract author name
  const authorName = castData?.author?.display_name || castData?.author?.username || "Someone";

  const title = "New curated cast";
  const body = previewText || `${authorName} curated a cast`;

  // Pass empty array to send to all users with notifications enabled for the app
  // Neynar will automatically filter to only users who have the miniapp installed
  return await sendMiniappNotification([], title, body, targetUrl);
}
