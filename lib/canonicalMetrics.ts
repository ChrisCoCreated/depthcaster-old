import { db } from "./db";
import { users, miniappInstallations } from "./schema";
import { sql, isNotNull, and, isNull } from "drizzle-orm";

/**
 * Get count of 14-Day Active Users
 * A user is 14-Day Active if they have at least one qualifying activity event in the last 14 days
 */
export async function get14DayActiveUsers(): Promise<number> {
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const result = await db.execute(sql`
    SELECT COUNT(DISTINCT fid)::int as count
    FROM users
    WHERE last_qualifying_activity_at >= ${fourteenDaysAgo.toISOString()}
  `);

  return (result as any).rows?.[0]?.count || 0;
}

/**
 * Get count of All-Time Signed-In Users
 * A user is counted if they have ever successfully authenticated
 */
export async function getSignedInEver(): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(isNotNull(users.firstSignInAt));

  return result[0]?.count || 0;
}

/**
 * Get count of Miniapp-Only Users
 * Users who have miniapp installed but no qualifying activity in main app
 */
export async function getMiniappOnlyUsers(): Promise<number> {
  const result = await db.execute(sql`
    SELECT COUNT(DISTINCT mi.user_fid)::int as count
    FROM miniapp_installations mi
    LEFT JOIN users u ON u.fid = mi.user_fid
    WHERE u.last_qualifying_activity_at IS NULL
  `);

  return (result as any).rows?.[0]?.count || 0;
}

/**
 * Get detailed list of 14-Day Active Users with their activity info
 */
export async function get14DayActiveUsersList(): Promise<Array<{
  fid: number;
  username: string | null;
  displayName: string | null;
  pfpUrl: string | null;
  lastQualifyingActivityAt: Date | null;
}>> {
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const result = await db.execute(sql`
    SELECT 
      u.fid,
      u.username,
      u.display_name as "displayName",
      u.pfp_url as "pfpUrl",
      u.last_qualifying_activity_at as "lastQualifyingActivityAt"
    FROM users u
    WHERE u.last_qualifying_activity_at >= ${fourteenDaysAgo.toISOString()}
    ORDER BY u.last_qualifying_activity_at DESC
  `);

  return (result as any).rows || [];
}

/**
 * Get detailed list of Miniapp-Only Users
 */
export async function getMiniappOnlyUsersList(): Promise<Array<{
  fid: number;
  username: string | null;
  displayName: string | null;
  pfpUrl: string | null;
  installedAt: Date;
}>> {
  const result = await db.execute(sql`
    SELECT 
      u.fid,
      u.username,
      u.display_name as "displayName",
      u.pfp_url as "pfpUrl",
      mi.installed_at as "installedAt"
    FROM miniapp_installations mi
    LEFT JOIN users u ON u.fid = mi.user_fid
    WHERE u.last_qualifying_activity_at IS NULL
    ORDER BY mi.installed_at DESC
  `);

  return (result as any).rows || [];
}


