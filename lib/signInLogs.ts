import { db } from "./db";
import { signInLogs } from "./schema";

export interface SignInLogData {
  userFid?: number;
  requestData?: any;
  responseData?: any;
  signerUuid?: string;
  success: boolean;
  error?: string;
}

/**
 * Log a sign-in event to the database
 */
export async function logSignIn(data: SignInLogData): Promise<void> {
  try {
    const now = new Date();
    await db.insert(signInLogs).values({
      userFid: data.userFid,
      requestData: data.requestData,
      responseData: data.responseData,
      signerUuid: data.signerUuid,
      success: data.success,
      error: data.error,
    });

    // Update first_sign_in_at if this is a successful sign-in
    if (data.success && data.userFid) {
      try {
        const { updateFirstSignIn } = await import("@/lib/activityTracking");
        await updateFirstSignIn(data.userFid, now);
      } catch (error) {
        // Log but don't fail - activity tracking shouldn't break sign-in
        console.error("Failed to update first_sign_in_at:", error);
      }
    }
  } catch (error) {
    // Log error but don't throw - we don't want to break the sign-in flow
    console.error("Failed to log sign-in event:", error);
  }
}

