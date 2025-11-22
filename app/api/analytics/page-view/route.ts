import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pageViews } from "@/lib/schema";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pagePath, userFid } = body;

    if (!pagePath) {
      return NextResponse.json(
        { error: "pagePath is required" },
        { status: 400 }
      );
    }

    // Insert page view (non-blocking, don't fail if it errors)
    try {
      await db.insert(pageViews).values({
        pagePath,
        userFid: userFid ? Number(userFid) : null,
      } as any);
    } catch (error) {
      // Log but don't fail - analytics shouldn't break the app
      console.error("Failed to track page view:", error);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Page view tracking error:", err.message || err);
    // Always return success to not break user experience
    return NextResponse.json({ success: false, error: err.message || "Failed to track page view" });
  }
}

