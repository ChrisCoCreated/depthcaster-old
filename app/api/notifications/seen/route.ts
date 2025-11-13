import { NextRequest, NextResponse } from "next/server";
import { neynarClient } from "@/lib/neynar";
import { NotificationType } from "@neynar/nodejs-sdk/build/api";
import { cacheNotifications } from "@/lib/cache";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { signerUuid, notificationType } = body;

    if (!signerUuid) {
      return NextResponse.json(
        { error: "signerUuid is required" },
        { status: 400 }
      );
    }

    // Map notification type to enum if provided
    let mappedType: NotificationType | undefined;
    if (notificationType) {
      const normalized = notificationType.toLowerCase();
      switch (normalized) {
        case "follows":
          mappedType = NotificationType.Follows;
          break;
        case "recasts":
          mappedType = NotificationType.Recasts;
          break;
        case "likes":
          mappedType = NotificationType.Likes;
          break;
        case "mentions":
        case "mention":
          mappedType = NotificationType.Mentions;
          break;
        case "replies":
        case "reply":
          mappedType = NotificationType.Replies;
          break;
        case "quotes":
        case "quote":
          mappedType = NotificationType.Quotes;
          break;
        default:
          mappedType = notificationType as NotificationType;
      }
    }

    const result = await neynarClient.markNotificationsAsSeen({
      signerUuid,
      type: mappedType,
    });

    // Clear notification cache to force fresh fetch
    cacheNotifications.clear();

    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    console.error("Mark notifications as seen API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to mark notifications as seen" },
      { status: 500 }
    );
  }
}

