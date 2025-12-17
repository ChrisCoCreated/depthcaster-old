import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { miniappInstallations, userRoles } from "@/lib/schema";
import { eq, inArray } from "drizzle-orm";
import { isAdmin, getUserRoles } from "@/lib/roles";
import { getMiniappInstalledFids } from "@/lib/miniapp";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { targetType, targetFids, targetRoles, adminFid } = body;

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

    let requestedFids: number[] = [];
    let eligibleFids: number[] = [];
    let ineligibleFids: number[] = [];

    if (targetType === "all") {
      // Get all users who have the miniapp installed
      eligibleFids = await getMiniappInstalledFids();
      requestedFids = eligibleFids; // For "all", requested = eligible
    } else if (targetType === "targeted") {
      if (targetFids && Array.isArray(targetFids) && targetFids.length > 0) {
        // Check which of the provided FIDs have miniapp installed
        const validFids = targetFids.filter((fid: any) => typeof fid === "number" && !isNaN(fid));
        requestedFids = validFids;
        
        if (validFids.length > 0) {
          const installations = await db
            .select({ userFid: miniappInstallations.userFid })
            .from(miniappInstallations)
            .where(inArray(miniappInstallations.userFid, validFids));
          eligibleFids = installations.map((inst) => inst.userFid);
          ineligibleFids = validFids.filter((fid) => !eligibleFids.includes(fid));
        }
      } else if (targetRoles && Array.isArray(targetRoles) && targetRoles.length > 0) {
        // Get users by roles and check which have miniapp installed
        const validRoles = targetRoles.filter((role: any) => typeof role === "string" && role.trim().length > 0);
        if (validRoles.length > 0) {
          // Get all users with the selected roles
          const usersWithRoles = await db
            .selectDistinct({ userFid: userRoles.userFid })
            .from(userRoles)
            .where(inArray(userRoles.role, validRoles));
          
          const roleUserFids = usersWithRoles.map((u) => u.userFid);
          requestedFids = roleUserFids;
          
          if (roleUserFids.length > 0) {
            // Check which have miniapp installed
            const installations = await db
              .select({ userFid: miniappInstallations.userFid })
              .from(miniappInstallations)
              .where(inArray(miniappInstallations.userFid, roleUserFids));
            eligibleFids = installations.map((inst) => inst.userFid);
            ineligibleFids = roleUserFids.filter((fid) => !eligibleFids.includes(fid));
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

    return NextResponse.json({
      success: true,
      requestedCount: requestedFids.length,
      eligibleCount: eligibleFids.length,
      ineligibleCount: ineligibleFids.length,
      eligibleFids,
      ineligibleFids,
    });
  } catch (error: any) {
    console.error("Error checking miniapp notification eligibility:", error);
    return NextResponse.json(
      { error: error.message || "Failed to check eligibility" },
      { status: 500 }
    );
  }
}

