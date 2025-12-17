import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userFid } = body;

    // Log miniapp open (non-blocking, don't fail if it errors)
    try {
      console.log(`[Miniapp Open] Depthcaster opened by user ${userFid || 'anonymous'}`);
    } catch (error) {
      // Log but don't fail - analytics shouldn't break the app
      console.error("Failed to log miniapp open:", error);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Miniapp open logging error:", err.message || err);
    // Always return success to not break user experience
    return NextResponse.json({ success: false, error: err.message || "Failed to log miniapp open" });
  }
}

