import { NextRequest, NextResponse } from "next/server";
import { notifyAllMiniappUsersAboutNewCuratedCast } from "@/lib/miniapp";

export async function POST(request: NextRequest) {
  try {
    // Create test cast data
    const testCastData = {
      text: "This is a test curated cast notification. Click to view the miniapp feed!",
      author: {
        fid: 1,
        username: "testuser",
        display_name: "Test User",
        pfp_url: null,
      },
    };

    const testCastHash = `test-${Date.now()}`;

    // Send test notification
    const result = await notifyAllMiniappUsersAboutNewCuratedCast(
      testCastHash,
      testCastData
    );

    return NextResponse.json({
      success: true,
      sent: result.sent,
      errors: result.errors,
      message: `Test miniapp notification sent! ${result.sent} notification(s) delivered, ${result.errors} error(s).`,
    });
  } catch (error: any) {
    console.error("[Admin] Error sending test miniapp notification:", error);
    return NextResponse.json(
      { error: error.message || "Failed to send test miniapp notification" },
      { status: 500 }
    );
  }
}
