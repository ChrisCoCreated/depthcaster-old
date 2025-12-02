import { NextRequest, NextResponse } from "next/server";
import { notifyAllMiniappUsersAboutNewCuratedCast, buildMiniappNotificationPayload } from "@/lib/miniapp";

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

    // Build the payload that will be sent
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://depthcaster.com";
    const targetUrl = `${appUrl}/`;
    const castText = testCastData?.text || "";
    const previewText = castText.length > 150 ? castText.substring(0, 150) + "..." : castText;
    const authorName = testCastData?.author?.display_name || testCastData?.author?.username || "Someone";
    const title = "New curated cast";
    const body = previewText || `${authorName} curated a cast`;
    
    const payload = buildMiniappNotificationPayload([], title, body, targetUrl);

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
