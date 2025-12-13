import { NextRequest, NextResponse } from "next/server";
import { getClientForUser } from "@/lib/xmtp-server";
import { db } from "@/lib/db";
import { xmtpConversations } from "@/lib/schema";
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

    // Get XMTP client
    const client = await getClientForUser(fid, address);
    if (!client) {
      return NextResponse.json(
        { error: "XMTP client not initialized. Please initialize first." },
        { status: 404 }
      );
    }

    // Get conversation from XMTP
    let conversations: any[] = [];
    try {
      conversations = await client.conversations.list();
    } catch (error: any) {
      console.error("Error listing conversations:", error);
      return NextResponse.json(
        { error: "Failed to list conversations" },
        { status: 500 }
      );
    }
    
    const conversation = conversations.find((c) => c.topic === conversationId);

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    // Get local conversation record
    const local = await db
      .select()
      .from(xmtpConversations)
      .where(
        and(
          eq(xmtpConversations.conversationId, conversationId),
          eq(xmtpConversations.userFid, fid)
        )
      )
      .limit(1);

    return NextResponse.json({
      conversationId: conversation.topic,
      peerAddress: conversation.peerAddress || null,
      type: conversation.peerAddress ? "1:1" : "group",
      createdAt: local[0]?.createdAt || null,
      lastMessageAt: local[0]?.lastMessageAt || null,
    });
  } catch (error: any) {
    console.error("Error getting conversation:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get conversation" },
      { status: 500 }
    );
  }
}

