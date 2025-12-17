import { NextRequest, NextResponse } from "next/server";
import { notifyAllMiniappUsersAboutNewCuratedCast, buildMiniappNotificationPayload } from "@/lib/miniapp";

export async function POST(request: NextRequest) {
  try {
    console.log("[Admin] Test miniapp notification endpoint called");
    
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
    console.log(`[Admin] Test cast hash: ${testCastHash}`);

    // Build the payload that will be sent (for display purposes - actual payload is built in notifyAllMiniappUsersAboutNewCuratedCast)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sopha.social";
    const targetUrl = `${appUrl}/`;
    const castText = testCastData?.text || "";
    const previewText = castText.length > 150 ? castText.substring(0, 150) + "..." : castText;
    const authorName = testCastData?.author?.display_name || testCastData?.author?.username || "Someone";
    const title = "New curated cast";
    const body = previewText || `${authorName} curated a cast`;
    
    const payload = buildMiniappNotificationPayload([], title, body, targetUrl);
    console.log(`[Admin] Example payload (empty target_fids for display):`, JSON.stringify(payload, null, 2));

    // Send test notification
    console.log(`[Admin] Calling notifyAllMiniappUsersAboutNewCuratedCast...`);
    const result = await notifyAllMiniappUsersAboutNewCuratedCast(
      testCastHash,
      testCastData
    );

    console.log(`[Admin] Test notification result:`, {
      sent: result.sent,
      errors: result.errors,
      queued: result.queued,
    });

    return NextResponse.json({
      success: true,
      sent: result.sent,
      errors: result.errors,
      queued: result.queued,
      message: `Test miniapp notification sent! ${result.sent} notification(s) delivered, ${result.errors} error(s), ${result.queued} queued.`,
      payload: payload,
    });
  } catch (error: any) {
    console.error("[Admin] Error sending test miniapp notification:", error);
    
    // Extract detailed error information
    let errorMessage = error.message || "Failed to send test miniapp notification";
    let errorDetails: any = null;
    let statusCode = 500;
    
    if (error.response) {
      // Axios error with response
      statusCode = error.response.status || 500;
      errorDetails = {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
      };
      
      if (error.response.data?.message) {
        errorMessage = error.response.data.message;
      }
      if (error.response.data?.errors) {
        const errorsStr = JSON.stringify(error.response.data.errors, null, 2);
        errorMessage += `\nValidation errors:\n${errorsStr}`;
      }
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    // Ensure error details are serializable
    const serializedErrorDetails = errorDetails ? JSON.parse(JSON.stringify(errorDetails)) : null;
    
    return NextResponse.json(
      { 
        error: errorMessage,
        errorDetails: serializedErrorDetails,
      },
      { status: statusCode }
    );
  }
}
