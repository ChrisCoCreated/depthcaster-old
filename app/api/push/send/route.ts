import { NextRequest, NextResponse } from "next/server";
import { sendPushNotificationToUser } from "@/lib/pushNotifications";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userFid, title, body: notificationBody, icon, badge, data } = body;

    if (!userFid || !title || !notificationBody) {
      return NextResponse.json(
        { error: "Missing required fields: userFid, title, body" },
        { status: 400 }
      );
    }

    const result = await sendPushNotificationToUser(userFid, {
      title,
      body: notificationBody,
      icon,
      badge,
      data,
    });

    if (result.total === 0) {
      return NextResponse.json(
        { error: "No push subscriptions found for this user" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      sent: result.sent,
      total: result.total,
    });
  } catch (error: any) {
    console.error("Error sending push notification:", error);
    return NextResponse.json(
      { error: error.message || "Failed to send push notification" },
      { status: 500 }
    );
  }
}

