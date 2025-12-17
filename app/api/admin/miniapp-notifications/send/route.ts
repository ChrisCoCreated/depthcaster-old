import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { miniappInstallations, userRoles } from "@/lib/schema";
import { eq, inArray, and } from "drizzle-orm";
import { isAdmin, getUserRoles } from "@/lib/roles";
import { sendMiniappNotification, getMiniappInstalledFids } from "@/lib/miniapp";

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
        { error: "adminFid is required" },
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
    const roles = await getUserRoles(adminFidNum);
    if (!isAdmin(roles)) {
      return NextResponse.json(
        { error: "User does not have admin or superadmin role" },
        { status: 403 }
      );
    }

    // Determine target user FIDs (only those with miniapp installed)
    let targetUserFids: number[] = [];

    if (targetType === "all") {
      // Get all users who have the miniapp installed
      targetUserFids = await getMiniappInstalledFids();
    } else if (targetType === "targeted") {
      if (targetFids && Array.isArray(targetFids) && targetFids.length > 0) {
        // Use provided FIDs, but filter to only those who have miniapp installed
        const validFids = targetFids.filter((fid: any) => typeof fid === "number" && !isNaN(fid));
        if (validFids.length > 0) {
          const installations = await db
            .select({ userFid: miniappInstallations.userFid })
            .from(miniappInstallations)
            .where(inArray(miniappInstallations.userFid, validFids));
          targetUserFids = installations.map((inst) => inst.userFid);
        }
      } else if (targetRoles && Array.isArray(targetRoles) && targetRoles.length > 0) {
        // Get users by roles (multiple roles supported)
        // Filter to only users who have miniapp installed AND have one of the selected roles
        const validRoles = targetRoles.filter((role: any) => typeof role === "string" && role.trim().length > 0);
        if (validRoles.length > 0) {
          // Get all users with the selected roles
          const usersWithRoles = await db
            .selectDistinct({ userFid: userRoles.userFid })
            .from(userRoles)
            .where(inArray(userRoles.role, validRoles));
          
          const roleUserFids = usersWithRoles.map((u) => u.userFid);
          
          if (roleUserFids.length > 0) {
            // Filter to only those who have miniapp installed
            const installations = await db
              .select({ userFid: miniappInstallations.userFid })
              .from(miniappInstallations)
              .where(inArray(miniappInstallations.userFid, roleUserFids));
            targetUserFids = installations.map((inst) => inst.userFid);
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
        { error: "No target users found (only users who have installed the miniapp are included)" },
        { status: 400 }
      );
    }

    // Send miniapp notifications
    const result = await sendMiniappNotification(
      targetUserFids,
      title.trim(),
      messageBody.trim(),
      url?.trim()
    );

    return NextResponse.json({
      success: true,
      totalUsers: targetUserFids.length,
      sent: result.sent,
      errors: result.errors,
    });
  } catch (error: any) {
    console.error("Error sending miniapp notifications:", error);
    return NextResponse.json(
      { error: error.message || "Failed to send miniapp notifications" },
      { status: 500 }
    );
  }
}

