import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { miniappInstallations } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const fidParam = searchParams.get("fid");

    if (!fidParam) {
      return NextResponse.json(
        { error: "fid is required" },
        { status: 400 }
      );
    }

    const fid = parseInt(fidParam);
    if (isNaN(fid)) {
      return NextResponse.json(
        { error: "fid must be a number" },
        { status: 400 }
      );
    }

    const installation = await db
      .select()
      .from(miniappInstallations)
      .where(eq(miniappInstallations.userFid, fid))
      .limit(1);

    return NextResponse.json({
      installed: installation.length > 0,
    });
  } catch (error: unknown) {
    console.error("[Miniapp Check] Error:", error);
    const err = error as { message?: string };
    return NextResponse.json(
      { error: err.message || "Failed to check miniapp installation" },
      { status: 500 }
    );
  }
}
