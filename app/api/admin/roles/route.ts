import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, userRoles } from "@/lib/schema";
import { eq, and, ilike, isNotNull } from "drizzle-orm";
import { isAdmin, getUserRoles } from "@/lib/roles";
import { upsertUser } from "@/lib/users";

// GET - List all users with their roles
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const adminFid = searchParams.get("adminFid");
    const searchQuery = searchParams.get("q");

    if (!adminFid) {
      return NextResponse.json(
        { error: "adminFid is required" },
        { status: 400 }
      );
    }

    const adminFidNum = parseInt(adminFid);
    if (isNaN(adminFidNum)) {
      return NextResponse.json(
        { error: "Invalid adminFid" },
        { status: 400 }
      );
    }

    // Check if user has admin/superadmin role
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

    // Get all users with their roles
    let query = db
      .select({
        fid: users.fid,
        username: users.username,
        displayName: users.displayName,
        pfpUrl: users.pfpUrl,
        usageStats: users.usageStats,
        role: userRoles.role,
        roleCreatedAt: userRoles.createdAt,
      })
      .from(users)
      .leftJoin(userRoles, eq(users.fid, userRoles.userFid));

    // If search query provided, filter by username
    if (searchQuery && searchQuery.length >= 2) {
      query = query.where(
        and(
          isNotNull(users.username),
          ilike(users.username, `%${searchQuery}%`)
        )
      ) as any;
    }

    const results = await query;

    // Group by user and collect roles
    const userMap = new Map<number, {
      fid: number;
      username: string | null;
      displayName: string | null;
      pfpUrl: string | null;
      roles: string[];
      lastActivity: Date | null;
    }>();

    for (const row of results) {
      if (!userMap.has(row.fid)) {
        // Only use lastCuratedFeedView - this indicates actual app usage (viewing the curated feed)
        // Don't use updatedAt as it can be updated for many reasons (user added to DB, preferences changed, etc.)
        let lastActivity: Date | null = null;
        if (row.usageStats) {
          const usageStats = row.usageStats as { lastCuratedFeedView?: string | Date };
          if (usageStats.lastCuratedFeedView) {
            if (usageStats.lastCuratedFeedView instanceof Date) {
              lastActivity = usageStats.lastCuratedFeedView;
            } else if (typeof usageStats.lastCuratedFeedView === 'string') {
              lastActivity = new Date(usageStats.lastCuratedFeedView);
            }
          }
        }

        userMap.set(row.fid, {
          fid: row.fid,
          username: row.username,
          displayName: row.displayName,
          pfpUrl: row.pfpUrl,
          roles: [],
          lastActivity,
        });
      }
      if (row.role) {
        userMap.get(row.fid)!.roles.push(row.role);
      }
    }

    const usersWithRoles = Array.from(userMap.values())
      .map(user => ({
        ...user,
        lastActivity: user.lastActivity ? user.lastActivity.toISOString() : null,
      }))
      .sort((a, b) => {
        // First sort by role: users with roles come first
        // Among users with roles, prioritize by role hierarchy (superadmin > admin > curator)
        const rolePriority = (roles: string[]) => {
          if (roles.includes("superadmin")) return 3;
          if (roles.includes("admin")) return 2;
          if (roles.includes("curator")) return 1;
          return 0;
        };
        
        const aRolePriority = rolePriority(a.roles);
        const bRolePriority = rolePriority(b.roles);
        
        if (aRolePriority !== bRolePriority) {
          return bRolePriority - aRolePriority;
        }
        
        // If same role priority, sort by last activity (most recent first)
        // Users with no activity go to the end
        if (!a.lastActivity && !b.lastActivity) {
          // Both have no activity, sort by username
          const aUsername = a.username || "";
          const bUsername = b.username || "";
          return aUsername.localeCompare(bUsername);
        }
        if (!a.lastActivity) return 1; // a goes after b
        if (!b.lastActivity) return -1; // b goes after a
        
        const aTime = new Date(a.lastActivity).getTime();
        const bTime = new Date(b.lastActivity).getTime();
        return bTime - aTime; // Most recent first
      });

    return NextResponse.json({ users: usersWithRoles });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Admin roles API error:", err.message || err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch users with roles" },
      { status: 500 }
    );
  }
}

