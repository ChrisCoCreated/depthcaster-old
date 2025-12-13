import { NextRequest, NextResponse } from "next/server";
import { getClientForUser } from "@/lib/xmtp";
import { db } from "@/lib/db";
import { xmtpConversations, xmtpMessages } from "@/lib/schema";
import { eq, and, desc } from "drizzle-orm";
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
    const limit = parseInt(searchParams.get("limit") || "50", 10);

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

    // Get conversation from XMTP
    const conversations = await client.conversations.list();
    const conversation = conversations.find((c) => c.topic === conversationId);

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    // Get messages from XMTP
    const messages = await conversation.messages({
      limit,
    });

    // Get local messages for persistence
    const localMessages = await db
      .select()
      .from(xmtpMessages)
      .where(eq(xmtpMessages.conversationId, conversationId))
      .orderBy(desc(xmtpMessages.sentAt))
      .limit(limit);

    // Combine and return XMTP messages (they're the source of truth)
    const result = messages.map((msg) => ({
      messageId: msg.id,
      conversationId,
      senderAddress: msg.senderAddress,
      content: msg.content,
      sentAt: msg.sentAt,
    }));

    return NextResponse.json({ messages: result });
  } catch (error: any) {
    console.error("Error getting messages:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get messages" },
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
    const { userFid, walletAddress, content } = body;

    if (!userFid || !walletAddress || !content) {
      return NextResponse.json(
        { error: "userFid, walletAddress, and content are required" },
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

    // Get conversation from XMTP
    const conversations = await client.conversations.list();
    const conversation = conversations.find((c) => c.topic === conversationId);

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    // Send message
    const sentMessage = await conversation.send(content);

    // Store message locally
    await db.insert(xmtpMessages).values({
      conversationId,
      messageId: sentMessage.id,
      senderAddress: sentMessage.senderAddress,
      content: typeof sentMessage.content === "string" 
        ? sentMessage.content 
        : JSON.stringify(sentMessage.content),
      sentAt: sentMessage.sentAt,
    }).onConflictDoNothing();

    // Update conversation last message time
    await db
      .update(xmtpConversations)
      .set({
        lastMessageAt: sentMessage.sentAt,
        updatedAt: new Date(),
      })
      .where(eq(xmtpConversations.conversationId, conversationId));

    return NextResponse.json({
      messageId: sentMessage.id,
      conversationId,
      senderAddress: sentMessage.senderAddress,
      content: sentMessage.content,
      sentAt: sentMessage.sentAt,
    });
  } catch (error: any) {
    console.error("Error sending message:", error);
    return NextResponse.json(
      { error: error.message || "Failed to send message" },
      { status: 500 }
    );
  }
}

