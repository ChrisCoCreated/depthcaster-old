import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, userRoles, signInLogs } from "@/lib/schema";
import { eq, inArray, and } from "drizzle-orm";
import { isAdmin, getUserRoles } from "@/lib/roles";
import { sendAppUpdateNotificationToUsers } from "@/lib/notifications";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, body: messageBody, url, targetType, targetFids, targetRoles, adminFid } = body;

    // Validate required fields
    if (!title || !messageBody || !targetType) {
      return NextResponse.json(
        { error: "Missing required fields: title, body, targetType" },
        { status: 400 }
      );
    }

    if (!adminFid) {
      return NextResponse.json(
        { error: "adminFid is required (as query param or in body)" },
        { status: 400 }
      );
    }

    const adminFidNum = parseInt(String(adminFid));
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
      // Get all users who have signed in (have successful sign-in logs)
      const signedInUsers = await db
        .selectDistinct({ userFid: signInLogs.userFid })
        .from(signInLogs)
        .where(eq(signInLogs.success, true));
      targetUserFids = signedInUsers
        .map((u) => u.userFid)
        .filter((fid): fid is number => fid !== null);
    } else if (targetType === "targeted") {
      if (targetFids && Array.isArray(targetFids) && targetFids.length > 0) {
        // Use provided FIDs, but filter to only those who have signed in
        const validFids = targetFids.filter((fid: any) => typeof fid === "number" && !isNaN(fid));
        if (validFids.length > 0) {
          const signedInFids = await db
            .selectDistinct({ userFid: signInLogs.userFid })
            .from(signInLogs)
            .where(
              and(
                inArray(signInLogs.userFid, validFids),
                eq(signInLogs.success, true)
              )
            );
          targetUserFids = signedInFids
            .map((u) => u.userFid)
            .filter((fid): fid is number => fid !== null);
        }
      } else if (targetRoles && Array.isArray(targetRoles) && targetRoles.length > 0) {
        // Get users by roles (multiple roles supported)
        // Filter to only users who have signed in AND have one of the selected roles
        const validRoles = targetRoles.filter((role: any) => typeof role === "string" && role.trim().length > 0);
        if (validRoles.length > 0) {
          // Get all users with the selected roles
          const usersWithRoles = await db
            .selectDistinct({ userFid: userRoles.userFid })
            .from(userRoles)
            .where(inArray(userRoles.role, validRoles));
          
          const roleUserFids = usersWithRoles.map((u) => u.userFid);
          
          if (roleUserFids.length > 0) {
            // Filter to only those who have signed in
            const signedInUsers = await db
              .selectDistinct({ userFid: signInLogs.userFid })
              .from(signInLogs)
              .where(
                and(
                  inArray(signInLogs.userFid, roleUserFids),
                  eq(signInLogs.success, true)
                )
              );
            targetUserFids = signedInUsers
              .map((u) => u.userFid)
              .filter((fid): fid is number => fid !== null);
          }
        }
      } else {
        return NextResponse.json(
          { error: "For targeted notifications, provide targetFids array or targetRoles array" },
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
        { error: "No target users found (only users who have signed in are included)" },
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
