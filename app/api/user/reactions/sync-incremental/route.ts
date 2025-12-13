import { NextRequest, NextResponse } from "next/server";
import { syncUserReactionsIncremental } from "@/lib/reactions";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fid } = body;

    console.log("[Like Fetch] Sync-incremental API called:", {
      fid,
      hasFid: !!fid,
      fidType: typeof fid,
    });

    if (!fid || typeof fid !== "number") {
      console.error("[Like Fetch] Sync-incremental API - Invalid fid:", {
        fid,
        fidType: typeof fid,
      });
      return NextResponse.json(
        { error: "fid is required and must be a number" },
        { status: 400 }
      );
    }

    console.log("[Like Fetch] Starting incremental sync for user:", { fid });

    // Run incremental sync asynchronously - don't block the response
    syncUserReactionsIncremental(fid)
      .then((stats) => {
        console.log(`[Incremental Reaction Sync API] Completed for user ${fid}:`, {
          fid,
          stats,
          likesSynced: stats.likesSynced,
          recastsSynced: stats.recastsSynced,
          errors: stats.errors,
        });
      })
      .catch((error) => {
        console.error(`[Incremental Reaction Sync API] Error syncing reactions for user ${fid}:`, {
          fid,
          error: error.message,
          stack: error.stack,
        });
      });

    // Return immediately with success and informative message
    return NextResponse.json({ 
      success: true, 
      message: "Checking for new reactions since last sync...",
      status: "processing"
    });
  } catch (error: any) {
    console.error("[Like Fetch] Sync-incremental API error:", {
      error: error.message,
      stack: error.stack,
    });
    return NextResponse.json(
      { error: error.message || "Failed to start incremental reaction sync" },
      { status: 500 }
    );
  }
}




















