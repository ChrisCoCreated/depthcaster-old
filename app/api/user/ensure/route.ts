import { NextRequest, NextResponse } from "next/server";
import { upsertUser, getUser } from "@/lib/users";
import { syncUserReactions } from "@/lib/reactions";
import { neynarClient } from "@/lib/neynar";

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

    console.log(`[User Ensure] ===== PROCESSING USER ENSURE REQUEST =====`);
    console.log(`[User Ensure] FID: ${fid}`);
    console.log(`[User Ensure] New signer from login: ${signer_uuid || "none"}`);

    // Check if user already exists and has a stored signer
    const existingUser = await getUser(fid);
    const wasNewUser = !existingUser;
    let effectiveSignerUuid: string | null = null;

    if (wasNewUser) {
      console.log(`[User Ensure] New user - no stored signer exists`);
    } else {
      console.log(`[User Ensure] Existing user found`);
      console.log(`[User Ensure] Stored signer UUID: ${existingUser?.signerUuid || "none"}`);
    }

    // If user has a stored signer, verify it's still valid
    if (existingUser?.signerUuid) {
      console.log(`[User Ensure] Verifying stored signer ${existingUser.signerUuid}...`);
      try {
        // Verify the stored signer is still valid by looking it up
        const signer = await neynarClient.lookupSigner({ signerUuid: existingUser.signerUuid });
        
        console.log(`[User Ensure] Signer lookup result:`, {
          signer_uuid: signer.signer_uuid,
          fid: signer.fid,
          status: signer.status,
          public_key: signer.public_key?.substring(0, 20) + "...",
        });
        
        // Check if signer belongs to this FID and is approved
        if (signer.fid === fid && signer.status === "approved") {
          effectiveSignerUuid = existingUser.signerUuid;
          console.log(`[User Ensure] ✅ Stored signer is VALID and APPROVED`);
          console.log(`[User Ensure]   Using stored signer: ${effectiveSignerUuid}`);
          console.log(`[User Ensure]   New signer from login will be IGNORED: ${signer_uuid}`);
        } else {
          console.log(`[User Ensure] ❌ Stored signer is INVALID or NOT APPROVED`);
          console.log(`[User Ensure]   Reason: fid match=${signer.fid === fid}, status=${signer.status}`);
          console.log(`[User Ensure]   Will use new signer from login instead`);
        }
      } catch (error: any) {
        // Signer lookup failed (might be revoked/deleted), use new one
        console.log(`[User Ensure] ❌ Failed to verify stored signer (lookup error)`);
        console.log(`[User Ensure]   Error: ${error.message || error}`);
        console.log(`[User Ensure]   Will use new signer from login instead`);
      }
    } else {
      console.log(`[User Ensure] No stored signer found for this user`);
    }

    // If no valid stored signer exists, use the new one from login (if provided)
    if (!effectiveSignerUuid && signer_uuid) {
      effectiveSignerUuid = signer_uuid;
      console.log(`[User Ensure] ✅ Using NEW signer from login: ${effectiveSignerUuid}`);
      console.log(`[User Ensure]   ⚠️  This is a NEW signer created by Neynar during this login`);
    } else if (!effectiveSignerUuid) {
      console.log(`[User Ensure] ⚠️  No signer available (no stored signer and no new signer provided)`);
    }

    // Upsert the user - upsertUser will preserve existing signerUuid if one exists
    // Only pass signer_uuid if we don't have a stored one
    console.log(`[User Ensure] Upserting user with effective signer: ${effectiveSignerUuid || "none"}`);
    await upsertUser(fid, undefined, effectiveSignerUuid || undefined);

    // If this is a first-time login (user was just created), sync their reactions
    if (wasNewUser) {
      console.log(`[User Ensure] First-time login - syncing reactions asynchronously`);
      // Sync reactions asynchronously - don't block the response
      syncUserReactions(fid).catch((error) => {
        console.error(`[User Ensure] Error syncing reactions for new user ${fid}:`, error);
      });
    }

    console.log(`[User Ensure] ===== USER ENSURE COMPLETE =====`);
    console.log(`[User Ensure] Returning effective signer UUID: ${effectiveSignerUuid || "none"}`);

    return NextResponse.json({ 
      success: true,
      signer_uuid: effectiveSignerUuid, // Return the effective signer UUID the app should use
    });
  } catch (error: any) {
    console.error("Error ensuring user exists:", error);
    return NextResponse.json(
      { error: error.message || "Failed to ensure user exists" },
      { status: 500 }
    );
  }
}










