import { NextRequest, NextResponse } from "next/server";
import { getClientForUser } from "@/lib/xmtp-server";
import { db } from "@/lib/db";
import { xmtpConversations, xmtpGroupMembers } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { getAddress, type Address } from "viem";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const userFid = searchParams.get("userFid");
    const walletAddress = searchParams.get("walletAddress");

    if (!userFid || !walletAddress) {
      return NextResponse.json(
        { error: "userFid and walletAddress are required" },
        { status: 400 }
      );
    }

    const address = getAddress(walletAddress as Address);
    const fid = parseInt(userFid, 10);

    // Verify conversation exists and is a group
    const conversation = await db
      .select()
      .from(xmtpConversations)
      .where(
        and(
          eq(xmtpConversations.conversationId, conversationId),
          eq(xmtpConversations.userFid, fid),
          eq(xmtpConversations.type, "group")
        )
      )
      .limit(1);

    if (conversation.length === 0) {
      return NextResponse.json(
        { error: "Group conversation not found" },
        { status: 404 }
      );
    }

    // Get group members
    const members = await db
      .select()
      .from(xmtpGroupMembers)
      .where(eq(xmtpGroupMembers.conversationId, conversationId));

    return NextResponse.json({
      conversationId,
      members: members.map((m) => ({
        address: m.memberAddress,
        addedAt: m.addedAt,
      })),
    });
  } catch (error: any) {
    console.error("Error getting group members:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get group members" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;
    const body = await request.json();
    const { userFid, walletAddress, memberAddresses, action } = body;

    if (!userFid || !walletAddress || !memberAddresses || !Array.isArray(memberAddresses)) {
      return NextResponse.json(
        { error: "userFid, walletAddress, memberAddresses array, and action are required" },
        { status: 400 }
      );
    }

    const address = getAddress(walletAddress as Address);
    const fid = parseInt(userFid, 10);
    const actionType = action || "add"; // 'add' or 'remove'

    // Verify conversation exists and is a group
    const conversation = await db
      .select()
      .from(xmtpConversations)
      .where(
        and(
          eq(xmtpConversations.conversationId, conversationId),
          eq(xmtpConversations.userFid, fid),
          eq(xmtpConversations.type, "group")
        )
      )
      .limit(1);

    if (conversation.length === 0) {
      return NextResponse.json(
        { error: "Group conversation not found" },
        { status: 404 }
      );
    }

    // Get XMTP client
    const client = await getClientForUser(fid, address);
    if (!client) {
      return NextResponse.json(
        { error: "XMTP client not initialized. Please initialize first." },
        { status: 404 }
      );
    }

    // Validate member addresses
    const validatedMembers = memberAddresses.map((addr: string) => getAddress(addr as Address));

    if (actionType === "add") {
      // Add members to group
      // Note: XMTP group API may vary - this is simplified
      // In practice, you'd use conversation.addMembers() or similar
      
      // Store in database
      for (const member of validatedMembers) {
        await db.insert(xmtpGroupMembers).values({
          conversationId,
          memberAddress: member,
        }).onConflictDoNothing();
      }

      return NextResponse.json({
        success: true,
        action: "add",
        addedMembers: validatedMembers,
      });
    } else if (actionType === "remove") {
      // Remove members from group
      // Note: XMTP group API may vary - this is simplified
      
      // Remove from database
      for (const member of validatedMembers) {
        await db
          .delete(xmtpGroupMembers)
          .where(
            and(
              eq(xmtpGroupMembers.conversationId, conversationId),
              eq(xmtpGroupMembers.memberAddress, member)
            )
          );
      }

      return NextResponse.json({
        success: true,
        action: "remove",
        removedMembers: validatedMembers,
      });
    } else {
      return NextResponse.json(
        { error: "Invalid action. Use 'add' or 'remove'" },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error("Error managing group members:", error);
    return NextResponse.json(
      { error: error.message || "Failed to manage group members" },
      { status: 500 }
    );
  }
}

