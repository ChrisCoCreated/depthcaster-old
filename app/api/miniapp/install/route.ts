import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { miniappInstallations } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fid } = body;

    if (!fid || typeof fid !== "number") {
      return NextResponse.json(
        { error: "fid is required and must be a number" },
        { status: 400 }
      );
    }

    // Check if already installed
    const existing = await db
      .select()
      .from(miniappInstallations)
      .where(eq(miniappInstallations.userFid, fid))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json({
        success: true,
        message: "Miniapp already installed",
        installed: true,
      });
    }

    // Insert installation record
    await db.insert(miniappInstallations).values({
      userFid: fid,
    });

    console.log(`[Miniapp] User ${fid} installed miniapp`);

    return NextResponse.json({
      success: true,
      message: "Miniapp installation recorded",
      installed: true,
    });
  } catch (error: unknown) {
    console.error("[Miniapp Install] Error:", error);
    const err = error as { message?: string };
    return NextResponse.json(
      { error: err.message || "Failed to record miniapp installation" },
      { status: 500 }
    );
  }
}




