import { NextRequest, NextResponse } from "next/server";
import { upsertUser, getUser } from "@/lib/users";
import { syncUserReactions } from "@/lib/reactions";
import { neynarClient } from "@/lib/neynar";
import { logSignIn } from "@/lib/signInLogs";

export async function POST(request: NextRequest) {
  let body: any = {};
  try {
    body = await request.json();
    const { fid, signer_uuid } = body;

    if (!fid || typeof fid !== "number") {
      return NextResponse.json(
        { error: "fid is required and must be a number" },
        { status: 400 }
      );
    }

    // Check if user already exists and has a stored signer
    const existingUser = await getUser(fid);
    const wasNewUser = !existingUser;
    let effectiveSignerUuid: string | null = null;

    // If user has a stored signer, verify it's still valid
    if (existingUser?.signerUuid) {
      try {
        // Verify the stored signer is still valid by looking it up
        const signer = await neynarClient.lookupSigner({ signerUuid: existingUser.signerUuid });
        
        // Check if signer belongs to this FID and is approved
        if (signer.fid === fid && signer.status === "approved") {
          effectiveSignerUuid = existingUser.signerUuid;
        }
      } catch (error) {
        // Signer lookup failed (might be revoked/deleted), use new one
      }
    }

    // If no valid stored signer exists, use the new one from login (if provided)
    if (!effectiveSignerUuid && signer_uuid) {
      effectiveSignerUuid = signer_uuid;
    }

    // Upsert the user - upsertUser will preserve existing signerUuid if one exists
    // Only pass signer_uuid if we don't have a stored one
    await upsertUser(fid, undefined, effectiveSignerUuid || undefined);

    // If this is a first-time login (user was just created), sync their reactions
    if (wasNewUser) {
      // Sync reactions asynchronously - don't block the response
      syncUserReactions(fid).catch((error) => {
        console.error(`[User Ensure] Error syncing reactions for new user ${fid}:`, error);
      });
    }

    // Final check: compare stored signer with new one from login
    const finalUser = await getUser(fid);
    const storedSignerInDb = finalUser?.signerUuid;
    const signersMatch = storedSignerInDb === signer_uuid;

    const responseData = {
      success: true,
      signer_uuid: effectiveSignerUuid,
      signers_match: signersMatch,
    };

    // Log the sign-in event with request and response data
    logSignIn({
      userFid: fid,
      requestData: { fid, signer_uuid },
      responseData,
      signerUuid: effectiveSignerUuid || undefined,
      success: true,
    }).catch((error) => {
      console.error(`[User Ensure] Error logging sign-in event for user ${fid}:`, error);
    });

    return NextResponse.json(responseData);
  } catch (error: any) {
    console.error("Error ensuring user exists:", error);
    
    // Log the failed sign-in attempt
    logSignIn({
      userFid: body.fid,
      requestData: body,
      responseData: null,
      signerUuid: body.signer_uuid,
      success: false,
      error: error.message || "Failed to ensure user exists",
    }).catch((logError) => {
      console.error("Error logging failed sign-in event:", logError);
    });

    return NextResponse.json(
      { error: error.message || "Failed to ensure user exists" },
      { status: 500 }
    );
  }
}










