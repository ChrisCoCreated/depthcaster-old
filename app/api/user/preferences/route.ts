import { NextRequest, NextResponse } from "next/server";
import { getUser, updateUserPreferences } from "@/lib/users";
import { neynarClient } from "@/lib/neynar";

const DEFAULT_HIDDEN_BOTS = ["betonbangers", "deepbot", "bracky", "hunttown.eth"];

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
    const preferences = (user?.preferences || {}) as { 
      hideBots?: boolean; 
      hiddenBots?: string[];
      autoLikeOnCurate?: boolean;
      hasSeenAutoLikeNotification?: boolean;
      notifyOnDeepbotCurate?: boolean;
      notifyOnQualityReply?: boolean;
      qualityReplyThreshold?: number;
      notifyOnCurated?: boolean;
      notifyOnLiked?: boolean;
      notifyOnRecast?: boolean;
    };
    
    // Ensure hiddenBots exists with defaults
    const hiddenBots = preferences.hiddenBots || DEFAULT_HIDDEN_BOTS;
    const hideBots = preferences.hideBots !== undefined ? preferences.hideBots : true;
    const autoLikeOnCurate = preferences.autoLikeOnCurate !== undefined ? preferences.autoLikeOnCurate : true;
    const hasSeenAutoLikeNotification = preferences.hasSeenAutoLikeNotification || false;
    const notifyOnDeepbotCurate = preferences.notifyOnDeepbotCurate !== undefined ? preferences.notifyOnDeepbotCurate : true;
    const notifyOnQualityReply = preferences.notifyOnQualityReply !== undefined ? preferences.notifyOnQualityReply : true;
    const qualityReplyThreshold = preferences.qualityReplyThreshold !== undefined ? preferences.qualityReplyThreshold : 60;
    const notifyOnCurated = preferences.notifyOnCurated !== undefined ? preferences.notifyOnCurated : false;
    const notifyOnLiked = preferences.notifyOnLiked !== undefined ? preferences.notifyOnLiked : false;
    const notifyOnRecast = preferences.notifyOnRecast !== undefined ? preferences.notifyOnRecast : false;

    return NextResponse.json({
      hideBots,
      hiddenBots,
      autoLikeOnCurate,
      hasSeenAutoLikeNotification,
      notifyOnDeepbotCurate,
      notifyOnQualityReply,
      qualityReplyThreshold,
      notifyOnCurated,
      notifyOnLiked,
      notifyOnRecast,
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
    const { fid, signerUuid, hideBots, hiddenBots, autoLikeOnCurate, hasSeenAutoLikeNotification, notifyOnDeepbotCurate, notifyOnQualityReply, qualityReplyThreshold, notifyOnCurated, notifyOnLiked, notifyOnRecast } = body;

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
    const existingPreferences = (user?.preferences || {}) as { 
      hideBots?: boolean; 
      hiddenBots?: string[];
      autoLikeOnCurate?: boolean;
      hasSeenAutoLikeNotification?: boolean;
      notifyOnDeepbotCurate?: boolean;
      notifyOnQualityReply?: boolean;
      qualityReplyThreshold?: number;
      notifyOnCurated?: boolean;
      notifyOnLiked?: boolean;
      notifyOnRecast?: boolean;
    };
    
    // Update preferences
    const updatedPreferences = {
      ...existingPreferences,
      hideBots: hideBots !== undefined ? hideBots : existingPreferences.hideBots,
      hiddenBots: hiddenBots !== undefined ? hiddenBots : existingPreferences.hiddenBots || DEFAULT_HIDDEN_BOTS,
      autoLikeOnCurate: autoLikeOnCurate !== undefined ? autoLikeOnCurate : existingPreferences.autoLikeOnCurate !== undefined ? existingPreferences.autoLikeOnCurate : true,
      hasSeenAutoLikeNotification: hasSeenAutoLikeNotification !== undefined ? hasSeenAutoLikeNotification : existingPreferences.hasSeenAutoLikeNotification,
      notifyOnDeepbotCurate: notifyOnDeepbotCurate !== undefined ? notifyOnDeepbotCurate : existingPreferences.notifyOnDeepbotCurate !== undefined ? existingPreferences.notifyOnDeepbotCurate : true,
      notifyOnQualityReply: notifyOnQualityReply !== undefined ? notifyOnQualityReply : existingPreferences.notifyOnQualityReply !== undefined ? existingPreferences.notifyOnQualityReply : true,
      qualityReplyThreshold: qualityReplyThreshold !== undefined ? qualityReplyThreshold : existingPreferences.qualityReplyThreshold !== undefined ? existingPreferences.qualityReplyThreshold : 60,
      notifyOnCurated: notifyOnCurated !== undefined ? notifyOnCurated : existingPreferences.notifyOnCurated !== undefined ? existingPreferences.notifyOnCurated : false,
      notifyOnLiked: notifyOnLiked !== undefined ? notifyOnLiked : existingPreferences.notifyOnLiked !== undefined ? existingPreferences.notifyOnLiked : false,
      notifyOnRecast: notifyOnRecast !== undefined ? notifyOnRecast : existingPreferences.notifyOnRecast !== undefined ? existingPreferences.notifyOnRecast : false,
    };

    await updateUserPreferences(fid, updatedPreferences);

    return NextResponse.json({
      hideBots: updatedPreferences.hideBots,
      hiddenBots: updatedPreferences.hiddenBots,
      autoLikeOnCurate: updatedPreferences.autoLikeOnCurate,
      hasSeenAutoLikeNotification: updatedPreferences.hasSeenAutoLikeNotification,
      notifyOnDeepbotCurate: updatedPreferences.notifyOnDeepbotCurate,
      notifyOnQualityReply: updatedPreferences.notifyOnQualityReply,
      qualityReplyThreshold: updatedPreferences.qualityReplyThreshold,
      notifyOnCurated: updatedPreferences.notifyOnCurated,
      notifyOnLiked: updatedPreferences.notifyOnLiked,
      notifyOnRecast: updatedPreferences.notifyOnRecast,
    });
  } catch (error: any) {
    console.error("Error updating user preferences:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update preferences" },
      { status: 500 }
    );
  }
}

