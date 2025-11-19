import { NextRequest, NextResponse } from "next/server";
import { neynarClient } from "@/lib/neynar";
import { FetchAllNotificationsTypeEnum } from "@neynar/nodejs-sdk/build/api";
import { deduplicateRequest } from "@/lib/neynar-batch";
import { cacheNotifications } from "@/lib/cache";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fid: string }> }
) {
  try {
    const { fid: fidParam } = await params;
    const fid = parseInt(fidParam);
    const searchParams = request.nextUrl.searchParams;
    const cursor = searchParams.get("cursor") || undefined;
    const limit = parseInt(searchParams.get("limit") || "25");
    const viewerFid = searchParams.get("viewerFid")
      ? parseInt(searchParams.get("viewerFid")!)
      : undefined;

    if (isNaN(fid)) {
      return NextResponse.json(
        { error: "Invalid FID" },
        { status: 400 }
      );
    }

    // Check cache first (reuse notification cache if available)
    const cacheKey = cacheNotifications.generateKey({
      fid,
      types: "likes,recasts",
      cursor,
      limit,
    });
    const cachedResult = cacheNotifications.get(cacheKey);
    if (cachedResult) {
      // Extract interactions from cached notifications
      const interactions = (cachedResult.notifications || [])
        .map((notif: any) => {
          return {
            type: notif.type,
            cast: notif.cast,
            actor: notif.actor,
            timestamp: notif.timestamp || notif.created_at,
          };
        });
      return NextResponse.json({
        interactions,
        next: cachedResult.next ? { cursor: cachedResult.next.cursor } : null,
      });
    }

    // Fetch only likes and recasts notification types (more efficient than fetching all)
    const notifications = await deduplicateRequest(
      `user-interactions-${fid}-${viewerFid || "none"}-${cursor || "initial"}-${limit}`,
      async () => {
        return await neynarClient.fetchAllNotifications({
          fid,
          type: [FetchAllNotificationsTypeEnum.Likes, FetchAllNotificationsTypeEnum.Recasts],
          limit: Math.min(limit, 25),
          ...(cursor ? { cursor } : {}),
        });
      }
    );

    // Map to interactions format (no filtering needed since we already filtered by type)
    const interactions = (notifications.notifications || [])
      .map((notif: any) => {
        return {
          type: notif.type,
          cast: notif.cast,
          actor: notif.actor,
          timestamp: notif.timestamp || notif.created_at,
        };
      });

    // Cache the result
    cacheNotifications.set(cacheKey, notifications);

    return NextResponse.json({
      interactions,
      next: notifications.next ? { cursor: notifications.next.cursor } : null,
    });
  } catch (error: any) {
    console.error("Error fetching user interactions:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch user interactions" },
      { status: 500 }
    );
  }
}










