import { NextRequest, NextResponse } from "next/server";
import { neynarClient } from "@/lib/neynar";
import { FetchAllNotificationsTypeEnum } from "@neynar/nodejs-sdk/build/api";
import { cacheNotifications, cacheNotificationCount } from "@/lib/cache";
import { deduplicateRequest } from "@/lib/neynar-batch";
import { db } from "@/lib/db";
import { userNotifications } from "@/lib/schema";
import { eq, desc, and, lt, inArray } from "drizzle-orm";
import { getUserRoles, hasPlusRole } from "@/lib/roles";

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

    // TEMPORARY: Block notifications for user 5406
    const BLOCKED_USER_FID = 5406;
    if (parseInt(fid) === BLOCKED_USER_FID) {
      return NextResponse.json({
        notifications: [],
        next: null,
      });
    }

    // Map string types to enum values
    // If types is an empty string, user has disabled all Neynar notification types
    const notificationTypes = types
      ? types.split(",")
          .map((t) => t.trim())
          .filter((t) => t.length > 0)
          .map((t) => {
            const normalized = t.toLowerCase();
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
    
    // If user has explicitly disabled all Neynar notification types, skip Neynar API call
    const hasNeynarTypesSelected = notificationTypes && notificationTypes.length > 0;

    // Check if user has plus role (required for Neynar notifications)
    let hasPlus = false;
    if (fid) {
      const userRoles = await getUserRoles(parseInt(fid));
      hasPlus = hasPlusRole(userRoles);
    }

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

    // Track total Neynar notifications loaded (max 100)
    // Parse cursor to get count of Neynar notifications already loaded
    let neynarCountLoaded = 0;
    const MAX_NEYNAR_NOTIFICATIONS = 100;
    let originalNeynarCursor: string | undefined = cursor;
    
    if (cursor) {
      try {
        const urlDecoded = decodeURIComponent(cursor);
        const decoded = Buffer.from(urlDecoded, 'base64').toString('utf-8');
        const cursorData = JSON.parse(decoded);
        // Check if cursor contains neynar_count (our custom tracking)
        if (cursorData.neynar_count !== undefined) {
          neynarCountLoaded = parseInt(cursorData.neynar_count) || 0;
          // Extract original Neynar cursor (without our custom fields)
          // Remove neynar_count and reconstruct the original cursor
          const { neynar_count: _, ...originalCursorData } = cursorData;
          // Re-encode the original cursor without our custom field
          originalNeynarCursor = Buffer.from(JSON.stringify(originalCursorData)).toString('base64');
        }
      } catch {
        // Not our custom cursor format, use cursor as-is (it's the original Neynar cursor)
        originalNeynarCursor = cursor;
      }
    }

    // Fetch Neynar notifications only if:
    // 1. User has plus role
    // 2. User has selected Neynar notification types
    // 3. We haven't reached the max of 100 Neynar notifications
    const shouldFetchNeynar = hasPlus && hasNeynarTypesSelected && neynarCountLoaded < MAX_NEYNAR_NOTIFICATIONS;
    const neynarNotifications = shouldFetchNeynar
      ? await deduplicateRequest(cacheKey, async () => {
          // Calculate how many more we can fetch (don't exceed 100 total)
          const remainingNeynarLimit = Math.min(limit, MAX_NEYNAR_NOTIFICATIONS - neynarCountLoaded);
          if (remainingNeynarLimit <= 0) {
            return { notifications: [], next: null };
          }
          
          // Use the original Neynar cursor (without our custom fields) for the API call
          return await neynarClient.fetchAllNotifications({
            fid: parseInt(fid),
            type: notificationTypes,
            limit: remainingNeynarLimit,
            cursor: originalNeynarCursor,
          });
        })
      : { notifications: [], next: null };

    const newNeynarCount = neynarCountLoaded + (neynarNotifications.notifications?.length || 0);
    console.log(`[Notifications] Found ${neynarNotifications.notifications?.length || 0} Neynar notification(s) for user ${fid}, types: ${types || (hasNeynarTypesSelected ? 'all' : 'none selected')}, total loaded: ${newNeynarCount}/${MAX_NEYNAR_NOTIFICATIONS}`);

    // Fetch webhook-based notifications (user watches - parent casts only)
    // Include webhook notifications for all notification types (they're cast.created events)
    // Note: Fetch both read and unread to show in feed, but mark unread status correctly
    // Fetch more webhook notifications to ensure good mix after merging
    const webhookWhereConditions = [
      eq(userNotifications.userFid, parseInt(fid)),
    ];

    // Apply cursor if provided
    // Neynar cursor is base64-encoded JSON with most_recent_timestamp
    if (cursor) {
      try {
        // Try to decode base64 cursor (may be URL-encoded)
        let cursorTimestamp: string | null = null;
        try {
          // Decode URL encoding first if present
          const urlDecoded = decodeURIComponent(cursor);
          const decoded = Buffer.from(urlDecoded, 'base64').toString('utf-8');
          const cursorData = JSON.parse(decoded);
          cursorTimestamp = cursorData.most_recent_timestamp;
        } catch {
          // If not base64 JSON, try parsing as direct date string
          try {
            const urlDecoded = decodeURIComponent(cursor);
            cursorTimestamp = urlDecoded;
          } catch {
            cursorTimestamp = cursor;
          }
        }
        
        if (cursorTimestamp) {
          const cursorDate = new Date(cursorTimestamp);
          if (!isNaN(cursorDate.getTime())) {
            webhookWhereConditions.push(lt(userNotifications.createdAt, cursorDate));
          }
        }
      } catch {
        // Invalid cursor, ignore it
      }
    }

    // Fetch more webhook notifications to ensure good mix when merged with Neynar notifications
    const webhookResults = await db
      .select()
      .from(userNotifications)
      .where(and(...webhookWhereConditions))
      .orderBy(desc(userNotifications.createdAt))
      .limit(limit * 2); // Fetch more to ensure good mix after merging
    
    console.log(`[Notifications] Found ${webhookResults.length} webhook notification(s) for user ${fid}`);

    // Convert webhook notifications to Neynar notification format
    const webhookNotifications = webhookResults
      .filter((notif) => notif.createdAt != null) // Filter out invalid dates
      .map((notif) => {
        const castData = notif.castData as any;
        const timestamp = notif.createdAt instanceof Date 
          ? notif.createdAt.toISOString()
          : new Date(notif.createdAt).toISOString();
        
        // Handle curated cast notification types
        const notificationType = notif.type || "cast.created";
        const isCuratedNotification = notificationType.startsWith("curated.");
        
        // For curated notifications, use the actor from castData._actor if available
        // Otherwise fall back to authorFid/castData.author
        const actorInfo = isCuratedNotification && castData?._actor
          ? {
              fid: castData._actor.fid,
              username: castData._actor.username || castData._actor.display_name,
              display_name: castData._actor.display_name || castData._actor.username,
              pfp_url: castData._actor.pfp_url,
            }
          : {
              fid: notif.authorFid,
              username: castData?.author?.username || castData?.author?.display_name,
              display_name: castData?.author?.display_name || castData?.author?.username,
              pfp_url: castData?.author?.pfp_url,
            };

        return {
          object: "notification",
          type: notificationType,
          fid: notif.userFid,
          timestamp,
          most_recent_timestamp: timestamp, // Add for display compatibility
          cast: castData,
          castHash: notif.castHash, // Include castHash for curated notifications
          castData: castData, // Include castData for curated notifications
          actor: actorInfo,
          seen: notif.isRead, // Include seen status
        };
      });

    // Merge notifications: webhook notifications first (newer), then Neynar notifications
    // Sort by timestamp descending
    const allNotifications = [...webhookNotifications, ...(neynarNotifications.notifications || [])];
    allNotifications.sort((a, b) => {
      const getTimestamp = (notif: any): string | number => {
        // Try multiple timestamp fields
        if ('timestamp' in notif && typeof notif.timestamp === 'string') {
          return notif.timestamp;
        }
        if ('most_recent_timestamp' in notif && typeof notif.most_recent_timestamp === 'string') {
          return notif.most_recent_timestamp;
        }
        if ('created_at' in notif && typeof notif.created_at === 'string') {
          return notif.created_at;
        }
        // Fallback to 0 for invalid timestamps (will sort to end)
        return 0;
      };
      const timeA = new Date(getTimestamp(a)).getTime();
      const timeB = new Date(getTimestamp(b)).getTime();
      // Handle invalid dates
      if (isNaN(timeA) && isNaN(timeB)) return 0;
      if (isNaN(timeA)) return 1; // Invalid dates go to end
      if (isNaN(timeB)) return -1;
      return timeB - timeA;
    });
    
    console.log(`[Notifications] Merged ${allNotifications.length} total notifications (${webhookNotifications.length} webhook + ${neynarNotifications.notifications?.length || 0} Neynar)`);

    // Limit to requested limit
    const limitedNotifications = allNotifications.slice(0, limit);

    // Mark webhook notifications as read ONLY if they're unread and being returned
    // This allows them to persist in the feed until explicitly marked as read
    if (webhookResults.length > 0 && limitedNotifications.length > 0) {
      const returnedWebhookHashes = new Set(
        limitedNotifications
          .filter((n) => n.type === "cast.created" && webhookResults.some((wr) => wr.castHash === n.cast?.hash))
          .map((n) => n.cast?.hash)
          .filter(Boolean)
      );

      // Only mark as read if they were previously unread
      const readIds = webhookResults
        .filter((wr) => returnedWebhookHashes.has(wr.castHash) && !wr.isRead)
        .map((wr) => wr.id);

      if (readIds.length > 0) {
        console.log(`[Notifications] Marking ${readIds.length} webhook notification(s) as read`);
        await db
          .update(userNotifications)
          .set({ isRead: true })
          .where(inArray(userNotifications.id, readIds));
        
        // Invalidate count cache since unread count changed
        cacheNotificationCount.invalidateUser(parseInt(fid));
      }
    }

    // Generate cursor for webhook notifications if there are more available
    // Only generate cursor if we actually have more webhooks beyond what we've shown
    let webhookCursor: string | null = null;
    
    // Only generate webhook cursor if we fetched exactly limit * 2 webhooks
    // This indicates there might be more (if we got fewer, we've reached the end)
    if (webhookResults.length === limit * 2 && limitedNotifications.length > 0) {
      // Use the last notification's timestamp from limitedNotifications (what user actually sees)
      // This ensures the cursor points to the right place for pagination
      const lastNotification = limitedNotifications[limitedNotifications.length - 1];
      const getTimestamp = (notif: any): string | null => {
        if (notif.most_recent_timestamp) return notif.most_recent_timestamp;
        if (notif.timestamp) return notif.timestamp;
        if (notif.created_at) return notif.created_at;
        return null;
      };
      
      const timestamp = getTimestamp(lastNotification);
      if (timestamp) {
        // Create cursor in Neynar format (base64-encoded JSON)
        const cursorData = {
          most_recent_timestamp: timestamp,
          neynar_count: newNeynarCount, // Track Neynar count in cursor
        };
        webhookCursor = Buffer.from(JSON.stringify(cursorData)).toString('base64');
      }
    }

    // Merge cursors: prefer Neynar cursor if available, otherwise use webhook cursor
    // If Neynar has reached max (100), only use webhook cursor
    let nextCursor: string | null = null;
    if (neynarNotifications.next?.cursor && newNeynarCount < MAX_NEYNAR_NOTIFICATIONS) {
      // Neynar has more and we haven't hit the limit - use Neynar cursor with updated count
      try {
        const neynarCursorDecoded = Buffer.from(neynarNotifications.next.cursor, 'base64').toString('utf-8');
        const neynarCursorData = JSON.parse(neynarCursorDecoded);
        const mergedCursorData = {
          ...neynarCursorData,
          neynar_count: newNeynarCount,
        };
        nextCursor = Buffer.from(JSON.stringify(mergedCursorData)).toString('base64');
      } catch {
        // If we can't parse Neynar cursor, create new one with our tracking
        const cursorData = {
          most_recent_timestamp: neynarNotifications.next.cursor, // Fallback: use cursor as-is if it's a timestamp
          neynar_count: newNeynarCount,
        };
        nextCursor = Buffer.from(JSON.stringify(cursorData)).toString('base64');
      }
    } else if (webhookCursor) {
      // No more Neynar notifications (or hit limit), but we have more webhooks
      nextCursor = webhookCursor;
    } else if (neynarNotifications.next?.cursor && newNeynarCount >= MAX_NEYNAR_NOTIFICATIONS) {
      // We've hit the Neynar limit but there might be more webhooks - check if we have more
      // If no webhook cursor, we're done
      nextCursor = null;
    }

    const response = {
      notifications: limitedNotifications,
      next: nextCursor ? { cursor: nextCursor } : null,
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

