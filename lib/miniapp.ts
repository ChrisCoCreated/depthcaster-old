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
  if (targetFids.length === 0) {
    return { sent: 0, errors: 0 };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://depthcaster.vercel.app";
  const notificationUrl = targetUrl || appUrl;

  try {
    // Use Neynar's publishFrameNotifications API
    // Neynar automatically filters out disabled tokens and handles rate limits
      const response = await neynarClient.publishFrameNotifications({
        targetFids,
        notification: {
          title,
          body: body.length > 200 ? body.substring(0, 200) + "..." : body,
          target_url: notificationUrl,
        },
      });

    console.log(`[Miniapp] Sent notification to ${targetFids.length} users via Neynar`);
    
    // Neynar returns the number of notifications sent
    // The actual count may be less due to disabled tokens (which Neynar filters automatically)
    return {
      sent: response?.result?.sent || targetFids.length,
      errors: 0, // Neynar handles errors internally
    };
  } catch (error: any) {
    console.error("[Miniapp] Error sending notification:", error);
    return {
      sent: 0,
      errors: targetFids.length,
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
