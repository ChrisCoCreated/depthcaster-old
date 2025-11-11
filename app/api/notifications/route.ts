import { NextRequest, NextResponse } from "next/server";
import { neynarClient } from "@/lib/neynar";
import { FetchAllNotificationsTypeEnum } from "@neynar/nodejs-sdk/build/api";
import { cacheNotifications } from "@/lib/cache";
import { deduplicateRequest } from "@/lib/neynar-batch";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const fid = searchParams.get("fid");
    const types = searchParams.get("types");
    const cursor = searchParams.get("cursor") || undefined;
    const requestedLimit = parseInt(searchParams.get("limit") || "25");
    const limit = Math.min(requestedLimit, 25); // API max is 25

    if (!fid) {
      return NextResponse.json(
        { error: "fid is required" },
        { status: 400 }
      );
    }

    // Map string types to enum values
    const notificationTypes = types
      ? types.split(",").map((t) => {
          const normalized = t.trim().toLowerCase();
          // Map to enum values
          switch (normalized) {
            case "follows":
              return FetchAllNotificationsTypeEnum.Follows;
            case "recasts":
              return FetchAllNotificationsTypeEnum.Recasts;
            case "likes":
              return FetchAllNotificationsTypeEnum.Likes;
            case "mentions":
            case "mention":
              return FetchAllNotificationsTypeEnum.Mentions;
            case "replies":
            case "reply":
              return FetchAllNotificationsTypeEnum.Replies;
            case "quotes":
            case "quote":
              return FetchAllNotificationsTypeEnum.Quotes;
            default:
              return normalized as FetchAllNotificationsTypeEnum;
          }
        }) as FetchAllNotificationsTypeEnum[]
      : undefined;

    // Generate cache key
    const cacheKey = cacheNotifications.generateKey({
      fid: parseInt(fid),
      types: types || "all",
      cursor,
      limit,
    });

    // Check cache first
    const cachedResult = cacheNotifications.get(cacheKey);
    if (cachedResult) {
      return NextResponse.json(cachedResult);
    }

    // Use deduplication to prevent concurrent duplicate requests
    const notifications = await deduplicateRequest(cacheKey, async () => {
      return await neynarClient.fetchAllNotifications({
        fid: parseInt(fid),
        type: notificationTypes,
        limit,
        cursor,
      });
    });

    // Cache the response
    cacheNotifications.set(cacheKey, notifications);

    return NextResponse.json(notifications);
  } catch (error: any) {
    console.error("Notifications API error:", error);
    console.error("Error details:", {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
    });
    return NextResponse.json(
      { 
        error: error.message || "Failed to fetch notifications",
        details: error.response?.data || error.message,
      },
      { status: error.response?.status || 500 }
    );
  }
}

