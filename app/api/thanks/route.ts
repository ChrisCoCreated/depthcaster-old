import { NextRequest, NextResponse } from "next/server";
import { neynarClient } from "@/lib/neynar";
import { db } from "@/lib/db";
import { castThanks, curatedCasts } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { getCuratorsForCast } from "@/lib/notifications";
import { getUser } from "@/lib/users";
import { findOriginalCuratedCast } from "@/lib/interactions";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { signerUuid, castHash } = body;

    if (!signerUuid || !castHash) {
      return NextResponse.json(
        { error: "signerUuid and castHash are required" },
        { status: 400 }
      );
    }

    // Get user FID from signer
    let userFid: number | undefined;
    try {
      const signer = await neynarClient.lookupSigner({ signerUuid });
      userFid = signer.fid;
    } catch (error) {
      console.error("[Thanks API] Error fetching signer:", error);
      return NextResponse.json(
        { error: "Failed to authenticate user" },
        { status: 401 }
      );
    }

    if (!userFid) {
      return NextResponse.json(
        { error: "User FID not found" },
        { status: 401 }
      );
    }

    // Find the original curated cast for this cast hash
    const curatedCastHash = await findOriginalCuratedCast(castHash);
    
    if (!curatedCastHash) {
      return NextResponse.json(
        { error: "Cast is not curated" },
        { status: 400 }
      );
    }

    // Verify the curated cast exists
    const curatedCast = await db
      .select()
      .from(curatedCasts)
      .where(eq(curatedCasts.castHash, curatedCastHash))
      .limit(1);

    if (curatedCast.length === 0) {
      return NextResponse.json(
        { error: "Curated cast not found" },
        { status: 404 }
      );
    }

    // Get all curators for this cast
    const curators = await getCuratorsForCast(curatedCastHash);

    if (curators.length === 0) {
      return NextResponse.json(
        { error: "No curators found for this cast" },
        { status: 400 }
      );
    }

    // Check if user has already thanked this cast
    const existingThanks = await db
      .select()
      .from(castThanks)
      .where(
        and(
          eq(castThanks.castHash, curatedCastHash),
          eq(castThanks.fromFid, userFid)
        )
      )
      .limit(1);

    if (existingThanks.length > 0) {
      // User has already thanked, remove the thanks (toggle off)
      await db
        .delete(castThanks)
        .where(
          and(
            eq(castThanks.castHash, curatedCastHash),
            eq(castThanks.fromFid, userFid)
          )
        );

      return NextResponse.json({ success: true, thanked: false });
    }

    // Get user info for notifications
    const user = await getUser(userFid);
    const castData = curatedCast[0].castData;

    // Insert thanks records for each curator
    const thanksRecords = curators.map((curatorFid) => ({
      castHash: curatedCastHash,
      fromFid: userFid,
      toFid: curatorFid,
    }));

    await db.insert(castThanks).values(thanksRecords);

    // Send notifications to all curators
    const { notifyCuratorsAboutThanks } = await import("@/lib/notifications");
    await notifyCuratorsAboutThanks(
      curatedCastHash,
      castData,
      userFid,
      user
    ).catch((error) => {
      console.error("[Thanks API] Error notifying curators:", error);
      // Don't fail the request if notification fails
    });

    return NextResponse.json({ success: true, thanked: true });
  } catch (error: any) {
    console.error("Thanks API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process thanks" },
      { status: 500 }
    );
  }
}

