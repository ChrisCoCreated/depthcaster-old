import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, userRoles, signInLogs } from "@/lib/schema";
import { eq, and, ilike, isNotNull, sql, inArray } from "drizzle-orm";
import { isAdmin, getUserRoles } from "@/lib/roles";

// GET - List users who have logged in but don't have curator or plus roles
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const adminFid = searchParams.get("adminFid");
    const searchQuery = searchParams.get("q");
    const filter = searchParams.get("filter") || "both"; // 'curator', 'plus', or 'both'

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

    // Get distinct user FIDs who have successfully logged in
    const loggedInUsers = await db
      .selectDistinct({
        userFid: signInLogs.userFid,
      })
      .from(signInLogs)
      .where(eq(signInLogs.success, true));

    const loggedInFids = loggedInUsers
      .map((u) => u.userFid)
      .filter((fid): fid is number => fid !== null);

    if (loggedInFids.length === 0) {
      return NextResponse.json({ users: [] });
    }

    // Get users with their roles
    let query = db
      .select({
        fid: users.fid,
        username: users.username,
        displayName: users.displayName,
        pfpUrl: users.pfpUrl,
        role: userRoles.role,
      })
      .from(users)
      .leftJoin(userRoles, eq(users.fid, userRoles.userFid))
      .where(inArray(users.fid, loggedInFids));

    // If search query provided, filter by username
    if (searchQuery && searchQuery.length >= 2) {
      query = query.where(
        and(
          inArray(users.fid, loggedInFids),
          isNotNull(users.username),
          ilike(users.username, `%${searchQuery}%`)
        )
      ) as any;
    }

    const results = await query;

    // Get last login time for each user
    const lastLoginQuery = await db
      .select({
        userFid: signInLogs.userFid,
        lastLogin: sql<Date>`MAX(${signInLogs.createdAt})`.as("last_login"),
      })
      .from(signInLogs)
      .where(
        and(
          eq(signInLogs.success, true),
          inArray(signInLogs.userFid, loggedInFids)
        )
      )
      .groupBy(signInLogs.userFid);

    const lastLoginMap = new Map<number, Date>();
    for (const row of lastLoginQuery) {
      if (row.userFid) {
        lastLoginMap.set(row.userFid, row.lastLogin);
      }
    }

    // Group by user and collect roles
    const userMap = new Map<number, {
      fid: number;
      username: string | null;
      displayName: string | null;
      pfpUrl: string | null;
      roles: string[];
      lastLogin: Date | null;
    }>();

    for (const row of results) {
      if (!userMap.has(row.fid)) {
        userMap.set(row.fid, {
          fid: row.fid,
          username: row.username,
          displayName: row.displayName,
          pfpUrl: row.pfpUrl,
          roles: [],
          lastLogin: lastLoginMap.get(row.fid) || null,
        });
      }
      if (row.role) {
        userMap.get(row.fid)!.roles.push(row.role);
      }
    }

    // Filter users based on filter parameter
    const usersWithRoles = Array.from(userMap.values()).filter((user) => {
      const hasCurator = user.roles.includes("curator");
      const hasPlus = user.roles.includes("plus");

      if (filter === "curator") {
        return !hasCurator;
      } else if (filter === "plus") {
        return !hasPlus;
      } else {
        // filter === "both" (default)
        return !hasCurator && !hasPlus;
      }
    });

    // Sort by last login (most recent first), then by username
    const sortedUsers = usersWithRoles
      .map((user) => ({
        ...user,
        lastLogin: user.lastLogin ? user.lastLogin.toISOString() : null,
      }))
      .sort((a, b) => {
        // First sort by last login (most recent first)
        if (!a.lastLogin && !b.lastLogin) {
          const aUsername = a.username || "";
          const bUsername = b.username || "";
          return aUsername.localeCompare(bUsername);
        }
        if (!a.lastLogin) return 1; // a goes after b
        if (!b.lastLogin) return -1; // b goes after a

        const aTime = new Date(a.lastLogin).getTime();
        const bTime = new Date(b.lastLogin).getTime();
        if (aTime !== bTime) {
          return bTime - aTime; // Most recent first
        }

        // If same login time, sort by username
        const aUsername = a.username || "";
        const bUsername = b.username || "";
        return aUsername.localeCompare(bUsername);
      });

    return NextResponse.json({ users: sortedUsers });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Admin users without roles API error:", err.message || err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch users without roles" },
      { status: 500 }
    );
  }
}

