import { NextRequest, NextResponse } from "next/server";
import { getClientForUser } from "@/lib/xmtp";
import { db } from "@/lib/db";
import { xmtpConversations, xmtpMessages } from "@/lib/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAddress, type Address } from "viem";
import { Conversation } from "@xmtp/xmtp-js";

export async function GET(request: NextRequest) {
  try {
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
        { status: 400 }
      );
    }

    // List conversations from XMTP
    const conversations = await client.conversations.list();

    // Get local conversation records
    const localConversations = await db
      .select()
      .from(xmtpConversations)
      .where(eq(xmtpConversations.userFid, fid));

    const localMap = new Map(
      localConversations.map((c) => [c.conversationId, c])
    );

    // Combine XMTP conversations with local data
    const result = await Promise.all(
      conversations.map(async (conv: Conversation) => {
        const topic = conv.topic;
        const local = localMap.get(topic);

        // Get last message for preview
        const messages = await conv.messages();
        const lastMessage = messages[messages.length - 1];

        // Determine conversation type and peer
        const peerAddress = conv.peerAddress || null;
        const isGroup = !peerAddress;

        return {
          conversationId: topic,
          peerAddress,
          type: isGroup ? "group" : "1:1",
          lastMessage: lastMessage
            ? {
                content: lastMessage.content,
                senderAddress: lastMessage.senderAddress,
                sentAt: lastMessage.sentAt,
              }
            : null,
          lastMessageAt: local?.lastMessageAt || null,
          createdAt: local?.createdAt || null,
        };
      })
    );

    // Sort by last message time
    result.sort((a, b) => {
      const timeA = a.lastMessageAt
        ? new Date(a.lastMessageAt).getTime()
        : 0;
      const timeB = b.lastMessageAt
        ? new Date(b.lastMessageAt).getTime()
        : 0;
      return timeB - timeA;
    });

    return NextResponse.json({ conversations: result });
  } catch (error: any) {
    console.error("Error listing conversations:", error);
    return NextResponse.json(
      { error: error.message || "Failed to list conversations" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userFid, walletAddress, peerAddress } = body;

    if (!userFid || !walletAddress || !peerAddress) {
      return NextResponse.json(
        { error: "userFid, walletAddress, and peerAddress are required" },
        { status: 400 }
      );
    }

    const address = getAddress(walletAddress as Address);
    const peer = getAddress(peerAddress as Address);
    const fid = parseInt(userFid, 10);

    // Get XMTP client
    const client = await getClientForUser(fid, address);
    if (!client) {
      return NextResponse.json(
        { error: "XMTP client not initialized. Please initialize first." },
        { status: 400 }
      );
    }

    // Check if address can receive messages
    const canMsg = await client.canMessage(peer);
    if (!canMsg) {
      return NextResponse.json(
        { error: "Address is not on XMTP network" },
        { status: 400 }
      );
    }

    // Create or get conversation
    const conversation = await client.conversations.newConversation(peer);
    const topic = conversation.topic;

    // Store in database
    const existing = await db
      .select()
      .from(xmtpConversations)
      .where(eq(xmtpConversations.conversationId, topic))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(xmtpConversations).values({
        userFid: fid,
        conversationId: topic,
        peerAddress: peer,
        type: "1:1",
      });
    }

    return NextResponse.json({
      conversationId: topic,
      peerAddress: peer,
      type: "1:1",
    });
  } catch (error: any) {
    console.error("Error creating conversation:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create conversation" },
      { status: 500 }
    );
  }
}

