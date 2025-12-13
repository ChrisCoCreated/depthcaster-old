import { NextRequest, NextResponse } from "next/server";
import { getClientForUser } from "@/lib/xmtp";
import { db } from "@/lib/db";
import { xmtpConversations, xmtpGroupMembers } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { getAddress, type Address } from "viem";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userFid, walletAddress, memberAddresses, groupName } = body;

    if (!userFid || !walletAddress || !memberAddresses || !Array.isArray(memberAddresses)) {
      return NextResponse.json(
        { error: "userFid, walletAddress, and memberAddresses array are required" },
        { status: 400 }
      );
    }

    if (memberAddresses.length === 0) {
      return NextResponse.json(
        { error: "At least one member address is required" },
        { status: 400 }
      );
    }

    const address = getAddress(walletAddress as Address);
    const fid = parseInt(userFid, 10);

    // Get XMTP client
    const client = await getClientForUser(fid, address);
    if (!client) {
      return NextResponse.json(
        { error: "XMTP client not initialized. Please initialize first." },
        { status: 400 }
      );
    }

    // Validate all member addresses
    const validatedMembers = memberAddresses.map((addr: string) => getAddress(addr as Address));
    
    // Include the creator in the group
    const allMembers = [address, ...validatedMembers];
    const uniqueMembers = Array.from(new Set(allMembers));

    // Create group conversation
    // Note: XMTP group creation API may vary - this is a simplified version
    // In practice, you'd use client.conversations.createGroup() or similar
    const conversation = await (client.conversations as any).createGroup?.({
      members: uniqueMembers,
      permissions: {
        add: true,
        remove: true,
      },
    });

    if (!conversation) {
      // Fallback: create a 1:1 conversation and mark as group
      // This is a workaround if group creation isn't available
      return NextResponse.json(
        { error: "Group creation not yet supported in this XMTP version" },
        { status: 501 }
      );
    }

    const topic = conversation.topic || conversation.id;

    // Store conversation in database
    const existing = await db
      .select()
      .from(xmtpConversations)
      .where(eq(xmtpConversations.conversationId, topic))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(xmtpConversations).values({
        userFid: fid,
        conversationId: topic,
        groupId: topic, // Use topic as group ID
        type: "group",
      });

      // Store group members
      for (const member of uniqueMembers) {
        await db.insert(xmtpGroupMembers).values({
          conversationId: topic,
          memberAddress: member,
        }).onConflictDoNothing();
      }
    }

    return NextResponse.json({
      conversationId: topic,
      groupId: topic,
      type: "group",
      members: uniqueMembers,
    });
  } catch (error: any) {
    console.error("Error creating group:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create group" },
      { status: 500 }
    );
  }
}

