import { NextRequest, NextResponse } from "next/server";
import { syncUserReactionsIncremental } from "@/lib/reactions";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fid } = body;

    if (!fid || typeof fid !== "number") {
      return NextResponse.json(
        { error: "fid is required and must be a number" },
        { status: 400 }
      );
    }

    // Run incremental sync asynchronously - don't block the response
    syncUserReactionsIncremental(fid).catch((error) => {
      console.error(`[Incremental Reaction Sync API] Error syncing reactions for user ${fid}:`, error);
    });

    // Return immediately with success
    return NextResponse.json({ success: true, message: "Incremental sync started" });
  } catch (error: any) {
    console.error("Error starting incremental reaction sync:", error);
    return NextResponse.json(
      { error: error.message || "Failed to start incremental reaction sync" },
      { status: 500 }
    );
  }
}
