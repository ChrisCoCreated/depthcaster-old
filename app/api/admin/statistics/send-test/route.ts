import { NextRequest, NextResponse } from "next/server";
import { isAdmin, getUserRoles, getAllAdminFids } from "@/lib/roles";
import { get24HourStats } from "@/lib/statistics";
import { sendAppUpdateNotificationToUsers } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fid } = body;

    if (!fid) {
      return NextResponse.json(
        { error: "fid is required" },
        { status: 400 }
      );
    }

    const userFid = parseInt(fid);
    if (isNaN(userFid)) {
      return NextResponse.json(
        { error: "Invalid fid" },
        { status: 400 }
      );
    }

    // Check admin/superadmin access
    const roles = await getUserRoles(userFid);
    if (!isAdmin(roles)) {
      return NextResponse.json(
        { error: "Unauthorized: Admin or superadmin role required" },
        { status: 403 }
      );
    }

    // Get all admin and superadmin FIDs
    const adminFids = await getAllAdminFids();

    if (adminFids.length === 0) {
      return NextResponse.json(
        { error: "No admins or superadmins found" },
        { status: 404 }
      );
    }

    // Get 24h stats
    const stats = await get24HourStats();

    // Format test notification message
    const date = new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });

    const qualityText = stats.avgQualityScore !== null
      ? `avg quality: ${stats.avgQualityScore}`
      : "quality: N/A";

    const title = `[TEST] Daily Stats - ${date}`;
    const body = `📊 Past 24h: ${stats.castsCurated} casts curated (${qualityText}), ${stats.replies} replies, ${stats.likes} likes, ${stats.recasts} recasts`;
    const url = "/admin/statistics?period=24h";

    // Send test notifications to all admins/superadmins
    const result = await sendAppUpdateNotificationToUsers(
      adminFids,
      title,
      body,
      url,
      userFid
    );

    return NextResponse.json({
      success: true,
      stats,
      notificationsCreated: result.notificationsCreated,
      pushNotificationsSent: result.pushNotificationsSent,
      errors: result.errors,
      usersNotified: adminFids.length,
    });
  } catch (error: any) {
    console.error("Error sending test notification:", error);
    return NextResponse.json(
      { error: error.message || "Failed to send test notification" },
      { status: 500 }
    );
  }
}
