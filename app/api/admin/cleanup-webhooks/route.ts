import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { isAdmin, getUserRoles } from "@/lib/roles";
import { cleanupOrphanedWebhooks } from "@/lib/webhooks";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { adminFid } = body;

    if (!adminFid) {
      return NextResponse.json(
        { error: "adminFid is required" },
        { status: 400 }
      );
    }

    // Check if user has admin/superadmin role
    const user = await db.select().from(users).where(eq(users.fid, adminFid)).limit(1);
    if (user.length === 0) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }
    const roles = await getUserRoles(adminFid);
    if (!isAdmin(roles)) {
      return NextResponse.json(
        { error: "User does not have admin or superadmin role" },
        { status: 403 }
      );
    }

    // Clean up orphaned webhooks
    const cleanedCount = await cleanupOrphanedWebhooks();

    return NextResponse.json({
      success: true,
      cleanedCount,
      message: `Cleaned up ${cleanedCount} orphaned webhook(s)`,
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Cleanup webhooks API error:", err.message || err);
    return NextResponse.json(
      { error: err.message || "Failed to cleanup orphaned webhooks" },
      { status: 500 }
    );
  }
}