// POST - Add a role to a user
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { adminFid, userFid, role } = body;

    if (!adminFid || !userFid || !role) {
      return NextResponse.json(
        { error: "adminFid, userFid, and role are required" },
        { status: 400 }
      );
    }

    const adminFidNum = parseInt(adminFid);
    const userFidNum = parseInt(userFid);

    if (isNaN(adminFidNum) || isNaN(userFidNum)) {
      return NextResponse.json(
        { error: "Invalid fid" },
        { status: 400 }
      );
    }

    // Validate role
    const validRoles = ["curator", "admin", "superadmin", "tester", "plus"];
    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { error: `Invalid role. Must be one of: ${validRoles.join(", ")}` },
        { status: 400 }
      );
    }

    // Check if admin has admin/superadmin role
    const adminUser = await db.select().from(users).where(eq(users.fid, adminFidNum)).limit(1);
    if (adminUser.length === 0) {
      return NextResponse.json(
        { error: "Admin user not found" },
        { status: 404 }
      );
    }
    const adminRoles = await getUserRoles(adminFidNum);
    if (!isAdmin(adminRoles)) {
      return NextResponse.json(
        { error: "User does not have admin or superadmin role" },
        { status: 403 }
      );
    }

    // Only superadmin can assign superadmin role
    if (role === "superadmin" && !adminRoles.includes("superadmin")) {
      return NextResponse.json(
        { error: "Only superadmin can assign superadmin role" },
        { status: 403 }
      );
    }

    // Ensure user exists in database
    const targetUser = await db.select().from(users).where(eq(users.fid, userFidNum)).limit(1);
    if (targetUser.length === 0) {
      // Try to fetch user from Neynar and create in DB
      try {
        const { neynarClient } = await import("@/lib/neynar");
        const neynarResponse = await neynarClient.fetchBulkUsers({ fids: [userFidNum] });
        const neynarUser = neynarResponse.users?.[0];
        if (neynarUser) {
          await upsertUser(userFidNum, {
            username: neynarUser.username,
            displayName: neynarUser.display_name,
            pfpUrl: neynarUser.pfp_url,
          });
        } else {
          return NextResponse.json(
            { error: "User not found" },
            { status: 404 }
          );
        }
      } catch (error) {
        return NextResponse.json(
          { error: "User not found and could not be fetched" },
          { status: 404 }
        );
      }
    }

    // Check if role already exists
    const existingRole = await db
      .select()
      .from(userRoles)
      .where(and(eq(userRoles.userFid, userFidNum), eq(userRoles.role, role)))
      .limit(1);

    if (existingRole.length > 0) {
      return NextResponse.json(
        { error: "User already has this role" },
        { status: 400 }
      );
    }

    // Add the role
    await db.insert(userRoles).values({
      userFid: userFidNum,
      role: role,
    });

    return NextResponse.json({
      success: true,
      message: `Role "${role}" added to user ${userFidNum}`,
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Admin roles POST API error:", err.message || err);
    
    // Handle unique constraint violation
    if (err.message?.includes("user_role_unique")) {
      return NextResponse.json(
        { error: "User already has this role" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: err.message || "Failed to add role" },
      { status: 500 }
    );
  }
}

// DELETE - Remove a role from a user
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const adminFid = searchParams.get("adminFid");
    const userFid = searchParams.get("userFid");
    const role = searchParams.get("role");

    if (!adminFid || !userFid || !role) {
      return NextResponse.json(
        { error: "adminFid, userFid, and role are required" },
        { status: 400 }
      );
    }

    const adminFidNum = parseInt(adminFid);
    const userFidNum = parseInt(userFid);

    if (isNaN(adminFidNum) || isNaN(userFidNum)) {
      return NextResponse.json(
        { error: "Invalid fid" },
        { status: 400 }
      );
    }

    // Check if admin has admin/superadmin role
    const adminUser = await db.select().from(users).where(eq(users.fid, adminFidNum)).limit(1);
    if (adminUser.length === 0) {
      return NextResponse.json(
        { error: "Admin user not found" },
        { status: 404 }
      );
    }
    const adminRoles = await getUserRoles(adminFidNum);
    if (!isAdmin(adminRoles)) {
      return NextResponse.json(
        { error: "User does not have admin or superadmin role" },
        { status: 403 }
      );
    }

    // Only superadmin can remove superadmin role
    if (role === "superadmin" && !adminRoles.includes("superadmin")) {
      return NextResponse.json(
        { error: "Only superadmin can remove superadmin role" },
        { status: 403 }
      );
    }

    // Prevent removing your own admin/superadmin role
    if (adminFidNum === userFidNum && (role === "admin" || role === "superadmin")) {
      return NextResponse.json(
        { error: "Cannot remove your own admin or superadmin role" },
        { status: 400 }
      );
    }

    // Remove the role
    const result = await db
      .delete(userRoles)
      .where(and(eq(userRoles.userFid, userFidNum), eq(userRoles.role, role)));

    return NextResponse.json({
      success: true,
      message: `Role "${role}" removed from user ${userFidNum}`,
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Admin roles DELETE API error:", err.message || err);
    return NextResponse.json(
      { error: err.message || "Failed to remove role" },
      { status: 500 }
    );
  }
}

