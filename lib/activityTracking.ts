import { db } from "./db";
import { activityEvents, users } from "./schema";
import { sql, eq } from "drizzle-orm";

/**
 * Activity event types that qualify for 14-Day Active Users metric
 */
export type ActivityEventType = "post_reply" | "save_curate" | "follow_add" | "session_depth";

/**
 * Record a qualifying activity event for a user
 * Also updates the user's last_qualifying_activity_at timestamp
 */
export async function recordActivityEvent(
  userFid: number,
  type: ActivityEventType,
  metadata?: Record<string, any>
): Promise<void> {
  const now = new Date();

  // Insert activity event
  await db.insert(activityEvents).values({
    userFid,
    type,
    metadata: metadata || null,
    createdAt: now,
  });

  // Update user's last_qualifying_activity_at if this is the most recent activity
  await db
    .update(users)
    .set({
      lastQualifyingActivityAt: now,
      updatedAt: now,
    })
    .where(
      sql`${users.fid} = ${userFid} AND (${users.lastQualifyingActivityAt} IS NULL OR ${users.lastQualifyingActivityAt} < ${now})`
    );
}

/**
 * Get the most recent qualifying activity for a user
 */
export async function getLastQualifyingActivity(
  userFid: number
): Promise<Date | null> {
  const result = await db
    .select({
      createdAt: activityEvents.createdAt,
    })
    .from(activityEvents)
    .where(eq(activityEvents.userFid, userFid))
    .orderBy(sql`${activityEvents.createdAt} DESC`)
    .limit(1);

  return result[0]?.createdAt || null;
}

/**
 * Update user's first_sign_in_at if this is their first successful sign-in
 */
export async function updateFirstSignIn(userFid: number, signInTime: Date): Promise<void> {
  await db
    .update(users)
    .set({
      firstSignInAt: signInTime,
      updatedAt: new Date(),
    })
    .where(
      sql`${users.fid} = ${userFid} AND (${users.firstSignInAt} IS NULL OR ${users.firstSignInAt} > ${signInTime})`
    );
}

