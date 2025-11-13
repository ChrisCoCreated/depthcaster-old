import { NextRequest, NextResponse } from "next/server";
import { neynarClient } from "@/lib/neynar";
import { deduplicateRequest } from "@/lib/neynar-batch";

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

    // Fetch user's notifications which include interactions
    // Note: This is a simplified approach - Neynar may have a specific interactions endpoint
    const notifications = await deduplicateRequest(
      `user-interactions-${fid}-${viewerFid || "none"}-${cursor || "initial"}-${limit}`,
      async () => {
        return await neynarClient.fetchAllNotifications({
          fid,
          limit: Math.min(limit, 25),
          ...(cursor ? { cursor } : {}),
        });
      }
    );

    // Filter to only interaction types (likes, recasts)
    const interactions = (notifications.notifications || [])
      .filter((notif: any) => {
        const type = String(notif.type).toLowerCase();
        return type === "likes" || type === "recasts";
      })
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




