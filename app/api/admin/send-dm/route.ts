import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, userRoles } from "@/lib/schema";
import { eq, asc } from "drizzle-orm";
import { isSuperAdmin, getUserRoles } from "@/lib/roles";
import { randomUUID } from "crypto";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { adminFid, recipientFid, message } = body;

    if (!adminFid || !recipientFid) {
      return NextResponse.json(
        { error: "adminFid and recipientFid are required" },
        { status: 400 }
      );
    }

    const adminFidNum = parseInt(adminFid);
    const recipientFidNum = parseInt(recipientFid);

    if (isNaN(adminFidNum) || isNaN(recipientFidNum)) {
      return NextResponse.json(
        { error: "Invalid fid" },
        { status: 400 }
      );
    }

    // Check if user has superadmin role
    const adminUser = await db.select().from(users).where(eq(users.fid, adminFidNum)).limit(1);
    if (adminUser.length === 0) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }
    const adminRoles = await getUserRoles(adminFidNum);
    if (!isSuperAdmin(adminRoles)) {
      return NextResponse.json(
        { error: "User does not have superadmin role" },
        { status: 403 }
      );
    }

    // Find the first user with superadmin role (ordered by role creation date, then by FID)
    const superadminRoles = await db
      .select({
        userFid: userRoles.userFid,
        createdAt: userRoles.createdAt,
      })
      .from(userRoles)
      .where(eq(userRoles.role, "superadmin"))
      .orderBy(asc(userRoles.createdAt), asc(userRoles.userFid));

    if (superadminRoles.length === 0) {
      return NextResponse.json(
        { error: "No superadmin user found" },
        { status: 404 }
      );
    }

    const firstSuperadminFid = superadminRoles[0].userFid;

    // Check if WARPCAST_API_KEY is set
    const warpcastApiKey = process.env.WARPCAST_API_KEY;
    if (!warpcastApiKey) {
      return NextResponse.json(
        { error: "WARPCAST_API_KEY is not configured" },
        { status: 500 }
      );
    }

    // Default message if not provided
    const defaultMessage = `Here's the app, currently in private beta.

www.depthcaster.com

I've given you Curator role - guide here: www.depthcaster.com/curators

I'd love any feedback, here, GC or by clicking the ? icon in the app header.

here is the group chat: https://farcaster.xyz/~/group/GpluEgXNiXtpW1XAO8ct5A

and lastly I recommend adding the mini-app so you get notifications over in Farcaster: https://farcaster.xyz/miniapps/HtUwgAw4iQ2x/depthcaster

thanks and looking forward to what you curate!`;

    const messageText = message || defaultMessage;

    // Generate idempotency key
    const idempotencyKey = randomUUID();

    // Send DM via Warpcast API
    const warpcastResponse = await fetch("https://api.warpcast.com/v2/ext-send-direct-cast", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${warpcastApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipientFid: recipientFidNum,
        message: messageText,
        idempotencyKey: idempotencyKey,
      }),
    });

    const warpcastData = await warpcastResponse.json();

    if (!warpcastResponse.ok) {
      console.error("Warpcast API error:", warpcastData);
      return NextResponse.json(
        { error: warpcastData.error || "Failed to send DM via Warpcast API" },
        { status: warpcastResponse.status }
      );
    }

    return NextResponse.json({
      success: true,
      message: "DM sent successfully",
      sentFromSuperadminFid: firstSuperadminFid,
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Send DM API error:", err.message || err);
    return NextResponse.json(
      { error: err.message || "Failed to send DM" },
      { status: 500 }
    );
  }
}

