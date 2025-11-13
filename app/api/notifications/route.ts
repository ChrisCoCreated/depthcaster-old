import { NextRequest, NextResponse } from "next/server";
import { neynarClient } from "@/lib/neynar";
import { FetchAllNotificationsTypeEnum } from "@neynar/nodejs-sdk/build/api";
import { cacheNotifications } from "@/lib/cache";
import { deduplicateRequest } from "@/lib/neynar-batch";
import { db } from "@/lib/db";
import { userNotifications } from "@/lib/schema";
import { eq, desc, and, lt, inArray } from "drizzle-orm";

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

    // Check for cache-busting parameter
    const cacheBust = searchParams.get("_t");
    
    // Generate cache key (excluding cache-busting parameter)
    const cacheKey = cacheNotifications.generateKey({
      fid: parseInt(fid),
      types: types || "all",
      cursor,
      limit,
    });

    // Check cache first (skip if cache-busting parameter is present)
    if (!cacheBust) {
      const cachedResult = cacheNotifications.get(cacheKey);
      if (cachedResult) {
        return NextResponse.json(cachedResult);
      }
    }

    // Fetch Neynar notifications
    const neynarNotifications = await deduplicateRequest(cacheKey, async () => {
      return await neynarClient.fetchAllNotifications({
        fid: parseInt(fid),
        type: notificationTypes,
        limit,
        cursor,
      });
    });

    // Fetch webhook-based notifications (user watches - parent casts only)
    // Include webhook notifications for all notification types (they're cast.created events)
    const webhookWhereConditions = [
      eq(userNotifications.userFid, parseInt(fid)),
      eq(userNotifications.isRead, false),
    ];

    // Apply cursor if provided
    if (cursor) {
      try {
        const cursorDate = new Date(cursor);
        webhookWhereConditions.push(lt(userNotifications.createdAt, cursorDate));
      } catch {
        // Invalid cursor, ignore it
      }
    }

    const webhookResults = await db
      .select()
      .from(userNotifications)
      .where(and(...webhookWhereConditions))
      .orderBy(desc(userNotifications.createdAt))
      .limit(limit);

    // Convert webhook notifications to Neynar notification format
    const webhookNotifications = webhookResults.map((notif) => {
      const castData = notif.castData as any;
      return {
        object: "notification",
        type: "cast.created",
        fid: notif.userFid,
        timestamp: notif.createdAt.toISOString(),
        cast: castData,
        actor: {
          fid: notif.authorFid,
          username: castData.author?.username,
          display_name: castData.author?.display_name,
          pfp_url: castData.author?.pfp_url,
        },
      };
    });

    // Merge notifications: webhook notifications first (newer), then Neynar notifications
    // Sort by timestamp descending
    const allNotifications = [...webhookNotifications, ...(neynarNotifications.notifications || [])];
    allNotifications.sort((a, b) => {
      const getTimestamp = (notif: any): string | number => {
        if ('timestamp' in notif && typeof notif.timestamp === 'string') {
          return notif.timestamp;
        }
        if ('created_at' in notif && typeof notif.created_at === 'string') {
          return notif.created_at;
        }
        return 0;
      };
      const timeA = new Date(getTimestamp(a)).getTime();
      const timeB = new Date(getTimestamp(b)).getTime();
      return timeB - timeA;
    });

    // Limit to requested limit
    const limitedNotifications = allNotifications.slice(0, limit);

    // Mark webhook notifications as read (only the ones we're returning)
    if (webhookResults.length > 0 && limitedNotifications.length > 0) {
      const returnedWebhookHashes = new Set(
        limitedNotifications
          .filter((n) => n.type === "cast.created" && webhookResults.some((wr) => wr.castHash === n.cast?.hash))
          .map((n) => n.cast?.hash)
          .filter(Boolean)
      );

      const readIds = webhookResults
        .filter((wr) => returnedWebhookHashes.has(wr.castHash))
        .map((wr) => wr.id);

      if (readIds.length > 0) {
        await db
          .update(userNotifications)
          .set({ isRead: true })
          .where(inArray(userNotifications.id, readIds));
      }
    }

    const response = {
      ...neynarNotifications,
      notifications: limitedNotifications,
    };

    // Cache the response
    cacheNotifications.set(cacheKey, response);

    return NextResponse.json(response);
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

