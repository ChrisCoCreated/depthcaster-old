import { NextRequest, NextResponse } from "next/server";
import { upsertUser, getUser } from "@/lib/users";
import { syncUserReactions } from "@/lib/reactions";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fid, signer_uuid } = body;

    if (!fid || typeof fid !== "number") {
      return NextResponse.json(
        { error: "fid is required and must be a number" },
        { status: 400 }
      );
    }

    // Check if user already exists before upserting
    const existingUser = await getUser(fid);
    const wasNewUser = !existingUser;

    // Upsert the user - this will create the record if it doesn't exist
    await upsertUser(fid, undefined, signer_uuid);

    // If this is a first-time login (user was just created), sync their reactions
    if (wasNewUser) {
      // Sync reactions asynchronously - don't block the response
      syncUserReactions(fid).catch((error) => {
        console.error(`[User Ensure] Error syncing reactions for new user ${fid}:`, error);
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error ensuring user exists:", error);
    return NextResponse.json(
      { error: error.message || "Failed to ensure user exists" },
      { status: 500 }
    );
  }
}










