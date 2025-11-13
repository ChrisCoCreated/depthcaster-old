import { NextRequest, NextResponse } from "next/server";
import { getUser, updateUserPreferences } from "@/lib/users";
import { neynarClient } from "@/lib/neynar";

const DEFAULT_HIDDEN_BOTS = ["betonbangers", "deepbot", "bracky"];

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const fid = searchParams.get("fid") ? parseInt(searchParams.get("fid")!) : null;
    const signerUuid = searchParams.get("signerUuid");

    if (!fid || !signerUuid) {
      return NextResponse.json(
        { error: "fid and signerUuid are required" },
        { status: 400 }
      );
    }

    // Verify the user is accessing their own preferences
    const signer = await neynarClient.lookupSigner({ signerUuid });
    if (signer.fid !== fid) {
      return NextResponse.json(
        { error: "Unauthorized: Can only access your own preferences" },
        { status: 403 }
      );
    }

    const user = await getUser(fid);
    const preferences = (user?.preferences || {}) as { hideBots?: boolean; hiddenBots?: string[] };
    
    // Ensure hiddenBots exists with defaults
    const hiddenBots = preferences.hiddenBots || DEFAULT_HIDDEN_BOTS;
    const hideBots = preferences.hideBots !== undefined ? preferences.hideBots : true;

    return NextResponse.json({
      hideBots,
      hiddenBots,
    });
  } catch (error: any) {
    console.error("Error fetching user preferences:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch preferences" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { fid, signerUuid, hideBots, hiddenBots } = body;

    if (!fid || !signerUuid) {
      return NextResponse.json(
        { error: "fid and signerUuid are required" },
        { status: 400 }
      );
    }

    // Verify the user is updating their own preferences
    const signer = await neynarClient.lookupSigner({ signerUuid });
    if (signer.fid !== fid) {
      return NextResponse.json(
        { error: "Unauthorized: Can only update your own preferences" },
        { status: 403 }
      );
    }

    // Get existing preferences
    const user = await getUser(fid);
    const existingPreferences = (user?.preferences || {}) as { hideBots?: boolean; hiddenBots?: string[] };
    
    // Update preferences
    const updatedPreferences = {
      ...existingPreferences,
      hideBots: hideBots !== undefined ? hideBots : existingPreferences.hideBots,
      hiddenBots: hiddenBots !== undefined ? hiddenBots : existingPreferences.hiddenBots || DEFAULT_HIDDEN_BOTS,
    };

    await updateUserPreferences(fid, updatedPreferences);

    return NextResponse.json({
      hideBots: updatedPreferences.hideBots,
      hiddenBots: updatedPreferences.hiddenBots,
    });
  } catch (error: any) {
    console.error("Error updating user preferences:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update preferences" },
      { status: 500 }
    );
  }
}

