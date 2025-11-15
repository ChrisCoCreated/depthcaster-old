import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { isAdmin, isSuperAdmin, getUserRoles } from "@/lib/roles";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const fid = searchParams.get("fid");

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

    const user = await db.select().from(users).where(eq(users.fid, userFid)).limit(1);
    
    if (user.length === 0) {
      return NextResponse.json({ isAdmin: false, isSuperAdmin: false });
    }

    const roles = await getUserRoles(userFid);
    const adminStatus = isAdmin(roles);
    const superAdminStatus = isSuperAdmin(roles);

    return NextResponse.json({
      isAdmin: adminStatus,
      isSuperAdmin: superAdminStatus,
      roles: roles.length > 0 ? roles : null,
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Admin check API error:", err.message || err);
    return NextResponse.json(
      { error: err.message || "Failed to check admin status" },
      { status: 500 }
    );
  }
}

