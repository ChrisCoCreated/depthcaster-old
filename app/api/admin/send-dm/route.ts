import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, userRoles } from "@/lib/schema";
import { eq, asc } from "drizzle-orm";
import { isSuperAdmin, getUserRoles } from "@/lib/roles";
import { randomUUID } from "crypto";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { adminFid, recipientFid, recipientFids, message } = body;

    // Support both single and bulk sending
    const isBulk = Array.isArray(recipientFids) && recipientFids.length > 0;
    const isSingle = recipientFid !== undefined && recipientFid !== null;

    if (!adminFid || (!isSingle && !isBulk)) {
      return NextResponse.json(
        { error: "adminFid and either recipientFid or recipientFids array are required" },
        { status: 400 }
      );
    }

    const adminFidNum = parseInt(adminFid);
    if (isNaN(adminFidNum)) {
      return NextResponse.json(
        { error: "Invalid adminFid" },
        { status: 400 }
      );
    }

    // For bulk sending, validate all FIDs
    let recipientFidsArray: number[] = [];
    if (isBulk) {
      recipientFidsArray = recipientFids
        .map((fid: any) => parseInt(fid))
        .filter((fid: number) => !isNaN(fid));
      
      if (recipientFidsArray.length === 0) {
        return NextResponse.json(
          { error: "No valid recipient FIDs provided" },
          { status: 400 }
        );
      }
    } else {
      const recipientFidNum = parseInt(recipientFid);
      if (isNaN(recipientFidNum)) {
        return NextResponse.json(
          { error: "Invalid recipientFid" },
          { status: 400 }
        );
      }
      recipientFidsArray = [recipientFidNum];
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

www.sopha.social

I've given you Curator role - guide here: www.sopha.social/faq

I'd love any feedback, here, GC or by clicking the ? icon in the app header.

here is the group chat: https://farcaster.xyz/~/group/GpluEgXNiXtpW1XAO8ct5A

and lastly I recommend adding the mini-app so you get notifications over in Farcaster: https://farcaster.xyz/miniapps/e8OvYCMqeXGJ/sopha

thanks and looking forward to what you curate!`;

    const messageText = message || defaultMessage;

    // Send DMs to all recipients
    const results: Array<{ fid: number; success: boolean; error?: string }> = [];
    let successCount = 0;
    let failureCount = 0;

    for (const recipientFidNum of recipientFidsArray) {
      try {
        // Generate unique idempotency key for each DM
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
          console.error(`Warpcast API error for FID ${recipientFidNum}:`, warpcastData);
          results.push({
            fid: recipientFidNum,
            success: false,
            error: warpcastData.error || "Failed to send DM via Warpcast API",
          });
          failureCount++;
        } else {
          results.push({
            fid: recipientFidNum,
            success: true,
          });
          successCount++;
        }

        // Small delay between requests to avoid rate limiting
        if (recipientFidsArray.length > 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } catch (error: any) {
        console.error(`Error sending DM to FID ${recipientFidNum}:`, error);
        results.push({
          fid: recipientFidNum,
          success: false,
          error: error.message || "Failed to send DM",
        });
        failureCount++;
      }
    }

    // For single recipient, return the original format for backward compatibility
    if (!isBulk) {
      const result = results[0];
      if (result.success) {
        return NextResponse.json({
          success: true,
          message: "DM sent successfully",
          sentFromSuperadminFid: firstSuperadminFid,
        });
      } else {
        return NextResponse.json(
          { error: result.error || "Failed to send DM" },
          { status: 500 }
        );
      }
    }

    // For bulk sending, return summary
    return NextResponse.json({
      success: true,
      message: `Sent ${successCount} DM(s), ${failureCount} failed`,
      sentFromSuperadminFid: firstSuperadminFid,
      results: {
        total: recipientFidsArray.length,
        success: successCount,
        failed: failureCount,
        details: results,
      },
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

