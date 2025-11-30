import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, userRoles } from "@/lib/schema";
import { eq, inArray } from "drizzle-orm";
import { isAdmin, getUserRoles } from "@/lib/roles";
import { sendAppUpdateNotificationToUsers } from "@/lib/notifications";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, body: messageBody, url, targetType, targetFids, targetRole, adminFid } = body;

    // Validate required fields
    if (!title || !messageBody || !targetType) {
      return NextResponse.json(
        { error: "Missing required fields: title, body, targetType" },
        { status: 400 }
      );
    }

    if (!adminFidParam) {
      return NextResponse.json(
        { error: "adminFid is required (as query param or in body)" },
        { status: 400 }
      );
    }

    const adminFidNum = parseInt(adminFidParam);
    if (isNaN(adminFidNum)) {
      return NextResponse.json(
        { error: "Invalid adminFid" },
        { status: 400 }
      );
    }

    // Verify admin access
    const adminUser = await db.select().from(users).where(eq(users.fid, adminFidNum)).limit(1);
    if (adminUser.length === 0) {
      return NextResponse.json(
        { error: "Admin user not found" },
        { status: 404 }
      );
    }

    const roles = await getUserRoles(adminFidNum);
    if (!isAdmin(roles)) {
      return NextResponse.json(
        { error: "User does not have admin or superadmin role" },
        { status: 403 }
      );
    }

    // Determine target user FIDs
    let targetUserFids: number[] = [];

    if (targetType === "all") {
      // Get all user FIDs
      const allUsers = await db.select({ fid: users.fid }).from(users);
      targetUserFids = allUsers.map((u) => u.fid);
    } else if (targetType === "targeted") {
      if (targetFids && Array.isArray(targetFids) && targetFids.length > 0) {
        // Use provided FIDs
        targetUserFids = targetFids.filter((fid: any) => typeof fid === "number" && !isNaN(fid));
      } else if (targetRole && typeof targetRole === "string") {
        // Get users by role
        const usersWithRole = await db
          .select({ fid: userRoles.userFid })
          .from(userRoles)
          .where(eq(userRoles.role, targetRole));
        targetUserFids = usersWithRole.map((u) => u.fid);
      } else {
        return NextResponse.json(
          { error: "For targeted notifications, provide targetFids array or targetRole" },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { error: "Invalid targetType. Must be 'all' or 'targeted'" },
        { status: 400 }
      );
    }

    if (targetUserFids.length === 0) {
      return NextResponse.json(
        { error: "No target users found" },
        { status: 400 }
      );
    }

    // Send notifications
    const result = await sendAppUpdateNotificationToUsers(
      targetUserFids,
      title,
      messageBody,
      url,
      adminFidNum
    );

    return NextResponse.json({
      success: true,
      totalUsers: targetUserFids.length,
      notificationsCreated: result.notificationsCreated,
      pushNotificationsSent: result.pushNotificationsSent,
      errors: result.errors,
    });
  } catch (error: any) {
    console.error("Error sending app update notifications:", error);
    return NextResponse.json(
      { error: error.message || "Failed to send notifications" },
      { status: 500 }
    );
  }
}
