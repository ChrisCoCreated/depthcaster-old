import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Verify that the request is from Vercel Cron
 * In production, Vercel sets the Authorization header with a bearer token
 * For local testing, we can use an environment variable
 */
function verifyCronRequest(request: NextRequest): boolean {
  // Check for Vercel cron authorization header
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (authHeader && cronSecret) {
    const token = authHeader.replace("Bearer ", "");
    return token === cronSecret;
  }

  // For local development, allow if CRON_SECRET is not set (less secure)
  // In production, this should always be set
  if (!cronSecret) {
    console.warn("[Cron] CRON_SECRET not set - allowing request (development mode)");
    return true;
  }

  return false;
}

export async function GET(request: NextRequest) {
  try {
    // Verify this is a valid cron request
    if (!verifyCronRequest(request)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    console.log("[Timeout Feed Sessions Cron] Starting session timeout cleanup job");

    // Find sessions with impossible durations (longer than time since creation + buffer)
    // This catches sessions that weren't properly ended due to browser crashes, etc.
    const TIMEOUT_THRESHOLD_MINUTES = 10; // 10 minutes = 5 min timeout + 5 min buffer
    const MAX_DURATION_SECONDS = 4 * 60 * 60; // 4 hours max
    const thresholdTime = new Date();
    thresholdTime.setMinutes(thresholdTime.getMinutes() - TIMEOUT_THRESHOLD_MINUTES);

    // Find sessions that:
    // 1. Were created more than TIMEOUT_THRESHOLD_MINUTES ago
    // 2. Have a duration that exceeds the time since creation (impossible)
    // 3. Or have a duration exceeding MAX_DURATION_SECONDS
    const problematicSessions = await db.execute(sql`
      SELECT 
        id,
        user_fid,
        feed_type,
        duration_seconds,
        created_at,
        EXTRACT(EPOCH FROM (NOW() - created_at))::int as seconds_since_creation
      FROM feed_view_sessions
      WHERE created_at < ${thresholdTime.toISOString()}
        AND (
          duration_seconds > EXTRACT(EPOCH FROM (NOW() - created_at))::int
          OR duration_seconds > ${MAX_DURATION_SECONDS}
        )
      ORDER BY created_at DESC
      LIMIT 1000
    `);

    const sessions = (problematicSessions as any).rows || [];
    console.log(`[Timeout Feed Sessions Cron] Found ${sessions.length} sessions with problematic durations`);

    if (sessions.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No problematic sessions found",
        sessionsFixed: 0,
      });
    }

    // Fix sessions by capping duration to reasonable values
    let fixedCount = 0;
    for (const session of sessions) {
      const maxPossibleDuration = Math.min(
        session.seconds_since_creation,
        MAX_DURATION_SECONDS
      );

      // Only fix if duration is actually problematic
      if (session.duration_seconds > maxPossibleDuration) {
        try {
          await db.execute(sql`
            UPDATE feed_view_sessions
            SET duration_seconds = ${maxPossibleDuration}
            WHERE id = ${session.id}
          `);
          fixedCount++;
        } catch (error) {
          console.error(`[Timeout Feed Sessions Cron] Failed to fix session ${session.id}:`, error);
        }
      }
    }

    console.log(`[Timeout Feed Sessions Cron] Fixed ${fixedCount} sessions`);

    return NextResponse.json({
      success: true,
      sessionsFound: sessions.length,
      sessionsFixed: fixedCount,
    });
  } catch (error: any) {
    console.error("[Timeout Feed Sessions Cron] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to run session timeout cleanup" },
      { status: 500 }
    );
  }
}

