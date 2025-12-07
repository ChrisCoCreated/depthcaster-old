import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { castHash, userFid } = body;

    if (!castHash) {
      return NextResponse.json(
        { error: "castHash is required" },
        { status: 400 }
      );
    }

    // Log notification click (non-blocking, don't fail if it errors)
    try {
      console.log(`[Miniapp Notification Click] User ${userFid || 'anonymous'} clicked notification for cast ${castHash}`);
    } catch (error) {
      // Log but don't fail - analytics shouldn't break the app
      console.error("Failed to log notification click:", error);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Notification click logging error:", err.message || err);
    // Always return success to not break user experience
    return NextResponse.json({ success: false, error: err.message || "Failed to log notification click" });
  }
}
