import { NextRequest, NextResponse } from "next/server";
import { isAdmin, getUserRoles } from "@/lib/roles";

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
if (!NEYNAR_API_KEY) {
  throw new Error("NEYNAR_API_KEY is not set in environment variables");
}

interface NotificationToken {
  token: string;
  fid: number;
  created_at: string;
  updated_at: string;
  status?: string;
  [key: string]: any;
}

interface NeynarResponse {
  result?: {
    notification_tokens?: NotificationToken[];
    next?: {
      cursor?: string;
    };
  };
  notification_tokens?: NotificationToken[];
  next?: {
    cursor?: string;
  };
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const fid = searchParams.get("fid");
    const cursor = searchParams.get("cursor");
    const limit = parseInt(searchParams.get("limit") || "20");

    if (!fid) {
      return NextResponse.json({ error: "fid is required" }, { status: 400 });
    }

    const userFid = parseInt(fid);
    if (isNaN(userFid)) {
      return NextResponse.json({ error: "Invalid fid" }, { status: 400 });
    }

    // Check admin access
    const roles = await getUserRoles(userFid);
    if (!isAdmin(roles)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Build URL with pagination - ensure trailing slash is present
    let url = `https://api.neynar.com/v2/farcaster/frame/notification_tokens/?limit=${limit}`;
    if (cursor) {
      url += `&cursor=${cursor}`;
    }

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-api-key": NEYNAR_API_KEY!,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Neynar API error: ${response.status} ${errorText}` },
        { status: response.status }
      );
    }

    const data: NeynarResponse = await response.json();

    // Handle different response formats
    const tokens = data.result?.notification_tokens || data.notification_tokens || [];
    const nextCursor = data.result?.next?.cursor || data.next?.cursor;

    return NextResponse.json({
      notification_tokens: tokens,
      next_cursor: nextCursor,
      has_more: !!nextCursor,
    });
  } catch (error: any) {
    console.error("Failed to fetch miniapp notifications:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch miniapp notifications" },
      { status: 500 }
    );
  }
}

